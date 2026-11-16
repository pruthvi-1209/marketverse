import { describe, expect, it } from "vitest";
import {
  freshnessFor,
  isMarketSessionOpen,
  isValidTradingDate,
  istCloseInstant,
  toIstTradingDate,
} from "../../src/core/utils/time";

describe("IST date handling", () => {
  it("derives the Indian trading date across the UTC midnight boundary", () => {
    // 23:59:59 IST on 16 Nov 2026.
    expect(toIstTradingDate(new Date("2026-11-16T18:29:59.000Z"))).toBe("2026-11-16");
    // 00:00:00 IST on 17 Nov 2026.
    expect(toIstTradingDate(new Date("2026-11-16T18:30:00.000Z"))).toBe("2026-11-17");
  });

  it("treats the 15:30 IST close as 10:00 UTC", () => {
    expect(istCloseInstant("2026-11-16").toISOString()).toBe("2026-11-16T10:00:00.000Z");
  });

  it("detects the regular cash session and weekends", () => {
    // Monday 10:00 IST.
    expect(isMarketSessionOpen(new Date("2026-11-16T04:30:00.000Z"))).toBe(true);
    // Monday 09:00 IST.
    expect(isMarketSessionOpen(new Date("2026-11-16T03:30:00.000Z"))).toBe(false);
    // Saturday 10:00 IST.
    expect(isMarketSessionOpen(new Date("2026-11-21T04:30:00.000Z"))).toBe(false);
  });

  it("validates trading date strings strictly", () => {
    expect(isValidTradingDate("2026-11-16")).toBe(true);
    expect(isValidTradingDate("2026-02-30")).toBe(false);
    expect(isValidTradingDate("16-11-2026")).toBe(false);
  });
});

describe("freshness classification", () => {
  const now = new Date("2026-11-16T10:00:00.000Z");

  it("marks recent observations fresh", () => {
    expect(
      freshnessFor(new Date("2026-11-16T09:58:00.000Z"), 600, now),
    ).toEqual({ status: "fresh", ageSeconds: 120, staleAfterSeconds: 600 });
  });

  it("marks old observations stale", () => {
    const result = freshnessFor(new Date("2026-11-16T08:00:00.000Z"), 600, now);
    expect(result.status).toBe("stale");
    expect(result.ageSeconds).toBe(7200);
  });

  it("returns unknown rather than pretending when there is no observation", () => {
    expect(freshnessFor(null, 600, now)).toEqual({
      status: "unknown",
      ageSeconds: null,
      staleAfterSeconds: 600,
    });
  });
});
