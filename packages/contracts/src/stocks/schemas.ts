import { z } from "zod";

export const listingStatusSchema = z.enum(["listed", "suspended", "delisted", "unknown"]);
export type ListingStatus = z.infer<typeof listingStatusSchema>;

export const stockSchema = z.object({
  id: z.string().uuid(),
  symbol: z.string(),
  name: z.string().nullable(),
  isin: z.string().nullable(),
  exchangeCode: z.string(),
  sector: z.string().nullable(),
  industry: z.string().nullable(),
  listingStatus: listingStatusSchema,
  instrumentType: z.string().nullable(),
  dataSource: z.string(),
  lastUpdatedAt: z.string().datetime().nullable(),
});
export type Stock = z.infer<typeof stockSchema>;

export const quoteSchema = z.object({
  symbol: z.string(),
  name: z.string().nullable(),
  lastPrice: z.number().nullable(),
  change: z.number().nullable(),
  changePercent: z.number().nullable(),
  open: z.number().nullable(),
  high: z.number().nullable(),
  low: z.number().nullable(),
  previousClose: z.number().nullable(),
  volume: z.number().nullable(),
  turnover: z.number().nullable(),
  yearHigh: z.number().nullable(),
  yearLow: z.number().nullable(),
  observedAt: z.string().datetime().nullable(),
  tradingDate: z.string().nullable(),
});
export type Quote = z.infer<typeof quoteSchema>;

export const historicalPriceSchema = z.object({
  date: z.string(),
  open: z.number().nullable(),
  high: z.number().nullable(),
  low: z.number().nullable(),
  close: z.number().nullable(),
  volume: z.number().nullable(),
  turnover: z.number().nullable(),
  source: z.string(),
});
export type HistoricalPrice = z.infer<typeof historicalPriceSchema>;

export const performanceSchema = z.object({
  oneDayPercent: z.number().nullable(),
  oneWeekPercent: z.number().nullable(),
  oneMonthPercent: z.number().nullable(),
  threeMonthPercent: z.number().nullable(),
  sixMonthPercent: z.number().nullable(),
  oneYearPercent: z.number().nullable(),
  yearToDatePercent: z.number().nullable(),
});
export type Performance = z.infer<typeof performanceSchema>;

export const stockDetailSchema = stockSchema.extend({
  quote: quoteSchema.nullable(),
  performance: performanceSchema.nullable(),
});
export type StockDetail = z.infer<typeof stockDetailSchema>;

export const stockListQuerySchema = z.object({
  search: z.string().trim().min(1).max(64).optional(),
  sector: z.string().trim().max(128).optional(),
  exchange: z.string().trim().max(32).optional(),
  listingStatus: listingStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  sortBy: z.enum(["symbol", "name", "lastUpdatedAt"]).default("symbol"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});
export type StockListQuery = z.infer<typeof stockListQuerySchema>;

export const historyQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(2000).default(300),
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
