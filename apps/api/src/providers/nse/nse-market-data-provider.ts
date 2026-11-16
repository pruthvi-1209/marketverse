import { env } from "../../config/env";
import { logger } from "../../core/logger/logger";
import { DataUnavailableError, ProviderUnavailableError } from "../../core/errors/app-error";
import { marketCache } from "../../core/utils/cache";
import { toIstTradingDate } from "../../core/utils/time";
import type {
  HistoryRequest,
  MarketDataProvider,
  MarketQuoteProvider,
  MarketBreadthProvider,
  HistoricalDataProvider,
  MoversRequest,
  NormalizedBreadth,
  NormalizedCandle,
  NormalizedIndexHistoryPoint,
  NormalizedIndexQuote,
  NormalizedMovers,
  NormalizedQuote,
  NormalizedSymbolMatch,
  ProviderHealth,
  QuoteRequest,
} from "../types";
import { McpServerConnection, type DiscoveredTool } from "./client/mcp-server-connection";
import {
  bulkQuoteResponseSchema,
  cmLiveIndicesResponseSchema,
  cmMoversResponseSchema,
  cmStockQuoteResponseSchema,
  indexHistoryResponseSchema,
  indexSnapshotResponseSchema,
  marketBreadthResponseSchema,
  stockHistoryResponseSchema,
  symbolSearchResponseSchema,
  topMoversResponseSchema,
  weekRangeResponseSchema,
} from "./schemas";
import {
  mapBreadth,
  mapBulkQuote,
  mapCmIndexRow,
  mapCmMovers,
  mapCmStockQuote,
  mapHistoryRow,
  mapIndexHistoryRow,
  mapIndexSnapshotRow,
  mapSymbolSearchRow,
  mapTopMovers,
  mapWeekRange,
  mergeMovers,
  type MapperContext,
} from "./mappers/normalize";
import {
  NSE_DELAY_CLASSIFICATION,
  NSE_SERVER_LABELS,
  NSE_TOOL_CAPABILITIES,
} from "./tool-catalog";

const BHAVCOPY = "nse-bhavcopy" as const;
const CM_MARKET = "nse-cm-market" as const;

