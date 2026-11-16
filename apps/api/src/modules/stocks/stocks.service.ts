import type {
  HistoryQuery,
  Quote,
  Stock,
  StockDetail,
  StockListQuery,
} from "@marketverse/contracts";
import { env } from "../../config/env";
import { storedResponseMeta } from "../../core/http/response-meta";
import { NotFoundError } from "../../core/errors/app-error";
import { logger } from "../../core/logger/logger";
import { getMarketDataProvider } from "../../providers";
import { marketRepository } from "../../database/repositories/market.repository";
import { stocksRepository, mapStockRow } from "../../database/repositories/stocks.repository";
import { exchangeRepository } from "../../database/repositories/exchanges.repository";
import { marketDataService } from "../../services/market-data.service";
import { scoringService } from "../../services/scoring.service";
import { computePerformance, mapHistoryRow, mapQuoteRow } from "./mappers";
import type { ResponseMeta } from "@marketverse/contracts";

export interface PagedStocks {
  items: Stock[];
  total: number;
}

export class StocksService {
  private readonly provider = getMarketDataProvider();

  async list(query: StockListQuery): Promise<PagedStocks> {
    const { rows, total } = await stocksRepository.list(query);
    return { items: rows.map((row) => mapStockRow(row)), total };
  }

  async detail(symbol: string): Promise<{ detail: StockDetail; meta: ResponseMeta }> {
    const stock = await marketDataService.requireStock(symbol);
    const quoteRow = await marketRepository.latestQuote(stock.id);
    const history = await marketRepository.historyForStock(stock.id, { limit: 300, order: "asc" });

    let quote: Quote | null = quoteRow ? mapQuoteRow(quoteRow) : null;
    const warnings: string[] = [];

    if (!quote) {
      try {
        const result = await marketDataService.getQuote(stock.symbol);
        quote = mapQuoteRow(result.row);
      } catch (error) {
        logger.warn({ err: error, symbol }, "Unable to provide a quote for stock detail");
        warnings.push("No quote is currently available; price fields are omitted.");
      }
    }

    const detail: StockDetail = {
      ...mapStockRow(stock),
      quote,
      performance: history.length > 1 ? computePerformance(history) : null,
    };
    const meta = storedResponseMeta({
      provider: quoteRow?.source ?? this.provider.name,
      observedAt: quoteRow?.observedAt ?? null,
      tradingDate: quoteRow?.tradingDate ?? null,
      delayClassification: quoteRow?.delayClassification ?? "unknown",
      warnings,
    });
    return { detail, meta };
  }

  async quote(symbol: string, options: { refresh?: boolean } = {}): Promise<{ quote: Quote; meta: ResponseMeta }> {
    const { row, meta } = await marketDataService.getQuote(symbol, options);
    return { quote: mapQuoteRow(row), meta };
  }

  async history(symbol: string, query: HistoryQuery): Promise<{
    items: ReturnType<typeof mapHistoryRow>[];
    meta: ResponseMeta;
  }> {
    const stock = await marketDataService.requireStock(symbol);
    const ascending = await marketRepository.historyForStock(stock.id, {
      from: query.from,
      to: query.to,
      limit: query.limit,
      order: "asc",
    });

    if (ascending.length === 0) {
      // Only synchronise when nothing is stored; never fabricate rows.
      const { rows, warnings } = await marketDataService.loadHistory(stock.symbol, {
        minimumPoints: 1,
        months: 15,
        limit: query.limit,
      });
      const items = rows.map(mapHistoryRow);
      const last = rows[rows.length - 1];
      return {
        items: query.order === "desc" ? [...items].reverse() : items,
        meta: storedResponseMeta({
          provider: last?.source ?? this.provider.name,
          observedAt: null,
          tradingDate: last?.tradingDate ?? null,
          delayClassification: "end_of_day",
          warnings,
        }),
      };
    }

    const items = ascending.map(mapHistoryRow);
    const last = ascending[ascending.length - 1];
    return {
      items: query.order === "desc" ? [...items].reverse() : items,
      meta: storedResponseMeta({
        provider: last?.source ?? this.provider.name,
        observedAt: null,
        tradingDate: last?.tradingDate ?? null,
        delayClassification: "end_of_day",
      }),
    };
  }

  async indicators(symbol: string, options: { recalculate?: boolean } = {}) {
    if (options.recalculate) {
      const { snapshot, warnings } = await marketDataService.computeIndicators(symbol, { persist: true });
      return { snapshot, warnings };
    }
    return marketDataService.latestIndicators(symbol);
  }

  async scores(symbol: string, options: { recalculate?: boolean } = {}) {
    return scoringService.combined(symbol, options);
  }

  async search(query: string): Promise<{ items: Array<Pick<Stock, "symbol" | "name" | "exchangeCode">>; warnings: string[] }> {
    const term = query.trim();
    if (term.length === 0) return { items: [], warnings: [] };

    const local = await stocksRepository.list({
      search: term,
      page: 1,
      pageSize: 10,
      sortBy: "symbol",
      sortOrder: "asc",
    });

    const items = local.rows.map((row) => ({
      symbol: row.symbol,
      name: row.name,
      exchangeCode: "NSE",
    }));
    const warnings: string[] = [];

    if (items.length < 5) {
      try {
        const matches = await this.provider.searchSymbols(term);
        const exchange = await exchangeRepository.ensureNse();
        for (const match of matches.slice(0, 10)) {
          if (items.some((item) => item.symbol === match.symbol)) continue;
          await stocksRepository.upsert({
            symbol: match.symbol,
            name: match.name,
            exchangeId: exchange.id,
            listingStatus: "listed",
            instrumentType: "equity",
            dataSource: this.provider.name,
            lastUpdatedAt: match.provenance.retrievedAt,
          });
          items.push({ symbol: match.symbol, name: match.name, exchangeCode: "NSE" });
        }
      } catch (error) {
        logger.warn({ err: error, query: term }, "Provider symbol search unavailable");
        warnings.push("Live NSE symbol search is unavailable; results come from stored stocks only.");
      }
    }

    return { items: items.slice(0, 20), warnings };
  }

  async findBySymbolOrThrow(symbol: string) {
    const stock = await stocksRepository.findBySymbol(symbol);
    if (!stock) throw new NotFoundError("Stock", symbol);
    return stock;
  }

  static staleAfterSeconds(): number {
    return env.QUOTE_STALE_AFTER_SECONDS;
  }
}

export const stocksService = new StocksService();
