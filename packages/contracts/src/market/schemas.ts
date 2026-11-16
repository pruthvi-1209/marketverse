import { z } from "zod";

export const indexQuoteSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  lastPrice: z.number().nullable(),
  change: z.number().nullable(),
  changePercent: z.number().nullable(),
  open: z.number().nullable(),
  high: z.number().nullable(),
  low: z.number().nullable(),
  previousClose: z.number().nullable(),
  observedAt: z.string().datetime().nullable(),
  tradingDate: z.string().nullable(),
});
export type IndexQuote = z.infer<typeof indexQuoteSchema>;

export const indexHistoryPointSchema = z.object({
  date: z.string(),
  open: z.number().nullable(),
  high: z.number().nullable(),
  low: z.number().nullable(),
  close: z.number().nullable(),
});

export const marketBreadthSchema = z.object({
  advances: z.number().int().nullable(),
  declines: z.number().int().nullable(),
  unchanged: z.number().int().nullable(),
  advanceDeclineRatio: z.number().nullable(),
  newHighs: z.number().int().nullable(),
  newLows: z.number().int().nullable(),
  totalTradedVolume: z.number().nullable(),
  totalTradedValue: z.number().nullable(),
  asOf: z.string().datetime().nullable(),
});
export type MarketBreadth = z.infer<typeof marketBreadthSchema>;

export const moverSchema = z.object({
  symbol: z.string(),
  name: z.string().nullable(),
  lastPrice: z.number().nullable(),
  changePercent: z.number().nullable(),
  volume: z.number().nullable(),
});
export type Mover = z.infer<typeof moverSchema>;

export const marketMoversSchema = z.object({
  gainers: z.array(moverSchema),
  losers: z.array(moverSchema),
  mostActiveByVolume: z.array(moverSchema),
  mostActiveByValue: z.array(moverSchema),
  weekHigh52: z.array(moverSchema),
  weekLow52: z.array(moverSchema),
});
export type MarketMovers = z.infer<typeof marketMoversSchema>;

export const marketOverviewSchema = z.object({
  indices: z.array(indexQuoteSchema),
  breadth: marketBreadthSchema,
  movers: marketMoversSchema,
  tradingDate: z.string().nullable(),
});
export type MarketOverview = z.infer<typeof marketOverviewSchema>;

export const marketMoversQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const indexHistoryQuerySchema = z.object({
  symbol: z.string().trim().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(1000).default(180),
});

export const volumeTrendSchema = z.object({
  symbol: z.string(),
  averageVolume20: z.number().nullable(),
  averageVolume50: z.number().nullable(),
  latestVolume: z.number().nullable(),
  relativeVolume: z.number().nullable(),
  trend: z.enum(["increasing", "decreasing", "flat", "unknown"]),
});
export type VolumeTrend = z.infer<typeof volumeTrendSchema>;
