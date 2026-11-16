import { z } from "zod";

export const indicatorValuesSchema = z.object({
  sma5: z.number().nullable(),
  sma20: z.number().nullable(),
  sma50: z.number().nullable(),
  sma100: z.number().nullable(),
  sma200: z.number().nullable(),
  ema12: z.number().nullable(),
  ema26: z.number().nullable(),
  ema50: z.number().nullable(),
  rsi14: z.number().nullable(),
  macd: z.number().nullable(),
  macdSignal: z.number().nullable(),
  macdHistogram: z.number().nullable(),
  averageVolume20: z.number().nullable(),
  averageVolume50: z.number().nullable(),
  relativeVolume: z.number().nullable(),
  priceChange1dPercent: z.number().nullable(),
  priceChange5dPercent: z.number().nullable(),
  priceChange1mPercent: z.number().nullable(),
  priceChange3mPercent: z.number().nullable(),
  priceChange1yPercent: z.number().nullable(),
  volumeChange1dPercent: z.number().nullable(),
  distanceFromSma20Percent: z.number().nullable(),
  distanceFromSma50Percent: z.number().nullable(),
  distanceFromSma200Percent: z.number().nullable(),
  weekHigh52: z.number().nullable(),
  weekLow52: z.number().nullable(),
  distanceFrom52WeekHighPercent: z.number().nullable(),
  distanceFrom52WeekLowPercent: z.number().nullable(),
  atr14: z.number().nullable(),
  annualizedVolatilityPercent: z.number().nullable(),
});
export type IndicatorValues = z.infer<typeof indicatorValuesSchema>;

export const INDICATOR_VERSION = "1.0.0";

export const indicatorSnapshotSchema = z.object({
  symbol: z.string(),
  asOfDate: z.string(),
  calculatedAt: z.string().datetime(),
  version: z.string(),
  values: indicatorValuesSchema,
  /** Indicators that could not be computed because of insufficient history. */
  missing: z.array(z.string()),
  observationsUsed: z.number().int().nonnegative(),
});
export type IndicatorSnapshot = z.infer<typeof indicatorSnapshotSchema>;

export const indicatorHistoryPointSchema = z.object({
  date: z.string(),
  values: indicatorValuesSchema,
  version: z.string(),
  calculatedAt: z.string().datetime(),
});
export type IndicatorHistoryPoint = z.infer<typeof indicatorHistoryPointSchema>;

export const indicatorsResponseSchema = indicatorSnapshotSchema;
