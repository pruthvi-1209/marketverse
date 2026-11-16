import type { AlertOperator, AlertType, IndicatorValues } from "@marketverse/contracts";
import type { AlertRow } from "../../database/schema";

export interface AlertEvaluationContext {
  alert: AlertRow;
  symbol: string;
  latestClose: number | null;
  previousClose: number | null;
  changePercent: number | null;
  indicators: IndicatorValues | null;
  qualityScore: number | null;
  entryScore: number | null;
  previousQualityScore: number | null;
  previousEntryScore: number | null;
  /** Observed value from the previous trigger, used for crossing operators. */
  previousObservedValue: number | null;
  now: Date;
}

export interface AlertEvaluationResult {
  triggered: boolean;
  observedValue: number | null;
  message: string;
  /** Human-readable reason when the rule could not be evaluated. */
  unavailableReason: string | null;
}

const TYPE_LABELS: Record<AlertType, string> = {
  price_threshold: "price threshold",
  percent_change: "percent change",
  dma_crossover: "DMA crossover",
  rsi_threshold: "RSI threshold",
  volume_spike: "volume spike",
  quality_score_change: "quality score change",
  entry_score_change: "entry score change",
  watchlist_event: "watchlist move",
};

function compare(
  operator: AlertOperator,
  observed: number | null,
  threshold: number | null,
  previous: number | null,
): { triggered: boolean; reason: string | null } {
  if (observed === null) return { triggered: false, reason: "observed value is unavailable" };
  if (threshold === null) return { triggered: false, reason: "threshold is not configured" };

  switch (operator) {
    case "above":
    case "change_above":
      return { triggered: observed > threshold, reason: null };
    case "below":
    case "change_below":
      return { triggered: observed < threshold, reason: null };
    case "crosses_above":
    case "crosses_below": {
      // A crossing needs a previous observation; otherwise the first evaluation
      // would fire on a state that may have existed for months.
      if (previous === null) {
        return {
          triggered: false,
          reason: "a crossing requires a previous observation and none is recorded yet",
        };
      }
      const triggered =
        operator === "crosses_above"
          ? previous <= threshold && observed > threshold
          : previous >= threshold && observed < threshold;
      return { triggered, reason: null };
    }
    default:
      return { triggered: false, reason: `unsupported operator '${operator}'` };
  }
}

