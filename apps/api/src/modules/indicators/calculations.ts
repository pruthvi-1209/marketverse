import type { IndicatorValues } from "@marketverse/contracts";
import { round, safeDivide } from "../../core/utils/numbers";

export interface Candle {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface MacdResult {
  macd: number;
  signal: number;
  histogram: number;
}

/** Simple moving average of the last `period` values; null when insufficient. */
export function sma(values: ReadonlyArray<number>, period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const window = values.slice(values.length - period);
  if (window.some((value) => !Number.isFinite(value))) return null;
  const total = window.reduce((sum, value) => sum + value, 0);
  return total / period;
}

/** Exponential moving average seeded with the SMA of the first `period` values. */
export function emaSeries(values: ReadonlyArray<number>, period: number): Array<number | null> {
  if (period <= 0 || values.length < period) return values.map(() => null);
  const multiplier = 2 / (period + 1);
  const seed = sma(values.slice(0, period), period);
  if (seed === null) return values.map(() => null);

  const result: Array<number | null> = new Array(values.length).fill(null);
  result[period - 1] = seed;
  for (let index = period; index < values.length; index += 1) {
    const value = values[index];
    const previous = result[index - 1];
    if (value === undefined || previous === null || previous === undefined) {
      result[index] = null;
      continue;
    }
    result[index] = (value - previous) * multiplier + previous;
  }
  return result;
}

export function ema(values: ReadonlyArray<number>, period: number): number | null {
  const series = emaSeries(values, period);
  const last = series[series.length - 1];
  return last ?? null;
}

/**
 * Wilder's RSI. Returns null when there is not enough history or when the
 * average loss is zero (which would otherwise divide by zero).
 */
export function rsiSeries(values: ReadonlyArray<number>, period = 14): Array<number | null> {
  if (period <= 0 || values.length <= period) return values.map(() => null);
  const result: Array<number | null> = new Array(values.length).fill(null);

  let gainSum = 0;
  let lossSum = 0;
  for (let index = 1; index <= period; index += 1) {
    const current = values[index];
    const previous = values[index - 1];
    if (current === undefined || previous === undefined) return result;
    const change = current - previous;
    if (change > 0) gainSum += change;
    else lossSum += Math.abs(change);
  }

  let averageGain = gainSum / period;
  let averageLoss = lossSum / period;
  result[period] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const current = values[index];
    const previous = values[index - 1];
    if (current === undefined || previous === undefined) continue;
    const change = current - previous;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    averageGain = (averageGain * (period - 1) + gain) / period;
    averageLoss = (averageLoss * (period - 1) + loss) / period;
    result[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return result;
}

export function rsi(values: ReadonlyArray<number>, period = 14): number | null {
  const series = rsiSeries(values, period);
  return series[series.length - 1] ?? null;
}

export function macd(
  values: ReadonlyArray<number>,
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult | null {
  if (values.length < slowPeriod + signalPeriod - 1) return null;
  const fastSeries = emaSeries(values, fastPeriod);
  const slowSeries = emaSeries(values, slowPeriod);

  const macdLine: number[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const fast = fastSeries[index];
    const slow = slowSeries[index];
    if (fast === null || fast === undefined || slow === null || slow === undefined) continue;
    macdLine.push(fast - slow);
  }
  if (macdLine.length < signalPeriod) return null;

  const signalSeries = emaSeries(macdLine, signalPeriod);
  const latestMacd = macdLine[macdLine.length - 1];
  const latestSignal = signalSeries[signalSeries.length - 1];
  if (latestMacd === undefined || latestSignal === undefined || latestSignal === null) return null;

  return {
    macd: latestMacd,
    signal: latestSignal,
    histogram: latestMacd - latestSignal,
  };
}

export function averageVolume(volumes: ReadonlyArray<number>, period: number): number | null {
  return sma(volumes, period);
}

export function relativeVolume(
  latestVolume: number | null,
  averageVolumeValue: number | null,
): number | null {
  if (latestVolume === null) return null;
  return safeDivide(latestVolume, averageVolumeValue ?? 0);
}

/** Percentage price change over `periods` trading sessions. */
export function percentageChangeOverPeriods(
  closes: ReadonlyArray<number>,
  periods: number,
): number | null {
  if (periods <= 0 || closes.length <= periods) return null;
  const latest = closes[closes.length - 1];
  const reference = closes[closes.length - 1 - periods];
  if (latest === undefined || reference === undefined || reference === 0) return null;
  return ((latest - reference) / Math.abs(reference)) * 100;
}

export function trueRange(candle: Candle, previousClose: number | null): number | null {
  if (candle.high === null || candle.low === null) return null;
  const highLow = candle.high - candle.low;
  if (previousClose === null) return highLow;
  const highPrevClose = Math.abs(candle.high - previousClose);
  const lowPrevClose = Math.abs(candle.low - previousClose);
  return Math.max(highLow, highPrevClose, lowPrevClose);
}

export function atr(candles: ReadonlyArray<Candle>, period = 14): number | null {
  if (candles.length < period + 1) return null;
  const trueRanges: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const previous = candles[index - 1];
    if (!candle || !previous || previous.close === null) continue;
    const range = trueRange(candle, previous.close);
    if (range !== null) trueRanges.push(range);
  }
  if (trueRanges.length < period) return null;
  // Wilder smoothing of true range.
  let value = sma(trueRanges.slice(0, period), period);
  if (value === null) return null;
  for (let index = period; index < trueRanges.length; index += 1) {
    const range = trueRanges[index];
    if (range === undefined) continue;
    value = (value * (period - 1) + range) / period;
  }
  return value;
}

export function annualizedVolatility(closes: ReadonlyArray<number>, period = 20): number | null {
  if (closes.length < period + 1) return null;
  const window = closes.slice(closes.length - (period + 1));
  const returns: number[] = [];
  for (let index = 1; index < window.length; index += 1) {
    const current = window[index];
    const previous = window[index - 1];
    if (current === undefined || previous === undefined || current <= 0 || previous <= 0) continue;
    returns.push(Math.log(current / previous));
  }
  if (returns.length < period) return null;
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

const FIFTY_TWO_WEEKS = 252;

export function fiftyTwoWeekRange(
  candles: ReadonlyArray<Candle>,
  windowSize = FIFTY_TWO_WEEKS,
): { high: number | null; low: number | null } {
  const window = candles.slice(-windowSize);
  const highs = window.map((candle) => candle.high).filter((value): value is number => value !== null);
  const lows = window.map((candle) => candle.low).filter((value): value is number => value !== null);
  if (highs.length === 0 || lows.length === 0) {
    const closes = window
      .map((candle) => candle.close)
      .filter((value): value is number => value !== null);
    if (closes.length === 0) return { high: null, low: null };
    return { high: Math.max(...closes), low: Math.min(...closes) };
  }
  return { high: Math.max(...highs), low: Math.min(...lows) };
}

function distancePercentFrom(value: number | null, reference: number | null): number | null {
  if (value === null || reference === null || reference === 0) return null;
  return ((value - reference) / reference) * 100;
}

export interface IndicatorComputationResult {
  values: IndicatorValues;
  missing: string[];
  observationsUsed: number;
}

/**
 * Computes every indicator from ascending daily candles. Missing inputs yield
 * `null` plus an entry in `missing`; values are never substituted with zero.
 */
export function computeIndicators(
  candlesAscending: ReadonlyArray<Candle>,
): IndicatorComputationResult {
  const missing: string[] = [];

  const closes: number[] = [];
  for (const candle of candlesAscending) {
    if (candle.close !== null && Number.isFinite(candle.close)) closes.push(candle.close);
  }
  const volumes: number[] = [];
  for (const candle of candlesAscending) {
    if (candle.volume !== null && Number.isFinite(candle.volume)) volumes.push(candle.volume);
  }

  const latestClose = closes.length > 0 ? (closes[closes.length - 1] ?? null) : null;
  const latestVolume = volumes.length > 0 ? (volumes[volumes.length - 1] ?? null) : null;
  const previousVolume = volumes.length > 1 ? (volumes[volumes.length - 2] ?? null) : null;

  const sma5 = sma(closes, 5);
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma100 = sma(closes, 100);
  const sma200 = sma(closes, 200);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const ema50 = ema(closes, 50);
  const rsi14 = rsi(closes, 14);
  const macdResult = macd(closes);
  const averageVolume20 = averageVolume(volumes, 20);
  const averageVolume50 = averageVolume(volumes, 50);
  const relativeVolumeValue = relativeVolume(latestVolume, averageVolume20);
  const range52 = fiftyTwoWeekRange(candlesAscending);

  const namedChecks: Array<[string, unknown]> = [
    ["sma5", sma5],
    ["sma20", sma20],
    ["sma50", sma50],
    ["sma100", sma100],
    ["sma200", sma200],
    ["ema12", ema12],
    ["ema26", ema26],
    ["ema50", ema50],
    ["rsi14", rsi14],
    ["macd", macdResult],
    ["averageVolume20", averageVolume20],
    ["averageVolume50", averageVolume50],
    ["relativeVolume", relativeVolumeValue],
    ["weekHigh52", range52.high],
    ["weekLow52", range52.low],
  ];
  for (const [name, value] of namedChecks) {
    if (value === null) missing.push(name);
  }

  const maturity = {
    priceChange1dPercent: percentageChangeOverPeriods(closes, 1),
    priceChange5dPercent: percentageChangeOverPeriods(closes, 5),
    priceChange1mPercent: percentageChangeOverPeriods(closes, 21),
    priceChange3mPercent: percentageChangeOverPeriods(closes, 63),
    priceChange1yPercent: percentageChangeOverPeriods(closes, 252),
  } as const;
  for (const [name, value] of Object.entries(maturity)) {
    if (value === null) missing.push(name);
  }

  const values: IndicatorValues = {
    sma5: roundOrNull(sma5, 4),
    sma20: roundOrNull(sma20, 4),
    sma50: roundOrNull(sma50, 4),
    sma100: roundOrNull(sma100, 4),
    sma200: roundOrNull(sma200, 4),
    ema12: roundOrNull(ema12, 4),
    ema26: roundOrNull(ema26, 4),
    ema50: roundOrNull(ema50, 4),
    rsi14: roundOrNull(rsi14, 4),
    macd: roundOrNull(macdResult?.macd ?? null, 4),
    macdSignal: roundOrNull(macdResult?.signal ?? null, 4),
    macdHistogram: roundOrNull(macdResult?.histogram ?? null, 4),
    averageVolume20: roundOrNull(averageVolume20, 2),
    averageVolume50: roundOrNull(averageVolume50, 2),
    relativeVolume: roundOrNull(relativeVolumeValue, 4),
    priceChange1dPercent: roundOrNull(maturity.priceChange1dPercent, 4),
    priceChange5dPercent: roundOrNull(maturity.priceChange5dPercent, 4),
    priceChange1mPercent: roundOrNull(maturity.priceChange1mPercent, 4),
    priceChange3mPercent: roundOrNull(maturity.priceChange3mPercent, 4),
    priceChange1yPercent: roundOrNull(maturity.priceChange1yPercent, 4),
    volumeChange1dPercent: roundOrNull(
      previousVolume !== null && previousVolume !== 0 && latestVolume !== null
        ? ((latestVolume - previousVolume) / previousVolume) * 100
        : null,
      4,
    ),
    distanceFromSma20Percent: roundOrNull(distancePercentFrom(latestClose, sma20), 4),
    distanceFromSma50Percent: roundOrNull(distancePercentFrom(latestClose, sma50), 4),
    distanceFromSma200Percent: roundOrNull(distancePercentFrom(latestClose, sma200), 4),
    weekHigh52: roundOrNull(range52.high, 4),
    weekLow52: roundOrNull(range52.low, 4),
    distanceFrom52WeekHighPercent: roundOrNull(
      distancePercentFrom(latestClose, range52.high),
      4,
    ),
    distanceFrom52WeekLowPercent: roundOrNull(distancePercentFrom(latestClose, range52.low), 4),
    atr14: roundOrNull(atr(candlesAscending, 14), 4),
    annualizedVolatilityPercent: roundOrNull(annualizedVolatility(closes, 20), 4),
  };

  return { values, missing, observationsUsed: candlesAscending.length };
}

function roundOrNull(value: number | null | undefined, decimals: number): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return round(value, decimals);
}

/** Convenience used by the volume-trend endpoint and the quality scorer. */
export function volumeTrend(volumes: ReadonlyArray<number>): "increasing" | "decreasing" | "flat" | "unknown" {
  const avg20 = averageVolume(volumes, 20);
  const avg50 = averageVolume(volumes, 50);
  if (avg20 === null || avg50 === null || avg50 === 0) return "unknown";
  const ratio = avg20 / avg50;
  if (ratio > 1.05) return "increasing";
  if (ratio < 0.95) return "decreasing";
  return "flat";
}
