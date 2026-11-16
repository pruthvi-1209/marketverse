import { describe, expect, it } from "vitest";
import {
  mapBulkQuote,
  mapHistoryRow,
  normalizeTradingDate,
  parseIstTimestamp,
} from "../../src/providers/nse/mappers/normalize";
import { mapperContext } from "../helpers/fixtures";

describe("NSE timestamp normalisation", () => {
  it("interprets NSE wall-clock timestamps as IST", () => {
    const parsed = parseIstTimestamp("2026-11-16 16:00:28");
    expect(parsed?.toISOString()).toBe("2026-11-16T10:30:28.000Z");
  });

  it("honours explicit offsets instead of reinterpreting them", () => {
    expect(parseIstTimestamp("2026-11-16T10:30:28.000Z")?.toISOString()).toBe(
      "2026-11-16T10:30:28.000Z",
    );
  });

  it("rejects empty timestamps", () => {
    expect(parseIstTimestamp("")).toBeNull();
    expect(parseIstTimestamp(null)).toBeNull();
  });

  it("normalises DD-MMM-YYYY trading dates", () => {
    expect(normalizeTradingDate("16-Nov-2026")).toBe("2026-11-16");
    expect(normalizeTradingDate("2026-11-16")).toBe("2026-11-16");
    expect(normalizeTradingDate("not-a-date")).toBeNull();
  });
});

describe("bulk quote mapping", () => {
  it("maps the verified NSE bhavcopy payload shape", () => {
    const quote = mapBulkQuote(
      {
        symbol: "tcs",
        close: "1600.50",
        open: "1580.00",
        high: "1610.00",
        low: "1575.00",
        prev_close: "1550.00",
        pct_change: "3.2581",
        volume: "250000",
        date: "2026-11-16",
      },
      mapperContext,
    );

    expect(quote).not.toBeNull();
    expect(quote?.symbol).toBe("TCS");
    expect(quote?.lastPrice).toBe(1600.5);
    expect(quote?.previousClose).toBe(1550);
    expect(quote?.change).toBeCloseTo(50.5, 6);
    expect(quote?.changePercent).toBeCloseTo(3.2581, 6);
    expect(quote?.volume).toBe(250000);
    expect(quote?.provenance.tradingDate).toBe("2026-11-16");
    expect(quote?.provenance.delayClassification).toBe("end_of_day");
    expect(quote?.provenance.provider).toBe("nse");
  });

  it("returns null rather than inventing a symbol", () => {
    expect(mapBulkQuote({ close: "10" }, mapperContext)).toBeNull();
  });

  it("leaves non-numeric values null", () => {
    const quote = mapBulkQuote({ symbol: "INFY", close: "abc" }, mapperContext);
    expect(quote?.lastPrice).toBeNull();
    expect(quote?.change).toBeNull();
  });
});

describe("history mapping", () => {
  it("falls back to ltp when close is absent", () => {
    const candle = mapHistoryRow(
      {
        ltp: "1450.25",
        open: "1440",
        high: "1460",
        low: "1435",
        volume: "1000",
        totalTradedValue: "1450250",
        date: "2026-11-16",
      },
      "TCS",
      mapperContext,
    );

    expect(candle?.symbol).toBe("TCS");
    expect(candle?.close).toBe(1450.25);
    expect(candle?.turnover).toBe(1450250);
    expect(candle?.tradingDate).toBe("2026-11-16");
  });

  it("rejects rows without a trading date", () => {
    expect(mapHistoryRow({ close: "100" }, "TCS", mapperContext)).toBeNull();
  });
});
