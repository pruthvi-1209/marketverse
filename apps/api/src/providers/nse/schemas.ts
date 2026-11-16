import { z } from "zod";

/**
 * Zod schemas for the response envelopes returned by the two official NSE MCP
 * servers. Every external payload is parsed before it can reach the database or
 * a client. Unknown keys are preserved so upstream additions do not break us.
 */

const numeric = z.union([z.number(), z.string()]).nullable().optional();
const text = z.string().nullable().optional();

export const bhavcopyQuoteSchema = z
  .object({
    symbol: z.string(),
    close: numeric,
    open: numeric,
    high: numeric,
    low: numeric,
    prev_close: numeric,
    pct_change: numeric,
    volume: numeric,
    date: text,
  })
  .passthrough();

export const bulkQuoteResponseSchema = z
  .object({
    quotes: z.array(bhavcopyQuoteSchema),
  })
  .passthrough();

export const stockHistoryRowSchema = z
  .object({
    symbol: z.string().optional(),
    ltp: numeric,
    open: numeric,
    high: numeric,
    low: numeric,
    close: numeric,
    prevClose: numeric,
    volume: numeric,
    totalTradedValue: numeric,
    date: z.string(),
  })
  .passthrough();

export const stockHistoryResponseSchema = z
  .object({
    symbol: z.string().optional(),
    from_date: text,
    to_date: text,
    next_end_date: text,
    data: z.array(stockHistoryRowSchema),
  })
  .passthrough();

export const marketBreadthResponseSchema = z
  .object({
    date: z.string(),
    total_stocks: numeric,
    advances: numeric,
    declines: numeric,
    unchanged: numeric,
    ad_ratio: numeric,
    total_volume: numeric,
  })
  .passthrough();

export const indexSnapshotRowSchema = z
  .object({
    indexName: z.string(),
    open: numeric,
    high: numeric,
    low: numeric,
    close: numeric,
    pointsChange: numeric,
    pctChange: numeric,
    volume: numeric,
    turnoverCr: numeric,
    pe: numeric,
    pb: numeric,
    divYield: numeric,
    date: text,
  })
  .passthrough();

export const indexSnapshotResponseSchema = z
  .object({
    date: z.string(),
    indices: z.array(indexSnapshotRowSchema),
  })
  .passthrough();

export const indexHistoryRowSchema = z
  .object({
    date: z.string(),
    open: numeric,
    high: numeric,
    low: numeric,
    close: numeric,
    pctChange: numeric,
  })
  .passthrough();

export const indexHistoryResponseSchema = z
  .object({
    indexName: z.string().optional(),
    data: z.array(indexHistoryRowSchema),
  })
  .passthrough();

export const topMoversRowSchema = z
  .object({
    symbol: z.string(),
    close: numeric,
    prev_close: numeric,
    pct_change: numeric,
    high: numeric,
    low: numeric,
    volume: numeric,
  })
  .passthrough();

export const topMoversResponseSchema = z
  .object({
    date: z.string(),
    direction: z.string().optional(),
    stocks: z.array(topMoversRowSchema),
  })
  .passthrough();

export const topByVolumeRowSchema = z
  .object({
    symbol: z.string(),
    close: numeric,
    pct_change: numeric,
    volume: numeric,
    value: numeric,
  })
  .passthrough();

export const topByVolumeResponseSchema = z
  .object({
    date: z.string(),
    stocks: z.array(topByVolumeRowSchema),
  })
  .passthrough();

export const symbolSearchRowSchema = z
  .object({
    symbol: z.string(),
    last_close: numeric,
    pct_change: numeric,
    last_date: text,
    company_name: text,
  })
  .passthrough();

export const symbolSearchResponseSchema = z
  .object({
    results: z.array(symbolSearchRowSchema),
  })
  .passthrough();

export const weekRangeResponseSchema = z
  .object({
    symbol: z.string(),
    last_close: numeric,
    "52w_high": numeric,
    "52w_low": numeric,
    from_52w_high_pct: numeric,
    from_52w_low_pct: numeric,
  })
  .passthrough();

export const cmStockQuoteResponseSchema = z
  .object({
    updatedAt: text,
    stock: z
      .object({
        symbol: z.string(),
        series: text,
        openPrice: numeric,
        highPrice: numeric,
        lowPrice: numeric,
        preClosePrice: numeric,
        lastTradedPrice: numeric,
        change: numeric,
        perChange: numeric,
        volume: numeric,
        value: numeric,
        fiftyTwoWeekHigh: numeric,
        fiftyTwoWeekLow: numeric,
        latestTimestamp: text,
      })
      .passthrough(),
  })
  .passthrough();

const cmIndexRowSchema = z
  .object({
    indexName: z.string(),
    last: numeric,
    previousClose: numeric,
    change: numeric,
    percChange: numeric,
    open: numeric,
    high: numeric,
    low: numeric,
    timeVal: text,
  })
  .passthrough();

export const cmLiveIndicesResponseSchema = z
  .object({
    nseTimestamp: text,
    updatedAt: text,
    indices: z.record(z.array(cmIndexRowSchema)),
  })
  .passthrough();

export const cmIndexQuoteResponseSchema = z
  .object({
    indexName: z.string(),
    last: numeric,
    previousClose: numeric,
    change: numeric,
    percChange: numeric,
    open: numeric,
    high: numeric,
    low: numeric,
    yearHigh: numeric,
    yearLow: numeric,
    timeVal: text,
  })
  .passthrough();

export const cmMoversRowSchema = z
  .object({
    symbol: z.string(),
    ltp: numeric,
    prev_price: numeric,
    perChange: numeric,
    trade_quantity: z.union([z.string(), z.number()]).nullable().optional(),
    turnover: z.union([z.string(), z.number()]).nullable().optional(),
  })
  .passthrough();

export const cmMoversResponseSchema = z
  .object({
    segment: text,
    gainersUpdatedAt: text,
    losersUpdatedAt: text,
    gainers: z.array(cmMoversRowSchema).optional(),
    losers: z.array(cmMoversRowSchema).optional(),
  })
  .passthrough();

export const cmDataStatusResponseSchema = z
  .object({
    indices: z.record(z.unknown()).optional(),
    crawlIntervalMinutes: numeric,
    redisTtlMinutes: numeric,
  })
  .passthrough();
