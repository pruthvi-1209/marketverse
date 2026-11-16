import { describe, expect, it } from "vitest";
import {
  atr,
  averageVolume,
  computeIndicators,
  fiftyTwoWeekRange,
  macd,
  percentageChangeOverPeriods,
  relativeVolume,
  rsi,
  sma,
  trueRange,
  volumeTrend,
  type Candle,
} from "../../src/modules/indicators/calculations";

function trendingCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index;
    return {
      date: new Date(Date.UTC(2025, 0, 1 + index)).toISOString().slice(0, 10),
      open: close - 1,
      high: close + 2,
      low: close - 2,
      close,
      volume: 1_000 + index * 10,
    };
  });
}

describe("moving averages", () => {
  it("computes a simple moving average", () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(sma([1, 2], 5)).toBeNull();
    expect(sma([], 5)).toBeNull();
  });

  it("computes average volume and relative volume", () => {
    expect(averageVolume([100, 200, 300], 3)).toBe(200);
    expect(relativeVolume(400, 200)).toBe(2);
    expect(relativeVolume(null, 200)).toBeNull();
  });
});

describe("momentum indicators", () => {
  it("returns RSI 100 for a strictly rising series", () => {
    const closes = Array.from({ length: 20 }, (_, index) => 100 + index);
    expect(rsi(closes, 14)).toBe(100);
  });

  it("requires enough observations for RSI", () => {
    expect(rsi([100, 101, 102], 14)).toBeNull();
  });

  it("computes MACD components from a rising series", () => {
    const closes = Array.from({ length: 60 }, (_, index) => 100 + index);
    const result = macd(closes);
    expect(result).not.toBeNull();
    expect(result?.macd).toBeGreaterThan(0);
    expect(result?.histogram).toBeCloseTo((result?.macd ?? 0) - (result?.signal ?? 0), 6);
  });

  it("computes period percentage change", () => {
    expect(percentageChangeOverPeriods([100, 110, 121], 2)).toBeCloseTo(21, 6);
    expect(percentageChangeOverPeriods([100], 1)).toBeNull();
  });
});

describe("range and volatility", () => {
  it("computes true range including gaps", () => {
    expect(trueRange({ date: "2026-01-01", open: 100, high: 106, low: 99, close: 105, volume: 1 }, 100)).toBe(7);
    expect(trueRange({ date: "2026-01-01", open: 100, high: 112, low: 111, close: 111, volume: 1 }, 100)).toBe(12);
  });

  it("computes ATR with Wilder smoothing", () => {
    const candles: Candle[] = Array.from({ length: 20 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
      open: 100,
      high: 105,
      low: 95,
      close: 100,
      volume: 1_000,
    }));
    expect(atr(candles, 14)).toBe(10);
    expect(atr(candles.slice(0, 10), 14)).toBeNull();
  });

  it("computes the 52-week range", () => {
    const candles = trendingCandles(300);
    const range = fiftyTwoWeekRange(candles);
    expect(range.high).toBe(401);
    expect(range.low).toBe(146);
  });

  it("classifies volume trend without inventing data", () => {
    expect(volumeTrend([])).toBe("unknown");
    const rising = Array.from({ length: 50 }, (_, index) => 1_000 + index * 100);
    expect(volumeTrend(rising)).toBe("increasing");
    const falling = Array.from({ length: 50 }, (_, index) => 10_000 - index * 100);
    expect(volumeTrend(falling)).toBe("decreasing");
  });
});

describe("computeIndicators", () => {
  it("fills the snapshot from sufficient history", () => {
    const result = computeIndicators(trendingCandles(300));
    expect(result.observationsUsed).toBe(300);
    expect(result.values.sma200).not.toBeNull();
    expect(result.values.rsi14).not.toBeNull();
    expect(result.values.atr14).not.toBeNull();
    expect(result.values.weekHigh52).toBe(401);
    expect(result.values.priceChange1yPercent).not.toBeNull();
    expect(result.missing).not.toContain("sma200");
  });

  it("returns nulls and explicit missing entries instead of zeros", () => {
    const result = computeIndicators([]);
    expect(result.observationsUsed).toBe(0);
    expect(result.values.sma20).toBeNull();
    expect(result.values.rsi14).toBeNull();
    expect(result.values.weekHigh52).toBeNull();
    expect(result.missing).toContain("sma20");
    expect(result.missing).toContain("rsi14");
  });
});