export class NseMarketDataProvider
  implements MarketDataProvider, MarketQuoteProvider, HistoricalDataProvider, MarketBreadthProvider
{
  readonly name = "nse";

  readonly bhavcopy: McpServerConnection;
  readonly cmMarket: McpServerConnection;

  constructor() {
    this.bhavcopy = new McpServerConnection({
      key: BHAVCOPY,
      label: NSE_SERVER_LABELS[BHAVCOPY],
      url: env.NSE_BHAVCOPY_MCP_URL,
      enabled: env.NSE_MCP_ENABLED,
      timeoutMs: env.NSE_MCP_TIMEOUT_MS,
      maxRetries: env.NSE_MCP_MAX_RETRIES,
      cacheTtlMs: env.NSE_TOOL_CACHE_TTL_MS,
    });
    this.cmMarket = new McpServerConnection({
      key: CM_MARKET,
      label: NSE_SERVER_LABELS[CM_MARKET],
      url: env.NSE_MARKET_MCP_URL,
      enabled: env.NSE_MCP_ENABLED,
      timeoutMs: env.NSE_MCP_TIMEOUT_MS,
      maxRetries: env.NSE_MCP_MAX_RETRIES,
      cacheTtlMs: env.NSE_TOOL_CACHE_TTL_MS,
    });
  }

  private context(server: "nse-bhavcopy" | "nse-cm-market", tool: string): MapperContext {
    return {
      provider: "nse",
      tool,
      retrievedAt: new Date(),
      delayClassification: NSE_DELAY_CLASSIFICATION[server],
      includeRaw: env.NSE_ALLOW_RAW_RESPONSE_STORAGE,
    };
  }

  private today(): string {
    return toIstTradingDate(new Date());
  }

  async getQuote(request: QuoteRequest): Promise<NormalizedQuote> {
    const symbol = request.symbol.trim().toUpperCase();
    const cacheKey = `nse:quote:${symbol}`;
    const cached = marketCache.get<NormalizedQuote>(cacheKey);
    if (cached) return cached;

    const tool = NSE_TOOL_CAPABILITIES[CM_MARKET].stockQuote;
    try {
      const { data } = await this.cmMarket.invoke(tool, { symbol }, cmStockQuoteResponseSchema);
      const quote = mapCmStockQuote(data, this.context(CM_MARKET, tool));
      if (!quote) throw new DataUnavailableError(`NSE returned no quote for ${symbol}`);
      marketCache.set(cacheKey, quote, env.CACHE_TTL_QUOTE_SECONDS * 1000);
      return quote;
    } catch (error) {
      logger.warn({ err: error, symbol }, "CM market quote failed; falling back to bhavcopy");
      const fallbackTool = NSE_TOOL_CAPABILITIES[BHAVCOPY].bulkQuote;
      const { data } = await this.bhavcopy.invoke(fallbackTool, { symbols: [symbol] }, bulkQuoteResponseSchema);
      const row = data.quotes.find((quoteRow) => quoteRow.symbol?.toUpperCase() === symbol);
      const quote = row ? mapBulkQuote(row, this.context(BHAVCOPY, fallbackTool)) : null;
      if (!quote) {
        throw new DataUnavailableError(`NSE returned no quote for ${symbol}`, {
          providers: [CM_MARKET, BHAVCOPY],
        });
      }
      marketCache.set(cacheKey, quote, env.CACHE_TTL_QUOTE_SECONDS * 1000);
      return quote;
    }
  }

  async getQuotes(symbols: string[]): Promise<NormalizedQuote[]> {
    const uniqueSymbols = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()))].filter(
      (symbol) => symbol.length > 0,
    );
    if (uniqueSymbols.length === 0) return [];

    const tool = NSE_TOOL_CAPABILITIES[BHAVCOPY].bulkQuote;
    const results: NormalizedQuote[] = [];
    for (let index = 0; index < uniqueSymbols.length; index += 50) {
      const chunk = uniqueSymbols.slice(index, index + 50);
      const { data } = await this.bhavcopy.invoke(tool, { symbols: chunk }, bulkQuoteResponseSchema);
      for (const row of data.quotes) {
        const quote = mapBulkQuote(row, this.context(BHAVCOPY, tool));
        if (quote) {
          results.push(quote);
          marketCache.set(`nse:quote:${quote.symbol}`, quote, env.CACHE_TTL_QUOTE_SECONDS * 1000);
        }
      }
    }
    return results;
  }

  async getDailyHistory(request: HistoryRequest): Promise<NormalizedCandle[]> {
    const symbol = request.symbol.trim().toUpperCase();
    const requestedMonths = Math.max(1, Math.min(request.months ?? 12, 24));
    const cacheKey = `nse:history:${symbol}:${requestedMonths}:${request.endDate ?? "today"}`;
    const cached = marketCache.get<NormalizedCandle[]>(cacheKey);
    if (cached) return cached;

    const tool = NSE_TOOL_CAPABILITIES[BHAVCOPY].stockHistory;
    const mapContext = this.context(BHAVCOPY, tool);
    const candles = new Map<string, NormalizedCandle>();
    let endDate = request.endDate ?? "today";
    const maxChunks = Math.ceil(requestedMonths / 3) + 1;

    for (let chunk = 0; chunk < maxChunks; chunk += 1) {
      const args: Record<string, unknown> = { symbol, months: 3, endDate };
      const { data } = await this.bhavcopy.invoke(tool, args, stockHistoryResponseSchema);
      for (const row of data.data) {
        const candle = mapHistoryRow(row, symbol, mapContext);
        if (candle) candles.set(candle.tradingDate, candle);
      }
      const next = data.next_end_date;
      if (!next || typeof next !== "string" || next.length === 0) break;
      endDate = next;
    }

    const sorted = [...candles.values()].sort((a, b) => a.tradingDate.localeCompare(b.tradingDate));
    marketCache.set(cacheKey, sorted, env.CACHE_TTL_HISTORY_SECONDS * 1000);
    return sorted;
  }

  async getIndexHistory(indexName: string, months: number): Promise<NormalizedIndexHistoryPoint[]> {
    const tool = NSE_TOOL_CAPABILITIES[BHAVCOPY].indexHistory;
    const cacheKey = `nse:index-history:${indexName}:${months}`;
    const cached = marketCache.get<NormalizedIndexHistoryPoint[]>(cacheKey);
    if (cached) return cached;

    const context = this.context(BHAVCOPY, tool);
    const points = new Map<string, NormalizedIndexHistoryPoint>();
    let endDate = "today";
    const maxChunks = Math.ceil(Math.max(1, Math.min(months, 24)) / 12) + 1;

    for (let chunk = 0; chunk < maxChunks; chunk += 1) {
      const { data } = await this.bhavcopy.invoke(
        tool,
        { indexName, months: Math.min(months, 12), endDate },
        indexHistoryResponseSchema,
      );
      for (const row of data.data) {
        const point = mapIndexHistoryRow(row, context);
        if (point) points.set(point.tradingDate, point);
      }
      const next = (data as { next_end_date?: unknown }).next_end_date;
      if (typeof next !== "string" || next.length === 0) break;
      endDate = next;
    }

    const sorted = [...points.values()].sort((a, b) => a.tradingDate.localeCompare(b.tradingDate));
    marketCache.set(cacheKey, sorted, env.CACHE_TTL_HISTORY_SECONDS * 1000);
    return sorted;
  }

  async getBreadth(date?: string): Promise<NormalizedBreadth> {
    const tool = NSE_TOOL_CAPABILITIES[BHAVCOPY].marketBreadth;
    const tradingDate = date ?? this.today();
    const cacheKey = `nse:breadth:${tradingDate}`;
    const cached = marketCache.get<NormalizedBreadth>(cacheKey);
    if (cached) return cached;

    const { data } = await this.bhavcopy.invoke(tool, { date: tradingDate }, marketBreadthResponseSchema);
    const breadth = mapBreadth(data, this.context(BHAVCOPY, tool));
    if (!breadth) throw new DataUnavailableError("NSE returned an unusable market breadth payload");
    marketCache.set(cacheKey, breadth, env.CACHE_TTL_MARKET_SECONDS * 1000);
    return breadth;
  }

  async getMovers(request: MoversRequest = {}): Promise<NormalizedMovers> {
    const date = request.date ?? this.today();
    const limit = Math.min(Math.max(request.limit ?? 20, 1), 50);
    const cacheKey = `nse:movers:${date}:${limit}`;
    const cached = marketCache.get<NormalizedMovers>(cacheKey);
    if (cached) return cached;

    const tool = NSE_TOOL_CAPABILITIES[BHAVCOPY].topMovers;
    const context = this.context(BHAVCOPY, tool);
    try {
      const [gainResult, lossResult] = await Promise.all([
        this.bhavcopy.invoke(tool, { date, n: limit, direction: "gain" }, topMoversResponseSchema),
        this.bhavcopy.invoke(tool, { date, n: limit, direction: "loss" }, topMoversResponseSchema),
      ]);
      const gainers = mapTopMovers(gainResult.data, context, "gainers");
      const losers = mapTopMovers(lossResult.data, context, "losers");
      const tradingDate =
        (gainResult.data.date as string | undefined) ?? (lossResult.data.date as string | undefined) ?? date;
      const movers = mergeMovers(gainers, losers, context, tradingDate);
      marketCache.set(cacheKey, movers, env.CACHE_TTL_MARKET_SECONDS * 1000);
      return movers;
    } catch (error) {
      logger.warn({ err: error }, "Bhavcopy movers failed; trying CM market movers");
      const cmTool = NSE_TOOL_CAPABILITIES[CM_MARKET].marketMovers;
      const cmContext = this.context(CM_MARKET, cmTool);
      const { data } = await this.cmMarket.invoke(
        cmTool,
        { indexName: "", limit },
        cmMoversResponseSchema,
      );
      const gainers = mapCmMovers(data, cmContext, "gainers");
      const losers = mapCmMovers(data, cmContext, "losers");
      const movers = mergeMovers(gainers, losers, cmContext, this.today());
      marketCache.set(cacheKey, movers, env.CACHE_TTL_MARKET_SECONDS * 1000);
      return movers;
    }
  }

  async searchSymbols(query: string): Promise<NormalizedSymbolMatch[]> {
    const tool = NSE_TOOL_CAPABILITIES[BHAVCOPY].searchSymbols;
    const context = this.context(BHAVCOPY, tool);
    const { data } = await this.bhavcopy.invoke(tool, { query }, symbolSearchResponseSchema);
    return data.results
      .map((row) => mapSymbolSearchRow(row, context))
      .filter((match): match is NormalizedSymbolMatch => match !== null);
  }

  async getIndices(options: { group?: string; nameFilter?: string } = {}): Promise<NormalizedIndexQuote[]> {
    const group = options.group ?? "broad";
    const nameFilter = options.nameFilter ?? "";
    const cacheKey = `nse:indices:${group}:${nameFilter}`;
    const cached = marketCache.get<NormalizedIndexQuote[]>(cacheKey);
    if (cached) return cached;

    const tool = NSE_TOOL_CAPABILITIES[CM_MARKET].liveIndices;
    const context = this.context(CM_MARKET, tool);
    try {
      const { data } = await this.cmMarket.invoke(
        tool,
        { group, nameFilter },
        cmLiveIndicesResponseSchema,
      );
      const rows = Object.values(data.indices).flat();
      const filtered = nameFilter
        ? rows.filter((row) => row.indexName.toLowerCase().includes(nameFilter.toLowerCase()))
        : rows;
      const indices = filtered
        .map((row) => mapCmIndexRow(row, context))
        .filter((index): index is NormalizedIndexQuote => index !== null);
      if (indices.length === 0) {
        throw new DataUnavailableError("NSE returned no index rows for the requested filter");
      }
      marketCache.set(cacheKey, indices, env.CACHE_TTL_MARKET_SECONDS * 1000);
      return indices;
    } catch (error) {
      logger.warn({ err: error, group, nameFilter }, "CM index feed failed; falling back to bhavcopy snapshot");
      const snapshotTool = NSE_TOOL_CAPABILITIES[BHAVCOPY].indexSnapshot;
      const { data } = await this.bhavcopy.invoke(
        snapshotTool,
        { date: this.today(), filter: nameFilter },
        indexSnapshotResponseSchema,
      );
      const indices = data.indices
        .map((row) => mapIndexSnapshotRow(row, this.context(BHAVCOPY, snapshotTool)))
        .filter((index): index is NormalizedIndexQuote => index !== null);
      if (indices.length === 0) {
        throw new DataUnavailableError("NSE returned no index rows for the requested filter");
      }
      marketCache.set(cacheKey, indices, env.CACHE_TTL_MARKET_SECONDS * 1000);
      return indices;
    }
  }

  async get52WeekRange(
    symbol: string,
  ): Promise<{ symbol: string; high: number | null; low: number | null } | null> {
    const tool = NSE_TOOL_CAPABILITIES[BHAVCOPY].weekRange;
    const { data } = await this.bhavcopy.invoke(
      tool,
      { symbol: symbol.trim().toUpperCase() },
      weekRangeResponseSchema,
    );
    return mapWeekRange(data);
  }

  health(): ProviderHealth {
    const bhav = this.bhavcopy.getStatus();
    const cm = this.cmMarket.getStatus();
    const statuses = [bhav.status, cm.status];
    let status: ProviderHealth["status"];
    if (!env.NSE_MCP_ENABLED) status = "disabled";
    else if (statuses.includes("connected")) status = "connected";
    else if (statuses.every((value) => value === "unknown")) status = "unknown";
    else status = "unavailable";

    const lastConnectedAt = [bhav.lastConnectedAt, cm.lastConnectedAt]
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const lastErrorAt = [bhav.lastErrorAt, cm.lastErrorAt]
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    return {
      name: this.name,
      enabled: env.NSE_MCP_ENABLED,
      status,
      detail: [bhav.detail, cm.detail].filter(Boolean).join("; ") || null,
      toolCount: (bhav.toolCount ?? 0) + (cm.toolCount ?? 0),
      lastConnectedAt,
      lastErrorAt,
    };
  }

  async availableTools(): Promise<string[]> {
    const [bhavTools, cmTools] = await Promise.all([
      this.bhavcopy.discoverTools().catch(() => []),
      this.cmMarket.discoverTools().catch(() => []),
    ]);
    return [...bhavTools, ...cmTools].map((tool) => tool.name);
  }

  async toolCatalog(): Promise<Array<{ server: "nse-bhavcopy" | "nse-cm-market"; tool: DiscoveredTool }>> {
    const [bhavTools, cmTools] = await Promise.all([
      this.bhavcopy.discoverTools().catch(() => []),
      this.cmMarket.discoverTools().catch(() => []),
    ]);
    return [
      ...bhavTools.map((tool) => ({ server: BHAVCOPY, tool })),
      ...cmTools.map((tool) => ({ server: CM_MARKET, tool })),
    ];
  }

  async assertAvailable(): Promise<void> {
    const health = this.health();
    if (health.status === "disabled") {
      throw new ProviderUnavailableError(this.name, "NSE MCP integration is disabled");
    }
  }
}
