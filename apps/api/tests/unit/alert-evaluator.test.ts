import { describe, expect, it } from "vitest";
import {
  evaluateAlert,
  type AlertEvaluationContext,
} from "../../src/modules/alerts/alert-evaluator";
import { alertRow, indicatorValues } from "../helpers/fixtures";

function context(overrides: Partial<AlertEvaluationContext> = {}): AlertEvaluationContext {
  return {
    alert: alertRow(),
    symbol: "TCS",
    latestClose: 1600,
    previousClose: 1500,
    changePercent: 6.67,
    indicators: indicatorValues(),
    qualityScore: 70,
    entryScore: 60,
    previousQualityScore: 65,
    previousEntryScore: 58,
    previousObservedValue: null,
    now: new Date("2026-11-16T10:00:00.000Z"),
    ...overrides,
  };
}

describe("alert evaluation", () => {
  it("triggers a price threshold that is met", () => {
    const result = evaluateAlert(context());
    expect(result.triggered).toBe(true);
    expect(result.observedValue).toBe(1600);
    expect(result.message).toContain("1600.00");
  });

  it("does not trigger a threshold that is not met", () => {
    const result = evaluateAlert(context({ latestClose: 1400 }));
    expect(result.triggered).toBe(false);
    expect(result.unavailableReason).toBeNull();
  });

  it("reports missing data instead of treating it as zero", () => {
    const result = evaluateAlert(context({ latestClose: null }));
    expect(result.triggered).toBe(false);
    expect(result.observedValue).toBeNull();
    expect(result.unavailableReason).toBe("no stored quote");
  });

  it("requires a previous observation before firing a crossing", () => {
    const alert = alertRow({ operator: "crosses_above", threshold: "1500.0000" });
    const withoutPrevious = evaluateAlert(
      context({ alert, latestClose: 1600, previousObservedValue: null }),
    );
    expect(withoutPrevious.triggered).toBe(false);
    expect(withoutPrevious.unavailableReason).toContain("previous observation");

    const crossing = evaluateAlert(
      context({ alert, latestClose: 1600, previousObservedValue: 1490 }),
    );
    expect(crossing.triggered).toBe(true);

    const alreadyAbove = evaluateAlert(
      context({ alert, latestClose: 1600, previousObservedValue: 1550 }),
    );
    expect(alreadyAbove.triggered).toBe(false);
  });

  it("evaluates RSI thresholds only when RSI exists", () => {
    const alert = alertRow({ type: "rsi_threshold", operator: "above", threshold: "70.0000" });
    expect(evaluateAlert(context({ alert })).triggered).toBe(false);

    const overbought = evaluateAlert(
      context({ alert, indicators: indicatorValues({ rsi14: 75 }) }),
    );
    expect(overbought.triggered).toBe(true);

    const missing = evaluateAlert(context({ alert, indicators: null }));
    expect(missing.triggered).toBe(false);
    expect(missing.unavailableReason).toContain("RSI");
  });

  it("evaluates volume spikes against the configured multiplier", () => {
    const alert = alertRow({
      type: "volume_spike",
      operator: "above",
      threshold: "2.0000",
      parameters: { volumeMultiplier: 2 },
    });
    const spike = evaluateAlert(
      context({ alert, indicators: indicatorValues({ relativeVolume: 2.7 }) }),
    );
    expect(spike.triggered).toBe(true);

    const normal = evaluateAlert(
      context({ alert, indicators: indicatorValues({ relativeVolume: 1.1 }) }),
    );
    expect(normal.triggered).toBe(false);
  });

  it("does not fire a quality change without a previous score", () => {
    const alert = alertRow({
      type: "quality_score_change",
      operator: "change_above",
      threshold: "5.0000",
    });
    const result = evaluateAlert(context({ alert, previousQualityScore: null }));
    expect(result.triggered).toBe(false);
    expect(result.unavailableReason).toBe("no previous quality score to compare against");
  });

  it("fires a quality change when the delta crosses the threshold", () => {
    const alert = alertRow({
      type: "quality_score_change",
      operator: "change_above",
      threshold: "5.0000",
    });
    const result = evaluateAlert(
      context({ alert, qualityScore: 72, previousQualityScore: 65 }),
    );
    expect(result.triggered).toBe(true);
    expect(result.observedValue).toBe(7);
  });

  it("keeps entry-score alerts independent from quality-score alerts", () => {
    const alert = alertRow({
      type: "entry_score_change",
      operator: "change_above",
      threshold: "5.0000",
    });
    const result = evaluateAlert(
      context({ alert, entryScore: 70, previousEntryScore: 58, qualityScore: 99 }),
    );
    expect(result.triggered).toBe(true);
    expect(result.observedValue).toBe(12);
  });
});
