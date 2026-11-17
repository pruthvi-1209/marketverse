import { describe, expect, it } from "vitest";
import { computeEntryScore, computeInvalidationLevel } from "../../src/modules/scoring/entry-scorer";
import { computeQualityScore } from "../../src/modules/scoring/quality-scorer";
import { completeFundamentals, indicatorValues } from "../helpers/fixtures";

describe("quality score", () => {
  it("awards full coverage only when every input is present", () => {
    const score = computeQualityScore({
      symbol: "TCS",
      indicators: indicatorValues(),
      latestClose: 108,
      fundamentals: completeFundamentals,
      calculatedAt: new Date("2026-11-16T12:00:00.000Z"),
    });

    expect(score.maxScore).toBe(100);
    expect(score.coveragePercent).toBe(100);
    expect(score.availablePoints).toBe(100);
    expect(score.score).toBeGreaterThan(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.categories.map((category) => category.key)).toEqual([
      "trend",
      "volume_participation",
      "business_growth",
      "quality",
      "ownership",
    ]);
    expect(score.explanation.summary).toContain("Missing data is never awarded points");
  });

  it("never awards points for missing data", () => {
    const score = computeQualityScore({
      symbol: "NEW",
      indicators: null,
      fundamentals: null,
    });

    expect(score.score).toBe(0);
    expect(score.availablePoints).toBe(0);
    expect(score.coveragePercent).toBe(0);
    expect(score.missingFields).toContain("revenue_growth");
    expect(score.explanation.riskFactors).toContain(
      "Fundamental coverage is incomplete; treat the score as provisional.",
    );
  });

  it("leaves trend points missing when only fundamentals are available", () => {
    const score = computeQualityScore({
      symbol: "FUND",
      indicators: null,
      fundamentals: completeFundamentals,
    });

    // Fundamentals can still earn growth/quality/ownership points.
    expect(score.score).toBeGreaterThan(0);
    expect(score.coveragePercent).toBeGreaterThan(0);
    expect(score.coveragePercent).toBeLessThan(100);
  });
});

describe("entry score", () => {
  const benchmark = { symbol: "NIFTY 50", threeMonthPercent: 5, oneYearPercent: 10 };

  it("scores entry timing independently from fundamental quality", () => {
    const entry = computeEntryScore({
      symbol: "TCS",
      indicators: indicatorValues(),
      latestClose: 108,
      benchmark,
    });

    expect(entry.coveragePercent).toBe(100);
    expect(entry.score).toBeGreaterThan(0);
    expect(entry.components.map((component) => component.key)).toEqual([
      "dma_alignment",
      "momentum",
      "price_structure",
      "volume_confirmation",
      "relative_strength",
      "risk_reward",
      "volatility_risk",
    ]);
    expect(entry.riskFactors).toEqual([]);
  });

  it("does not award points when technical inputs are absent", () => {
    const entry = computeEntryScore({
      symbol: "NEW",
      indicators: null,
      latestClose: null,
      benchmark: null,
    });

    expect(entry.score).toBe(0);
    expect(entry.coveragePercent).toBe(0);
    expect(entry.invalidationLevel).toBeNull();
    expect(entry.explanation).toContain("coverage");
  });

  it("computes the invalidation level as close minus two ATRs", () => {
    expect(computeInvalidationLevel(100, 5)).toBe(90);
    expect(computeInvalidationLevel(100, null)).toBeNull();
    expect(computeInvalidationLevel(null, 5)).toBeNull();
  });

  it("keeps quality high while entry is weak for an overextended stock", () => {
    const extended = indicatorValues({
      rsi14: 85,
      distanceFromSma20Percent: 18,
      distanceFromSma50Percent: 30,
      relativeVolume: 3,
      weekHigh52: 170,
      distanceFrom52WeekHighPercent: -5,
    });

    const quality = computeQualityScore({
      symbol: "HOT",
      indicators: extended,
      latestClose: 150,
      fundamentals: completeFundamentals,
    });
    const entry = computeEntryScore({
      symbol: "HOT",
      indicators: extended,
      latestClose: 150,
      benchmark,
    });

    expect(quality.coveragePercent).toBe(100);
    expect(entry.coveragePercent).toBe(100);
    expect(entry.riskFactors.length).toBeGreaterThan(0);
    // Both scores are computed from the same inputs but are not forced to agree.
    expect(entry.score).not.toBe(quality.score);
  });
});