function numericParameter(
  parameters: Record<string, number | string | boolean> | null,
  key: string,
  fallback: number,
): number {
  const value = parameters?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Pure alert evaluation. The caller supplies every observation so this can be
 * unit tested without a database or a live provider. Missing data never
 * triggers an alert: it returns `triggered: false` with an explanation.
 */
export function evaluateAlert(context: AlertEvaluationContext): AlertEvaluationResult {
  const { alert, indicators } = context;
  const threshold = alert.threshold === null ? null : Number(alert.threshold);

  const unavailable = (reason: string): AlertEvaluationResult => ({
    triggered: false,
    observedValue: null,
    message: `${alert.name}: not evaluated (${reason})`,
    unavailableReason: reason,
  });

  switch (alert.type) {
    case "price_threshold": {
      if (context.latestClose === null) return unavailable("no stored quote");
      const result = compare(alert.operator, context.latestClose, threshold, context.previousObservedValue);
      if (result.triggered) {
        return {
          triggered: true,
          observedValue: context.latestClose,
          message: `${context.symbol} price ${context.latestClose.toFixed(2)} ${describeOperator(
            alert.operator,
          )} ${threshold ?? "?"} (${TYPE_LABELS[alert.type]})`,
          unavailableReason: result.reason,
        };
      }
      return {
        triggered: false,
        observedValue: context.latestClose,
        message: `${context.symbol} price did not meet the ${TYPE_LABELS[alert.type]} rule`,
        unavailableReason: result.reason,
      };
    }

    case "percent_change":
    case "watchlist_event": {
      if (context.changePercent === null) return unavailable("no stored change percent");
      const result = compare(
        alert.operator,
        context.changePercent,
        threshold,
        context.previousObservedValue,
      );
      const label = alert.type === "watchlist_event" ? "watchlist item" : "session";
      if (result.triggered) {
        return {
          triggered: true,
          observedValue: context.changePercent,
          message: `${context.symbol} moved ${context.changePercent.toFixed(2)}% ${describeOperator(
            alert.operator,
          )} ${threshold ?? "?"}% (${label} move)`,
          unavailableReason: result.reason,
        };
      }
      return {
        triggered: false,
        observedValue: context.changePercent,
        message: `${context.symbol} percent change did not meet the rule`,
        unavailableReason: result.reason,
      };
    }

    case "dma_crossover": {
      if (context.latestClose === null) return unavailable("no stored quote");
      const period = Math.round(numericParameter(alert.parameters, "dmaPeriod", 50));
      const dma =
        period === 20
          ? (indicators?.sma20 ?? null)
          : period === 50
            ? (indicators?.sma50 ?? null)
            : period === 100
              ? (indicators?.sma100 ?? null)
              : period === 200
                ? (indicators?.sma200 ?? null)
                : null;
      if (dma === null) return unavailable(`${period}-day moving average is unavailable`);
      const result = compare(alert.operator, context.latestClose, dma, context.previousObservedValue);
      if (result.triggered) {
        return {
          triggered: true,
          observedValue: context.latestClose,
          message: `${context.symbol} closed at ${context.latestClose.toFixed(2)}, ${describeOperator(
            alert.operator,
          )} its ${period}-day SMA of ${dma.toFixed(2)}`,
          unavailableReason: result.reason,
        };
      }
      return {
        triggered: false,
        observedValue: context.latestClose,
        message: `${context.symbol} is not crossing its ${period}-day SMA`,
        unavailableReason: result.reason,
      };
    }

    case "rsi_threshold": {
      const rsi = indicators?.rsi14 ?? null;
      if (rsi === null) return unavailable("RSI requires at least 15 daily closes");
      const result = compare(alert.operator, rsi, threshold, context.previousObservedValue);
      if (result.triggered) {
        return {
          triggered: true,
          observedValue: rsi,
          message: `${context.symbol} RSI(14) ${rsi.toFixed(2)} ${describeOperator(
            alert.operator,
          )} ${threshold ?? "?"}`,
          unavailableReason: result.reason,
        };
      }
      return {
        triggered: false,
        observedValue: rsi,
        message: `${context.symbol} RSI(14) did not meet the rule`,
        unavailableReason: result.reason,
      };
    }

    case "volume_spike": {
      const relative = indicators?.relativeVolume ?? null;
      if (relative === null) return unavailable("relative volume is unavailable");
      const multiplier = numericParameter(alert.parameters, "volumeMultiplier", threshold ?? 2);
      const result = compare(alert.operator === "below" ? "below" : "above", relative, multiplier, context.previousObservedValue);
      if (result.triggered) {
        return {
          triggered: true,
          observedValue: relative,
          message: `${context.symbol} volume is ${relative.toFixed(2)}x its 20-day average (threshold ${multiplier}x)`,
          unavailableReason: result.reason,
        };
      }
      return {
        triggered: false,
        observedValue: relative,
        message: `${context.symbol} volume did not spike above ${multiplier}x average`,
        unavailableReason: result.reason,
      };
    }

    case "quality_score_change": {
      const score = context.qualityScore;
      if (score === null) return unavailable("no stored quality score");
      const baseline = context.previousQualityScore;
      if (baseline === null) {
        return {
          triggered: false,
          observedValue: score,
          message: `${context.symbol} has a quality score of ${score.toFixed(2)} but no previous score to compare against`,
          unavailableReason: "no previous quality score to compare against",
        };
      }
      const delta = score - baseline;
      const result = compare(alert.operator, delta, threshold, context.previousObservedValue);
      if (result.triggered) {
        return {
          triggered: true,
          observedValue: delta,
          message: `${context.symbol} quality score changed by ${delta.toFixed(2)} points to ${score.toFixed(
            2,
          )}`,
          unavailableReason: result.reason,
        };
      }
      return {
        triggered: false,
        observedValue: delta,
        message: `${context.symbol} quality score change (${delta.toFixed(2)}) did not meet the rule`,
        unavailableReason: result.reason,
      };
    }

    case "entry_score_change": {
      const score = context.entryScore;
      if (score === null) return unavailable("no stored entry score");
      const baseline = context.previousEntryScore;
      if (baseline === null) {
        return {
          triggered: false,
          observedValue: score,
          message: `${context.symbol} has an entry score of ${score.toFixed(2)} but no previous score to compare against`,
          unavailableReason: "no previous entry score to compare against",
        };
      }
      const delta = score - baseline;
      const result = compare(alert.operator, delta, threshold, context.previousObservedValue);
      if (result.triggered) {
        return {
          triggered: true,
          observedValue: delta,
          message: `${context.symbol} entry score changed by ${delta.toFixed(2)} points to ${score.toFixed(2)}`,
          unavailableReason: result.reason,
        };
      }
      return {
        triggered: false,
        observedValue: delta,
        message: `${context.symbol} entry score change (${delta.toFixed(2)}) did not meet the rule`,
        unavailableReason: result.reason,
      };
    }

    default:
      return unavailable(`alert type '${String(alert.type)}' is not supported`);
  }
}

function describeOperator(operator: AlertOperator): string {
  switch (operator) {
    case "above":
      return ">=";
    case "below":
      return "<=";
    case "crosses_above":
      return "crossed above";
    case "crosses_below":
      return "crossed below";
    case "change_above":
      return ">=";
    case "change_below":
      return "<=";
    default:
      return operator;
  }
}
