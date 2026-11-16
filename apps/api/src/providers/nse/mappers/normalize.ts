import type { DelayClassification } from "@marketverse/contracts";
import { toNumber } from "../../../core/utils/numbers";
import { toIstTradingDate } from "../../../core/utils/time";
import type {
  NormalizedBreadth,
  NormalizedCandle,
  NormalizedIndexHistoryPoint,
  NormalizedIndexQuote,
  NormalizedMovers,
  NormalizedQuote,
  NormalizedSymbolMatch,
  Provenance,
} from "../../types";

export interface MapperContext {
  provider: string;
  tool: string;
  retrievedAt: Date;
  delayClassification: DelayClassification;
  includeRaw: boolean;
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Accepts `YYYY-MM-DD`, ISO timestamps and NSE's `16-Nov-2026` style dates. */
export function normalizeTradingDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);

  const dmy = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(trimmed);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = MONTH_NAMES[(dmy[2] ?? "").toLowerCase()];
    const year = Number(dmy[3]);
    if (month && day >= 1 && day <= 31) {
      return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
        .toString()
        .padStart(2, "0")}`;
    }
  }
  return null;
}

/** NSE wall-clock timestamps are IST and carry no offset. */
export function parseIstTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(trimmed)) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const spaceForm = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(trimmed);
  if (spaceForm) {
    const parsed = new Date(`${spaceForm[1]}T${spaceForm[2]}+05:30`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function provenance(context: MapperContext, tradingDate: string | null, observedAt: Date | null, raw?: Record<string, unknown>): Provenance {
  return {
    provider: context.provider,
    tool: context.tool,
    retrievedAt: context.retrievedAt,
    observedAt,
    tradingDate,
    delayClassification: context.delayClassification,
    ...(context.includeRaw && raw ? { raw } : {}),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function mapBulkQuote(
  row: Record<string, unknown>,
  context: MapperContext,
): NormalizedQuote | null {
  const symbol = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : null;
  if (!symbol) return null;
  const tradingDate = normalizeTradingDate(row.date);
  return {
    symbol,
    name: null,
    lastPrice: toNumber(row.close as never),
    change:
      toNumber(row.close as never) !== null && toNumber(row.prev_close as never) !== null
        ? (toNumber(row.close as never) as number) - (toNumber(row.prev_close as never) as number)
        : null,
    changePercent: toNumber(row.pct_change as never),
    open: toNumber(row.open as never),
    high: toNumber(row.high as never),
    low: toNumber(row.low as never),
    previousClose: toNumber(row.prev_close as never),
    volume: toNumber(row.volume as never),
    turnover: toNumber(row.turnover as never),
    yearHigh: null,
    yearLow: null,
    series: typeof row.series === "string" ? row.series : null,
    provenance: provenance(context, tradingDate, null, asRecord(row)),
  };
}

export function mapHistoryRow(
  row: Record<string, unknown>,
  symbolFallback: string,
  context: MapperContext,
): NormalizedCandle | null {
  const symbol =
    typeof row.symbol === "string" && row.symbol.trim().length > 0
      ? row.symbol.trim().toUpperCase()
      : symbolFallback;
  const tradingDate = normalizeTradingDate(row.date);
  if (!tradingDate) return null;
  const close = toNumber(row.close as never) ?? toNumber(row.ltp as never);
  return {
    symbol,
    tradingDate,
    open: toNumber(row.open as never),
    high: toNumber(row.high as never),
    low: toNumber(row.low as never),
    close,
    previousClose: toNumber(row.prevClose as never),
    volume: toNumber(row.volume as never),
    turnover: toNumber(row.totalTradedValue as never),
    provenance: provenance(context, tradingDate, null),
  };
}

export function mapIndexSnapshotRow(
  row: Record<string, unknown>,
  context: MapperContext,
): NormalizedIndexQuote | null {
  const name = typeof row.indexName === "string" ? row.indexName.trim() : null;
  if (!name) return null;
  const tradingDate =
    normalizeTradingDate(row.date) ??
    (context.retrievedAt ? toIstTradingDate(context.retrievedAt) : null);
  return {
    symbol: name,
    name,
    lastPrice: toNumber(row.close as never),
    change: toNumber(row.pointsChange as never),
    changePercent: toNumber(row.pctChange as never),
    open: toNumber(row.open as never),
    high: toNumber(row.high as never),
    low: toNumber(row.low as never),
    previousClose:
      toNumber(row.close as never) !== null && toNumber(row.pointsChange as never) !== null
        ? (toNumber(row.close as never) as number) - (toNumber(row.pointsChange as never) as number)
        : null,
    pe: toNumber(row.pe as never),
    pb: toNumber(row.pb as never),
    dividendYield: toNumber(row.divYield as never),
    tradingDate,
    provenance: provenance(context, tradingDate, null, asRecord(row)),
  };
}

export function mapIndexHistoryRow(
  row: Record<string, unknown>,
  context: MapperContext,
): NormalizedIndexHistoryPoint | null {
  const tradingDate = normalizeTradingDate(row.date);
  if (!tradingDate) return null;
  return {
    tradingDate,
    open: toNumber(row.open as never),
    high: toNumber(row.high as never),
    low: toNumber(row.low as never),
    close: toNumber(row.close as never),
    changePercent: toNumber(row.pctChange as never),
    provenance: provenance(context, tradingDate, null),
  };
}

export function mapCmStockQuote(
  payload: Record<string, unknown>,
  context: MapperContext,
): NormalizedQuote | null {
  const stock = asRecord(payload.stock);
  if (!stock) return null;
  const symbol = typeof stock.symbol === "string" ? stock.symbol.trim().toUpperCase() : null;
  if (!symbol) return null;
  const observedAt = parseIstTimestamp(stock.latestTimestamp) ?? parseIstTimestamp(payload.updatedAt);
  const tradingDate = observedAt ? toIstTradingDate(observedAt) : normalizeTradingDate(stock.date);
  return {
    symbol,
    name: null,
    lastPrice: toNumber(stock.lastTradedPrice as never),
    change: toNumber(stock.change as never),
    changePercent: toNumber(stock.perChange as never),
    open: toNumber(stock.openPrice as never),
    high: toNumber(stock.highPrice as never),
    low: toNumber(stock.lowPrice as never),
    previousClose: toNumber(stock.preClosePrice as never),
    volume: toNumber(stock.volume as never),
    turnover: toNumber(stock.value as never) === null ? null : (toNumber(stock.value as never) as number) * 1e7,
    yearHigh: toNumber(stock.fiftyTwoWeekHigh as never),
    yearLow: toNumber(stock.fiftyTwoWeekLow as never),
    series: typeof stock.series === "string" ? stock.series : null,
    provenance: provenance(context, tradingDate, observedAt, context.includeRaw ? payload : undefined),
  };
}

export function mapCmIndexRow(
  row: Record<string, unknown>,
  context: MapperContext,
): NormalizedIndexQuote | null {
  const name = typeof row.indexName === "string" ? row.indexName.trim() : null;
  if (!name) return null;
  const observedAt = parseIstTimestamp(row.timeVal) ?? parseIstTimestamp(context.retrievedAt);
  const tradingDate = observedAt ? toIstTradingDate(observedAt) : null;
  return {
    symbol: name,
    name,
    lastPrice: toNumber(row.last as never),
    change: toNumber(row.change as never),
    changePercent: toNumber(row.percChange as never),
    open: toNumber(row.open as never),
    high: toNumber(row.high as never),
    low: toNumber(row.low as never),
    previousClose: toNumber(row.previousClose as never),
    pe: null,
    pb: null,
    dividendYield: null,
    tradingDate,
    provenance: provenance(context, tradingDate, observedAt),
  };
}

export function mapBreadth(
  payload: Record<string, unknown>,
  context: MapperContext,
): NormalizedBreadth | null {
  const tradingDate = normalizeTradingDate(payload.date);
  if (!tradingDate) return null;
  return {
    tradingDate,
    advances: toNumber(payload.advances as never),
    declines: toNumber(payload.declines as never),
    unchanged: toNumber(payload.unchanged as never),
    advanceDeclineRatio: toNumber(payload.ad_ratio as never),
    totalStocks: toNumber(payload.total_stocks as never),
    totalVolume: toNumber(payload.total_volume as never),
    provenance: provenance(context, tradingDate, null, context.includeRaw ? payload : undefined),
  };
}

export function mapTopMovers(
  payload: Record<string, unknown>,
  context: MapperContext,
  direction: "gainers" | "losers",
): NormalizedQuote[] {
  const rows = Array.isArray(payload.stocks) ? payload.stocks : [];
  const tradingDate = normalizeTradingDate(payload.date);
  const quotes: NormalizedQuote[] = [];
  for (const raw of rows) {
    const row = asRecord(raw);
    if (!row || typeof row.symbol !== "string") continue;
    const close = toNumber(row.close as never);
    const previousClose = toNumber(row.prev_close as never);
    quotes.push({
      symbol: row.symbol.trim().toUpperCase(),
      name: null,
      lastPrice: close,
      change: close !== null && previousClose !== null ? close - previousClose : null,
      changePercent: toNumber(row.pct_change as never),
      open: null,
      high: toNumber(row.high as never),
      low: toNumber(row.low as never),
      previousClose,
      volume: toNumber(row.volume as never),
      turnover: null,
      yearHigh: null,
      yearLow: null,
      series: null,
      provenance: provenance(context, tradingDate, null),
    });
  }
  void direction;
  return quotes;
}

export function mapCmMovers(
  payload: Record<string, unknown>,
  context: MapperContext,
  kind: "gainers" | "losers",
): NormalizedQuote[] {
  const rows = Array.isArray(payload[kind]) ? (payload[kind] as unknown[]) : [];
  const observedAt =
    parseIstTimestamp(kind === "gainers" ? payload.gainersUpdatedAt : payload.losersUpdatedAt) ??
    context.retrievedAt;
  const tradingDate = toIstTradingDate(observedAt);
  const quotes: NormalizedQuote[] = [];
  for (const raw of rows) {
    const row = asRecord(raw);
    if (!row || typeof row.symbol !== "string") continue;
    quotes.push({
      symbol: row.symbol.trim().toUpperCase(),
      name: null,
      lastPrice: toNumber(row.ltp as never),
      change:
        toNumber(row.ltp as never) !== null && toNumber(row.prev_price as never) !== null
          ? (toNumber(row.ltp as never) as number) - (toNumber(row.prev_price as never) as number)
          : null,
      changePercent: toNumber(row.perChange as never),
      open: null,
      high: null,
      low: null,
      previousClose: toNumber(row.prev_price as never),
      volume: null,
      turnover: null,
      yearHigh: null,
      yearLow: null,
      series: typeof row.series === "string" ? row.series : null,
      provenance: provenance(context, tradingDate, observedAt),
    });
  }
  return quotes;
}

export function mapSymbolSearchRow(
  row: Record<string, unknown>,
  context: MapperContext,
): NormalizedSymbolMatch | null {
  const symbol = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : null;
  if (!symbol) return null;
  return {
    symbol,
    name: typeof row.company_name === "string" ? row.company_name : null,
    lastPrice: toNumber(row.last_close as never),
    changePercent: toNumber(row.pct_change as never),
    tradingDate: normalizeTradingDate(row.last_date),
    provenance: provenance(context, normalizeTradingDate(row.last_date), null),
  };
}

export function mapWeekRange(payload: Record<string, unknown>): {
  symbol: string;
  high: number | null;
  low: number | null;
} | null {
  const symbol = typeof payload.symbol === "string" ? payload.symbol.trim().toUpperCase() : null;
  if (!symbol) return null;
  return {
    symbol,
    high: toNumber(payload["52w_high"] as never),
    low: toNumber(payload["52w_low"] as never),
  };
}

/** Used to build the merged movers payload returned by `MarketDataProvider`. */
export function mergeMovers(
  gainers: NormalizedQuote[],
  losers: NormalizedQuote[],
  context: MapperContext,
  tradingDate: string | null,
): NormalizedMovers {
  return {
    gainers,
    losers,
    provenance: {
      provider: context.provider,
      tool: context.tool,
      retrievedAt: context.retrievedAt,
      observedAt: null,
      tradingDate,
      delayClassification: context.delayClassification,
    },
  };
}
