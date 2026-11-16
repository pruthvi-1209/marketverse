import type { EntryScore, IndicatorValues, ScoreCategory } from "@marketverse/contracts";
import { ENTRY_METHODOLOGY_VERSION } from "@marketverse/contracts";
import { buildCategory, criterion, inverseTiered, roundScore, tiered, totalCoverage } from "./scoring-helpers";

export interface BenchmarkReturns {
  threeMonthPercent?: number | null;
  oneYearPercent?: number | null;
  symbol?: string | null;
}

export interface EntryScoreInputs {
  symbol: string;
  indicators: IndicatorValues | null;
  /** Latest traded price; required for stop-loss and risk/reward components. */
  latestClose?: number | null;
  benchmark?: BenchmarkReturns | null;
  calculatedAt?: Date;
}

const SOURCE = "technical_indicators (daily OHLCV via NSE)";

function dmaAlignment(indicators: IndicatorValues | null, close: number | null): ScoreCategory {
  const sma20 = indicators?.sma20 ?? null;
  const sma50 = indicators?.sma50 ?? null;
  const sma200 = indicators?.sma200 ?? null;

  return buildCategory("dma_alignment", "DMA alignment", 20, [
    criterion({
      key: "above_sma20",
      label: "Price above 20-day SMA",
      maxPoints: 7,
      points: close === null || sma20 === null ? null : close > sma20 ? 7 : 0,
      explanation:
        close === null || sma20 === null
          ? "Price or 20-day SMA unavailable."
          : close > sma20
            ? "Price is above the short-term average."
            : "Price is below the short-term average.",
      source: SOURCE,
    }),
    criterion({
      key: "sma20_above_sma50",
      label: "20-day SMA above 50-day SMA",
      maxPoints: 7,
      points: sma20 === null || sma50 === null ? null : sma20 > sma50 ? 7 : 0,
      explanation:
        sma20 === null || sma50 === null
          ? "Moving averages unavailable."
          : sma20 > sma50
            ? "Short-term trend is above the intermediate trend."
            : "Short-term trend is not aligned with the intermediate trend.",
      source: SOURCE,
    }),
    criterion({
      key: "above_sma200",
      label: "Price above 200-day SMA",
      maxPoints: 6,
      points: close === null || sma200 === null ? null : close > sma200 ? 6 : 0,
      explanation:
        close === null || sma200 === null
          ? "Price or 200-day SMA unavailable."
          : close > sma200
            ? "Long-term trend supports the setup."
            : "Price is below the 200-day SMA.",
      source: SOURCE,
    }),
  ]);
}

function momentum(indicators: IndicatorValues | null): ScoreCategory {
  const rsi14 = indicators?.rsi14 ?? null;
  const histogram = indicators?.macdHistogram ?? null;
  const oneMonth = indicators?.priceChange1mPercent ?? null;

  let rsiPoints: number | null = null;
  let rsiExplanation = "RSI unavailable.";
  if (rsi14 !== null) {
    if (rsi14 >= 50 && rsi14 <= 70) {
      rsiPoints = 8;
      rsiExplanation = `RSI ${rsi14.toFixed(2)} sits in a constructive 50-70 band.`;
    } else if ((rsi14 >= 45 && rsi14 < 50) || (rsi14 > 70 && rsi14 <= 75)) {
      rsiPoints = 5;
      rsiExplanation = `RSI ${rsi14.toFixed(2)} is acceptable but less ideal.`;
    } else if (rsi14 >= 40 && rsi14 < 45) {
      rsiPoints = 3;
      rsiExplanation = `RSI ${rsi14.toFixed(2)} is weak.`;
    } else {
      rsiPoints = 0;
      rsiExplanation = `RSI ${rsi14.toFixed(2)} is outside a favourable entry band.`;
    }
  }

  return buildCategory("momentum", "Momentum", 20, [
    criterion({
      key: "rsi_band",
      label: "RSI in favourable band",
      maxPoints: 8,
      points: rsiPoints,
      explanation: rsiExplanation,
      source: SOURCE,
    }),
    criterion({
      key: "macd_histogram_positive",
      label: "MACD histogram positive",
      maxPoints: 6,
      points: histogram === null ? null : histogram > 0 ? 6 : 0,
      explanation:
        histogram === null
          ? "MACD requires at least 34 valid closes."
          : histogram > 0
            ? "MACD is above its signal line."
            : "MACD is below its signal line.",
      source: SOURCE,
    }),
    criterion({
      key: "one_month_positive",
      label: "Positive one-month return",
      maxPoints: 6,
      points: oneMonth === null ? null : oneMonth > 0 ? 6 : 0,
      explanation:
        oneMonth === null
          ? "One-month history unavailable."
          : `One-month return is ${oneMonth.toFixed(2)}%.`,
      source: SOURCE,
    }),
  ]);
}

function priceStructure(indicators: IndicatorValues | null): ScoreCategory {
  const distanceHigh = indicators?.distanceFrom52WeekHighPercent ?? null;
  const distanceSma20 = indicators?.distanceFromSma20Percent ?? null;

  return buildCategory("price_structure", "Price structure", 15, [
    criterion({
      key: "near_52w_high",
      label: "Consolidating near 52-week high",
      maxPoints: 8,
      points: distanceHigh === null ? null : distanceHigh >= -5 ? 8 : distanceHigh >= -10 ? 4 : 0,
      explanation:
        distanceHigh === null
          ? "52-week high unavailable."
          : `Price is ${Math.abs(distanceHigh).toFixed(2)}% from its 52-week high.`,
      source: SOURCE,
    }),
    criterion({
      key: "near_sma20",
      label: "Not overextended from 20-day SMA",
      maxPoints: 7,
      points:
        distanceSma20 === null
          ? null
          : Math.abs(distanceSma20) <= 5
            ? 7
            : Math.abs(distanceSma20) <= 10
              ? 3
              : 0,
      explanation:
        distanceSma20 === null
          ? "20-day SMA distance unavailable."
          : `Price is ${distanceSma20.toFixed(2)}% from the 20-day SMA.`,
      source: SOURCE,
    }),
  ]);
}

function volumeConfirmation(indicators: IndicatorValues | null): ScoreCategory {
  const relative = indicators?.relativeVolume ?? null;
  const change = indicators?.volumeChange1dPercent ?? null;

  return buildCategory("volume_confirmation", "Volume confirmation", 15, [
    criterion({
      key: "relative_volume",
      label: "Above-average participation",
      maxPoints: 9,
      points: tiered(relative, [
        { min: 1.5, points: 9 },
        { min: 1.2, points: 6 },
        { min: 1.0, points: 3 },
      ]),
      explanation:
        relative === null
          ? "Relative volume unavailable."
          : `Volume is ${relative.toFixed(2)}x the 20-day average.`,
      source: SOURCE,
    }),
    criterion({
      key: "volume_increase",
      label: "Volume increased versus prior session",
      maxPoints: 6,
      points: change === null ? null : change > 0 ? 6 : 0,
      explanation:
        change === null
          ? "Prior session volume unavailable."
          : `Volume changed ${change.toFixed(2)}% versus the prior session.`,
      source: SOURCE,
    }),
  ]);
}

function relativeStrength(
  indicators: IndicatorValues | null,
  benchmark: BenchmarkReturns | null | undefined,
): ScoreCategory {
  const threeMonth = indicators?.priceChange3mPercent ?? null;
  const oneYear = indicators?.priceChange1yPercent ?? null;
  const benchmarkThreeMonth = benchmark?.threeMonthPercent ?? null;
  const benchmarkOneYear = benchmark?.oneYearPercent ?? null;

  const threeMonthExcess =
    threeMonth !== null && benchmarkThreeMonth !== null ? threeMonth - benchmarkThreeMonth : null;
  const oneYearExcess = oneYear !== null && benchmarkOneYear !== null ? oneYear - benchmarkOneYear : null;

  const benchmarkLabel = benchmark?.symbol ?? "benchmark";

  return buildCategory("relative_strength", "Relative strength", 10, [
    criterion({
      key: "three_month_relative",
      label: "Three-month relative strength",
      maxPoints: 5,
      points:
        threeMonthExcess !== null
          ? threeMonthExcess > 0
            ? 5
            : 0
          : threeMonth === null
            ? null
            : threeMonth > 10
              ? 5
              : 0,
      explanation:
        threeMonth === null
          ? "Three-month return unavailable."
          : threeMonthExcess !== null
            ? `Three-month excess return versus ${benchmarkLabel} is ${threeMonthExcess.toFixed(2)}%.`
            : `Three-month absolute return is ${threeMonth.toFixed(2)}% (benchmark history unavailable).`,
      source: threeMonthExcess !== null ? `${SOURCE}; benchmark index history` : SOURCE,
    }),
    criterion({
      key: "one_year_relative",
      label: "One-year relative strength",
      maxPoints: 5,
      points:
        oneYearExcess !== null
          ? oneYearExcess > 0
            ? 5
            : 0
          : oneYear === null
            ? null
            : oneYear > 20
              ? 5
              : 0,
      explanation:
        oneYear === null
          ? "One-year return unavailable."
          : oneYearExcess !== null
            ? `One-year excess return versus ${benchmarkLabel} is ${oneYearExcess.toFixed(2)}%.`
            : `One-year absolute return is ${oneYear.toFixed(2)}% (benchmark history unavailable).`,
      source: oneYearExcess !== null ? `${SOURCE}; benchmark index history` : SOURCE,
    }),
  ]);
}

export function computeInvalidationLevel(
  close: number | null,
  atr14: number | null,
): number | null {
  if (close === null || atr14 === null || atr14 <= 0) return null;
  return Math.round((close - 2 * atr14) * 100) / 100;
}

function riskRewardCategory(
  close: number | null,
  invalidation: number | null,
  weekHigh: number | null,
): ScoreCategory {
  const target = close !== null && weekHigh !== null && weekHigh > close ? weekHigh : null;
  const risk = close !== null && invalidation !== null ? close - invalidation : null;
  const reward = close !== null && target !== null ? target - close : null;
  const ratio = risk !== null && reward !== null && risk > 0 ? reward / risk : null;

  return buildCategory("risk_reward", "Risk / reward", 10, [
    criterion({
      key: "reward_to_risk",
      label: "Reward-to-risk ratio",
      maxPoints: 10,
      points: ratio === null ? null : ratio >= 2 ? 10 : ratio >= 1.5 ? 7 : ratio >= 1 ? 4 : 0,
      explanation:
        ratio === null
          ? "A reward-to-risk ratio needs a stop level and a target above the current price (52-week high)."
          : `Reward-to-risk ratio is ${ratio.toFixed(2)} (target: 52-week high, risk: 2x ATR).`,
      source: SOURCE,
    }),
  ]);
}

function volatilityCategory(
  close: number | null,
  atr14: number | null,
  invalidation: number | null,
): ScoreCategory {
  const atrPercent = close !== null && atr14 !== null && close > 0 ? (atr14 / close) * 100 : null;
  const stopDistancePercent =
    close !== null && invalidation !== null && close > 0
      ? ((close - invalidation) / close) * 100
      : null;

  return buildCategory("volatility_risk", "Volatility and stop distance", 10, [
    criterion({
      key: "atr_band",
      label: "ATR within a tradable band",
      maxPoints: 6,
      points:
        atrPercent === null
          ? null
          : atrPercent >= 1 && atrPercent <= 4
            ? 6
            : atrPercent > 4 && atrPercent <= 6
              ? 3
              : 0,
      explanation:
        atrPercent === null
          ? "ATR unavailable."
          : `14-day ATR equals ${atrPercent.toFixed(2)}% of price.`,
      source: SOURCE,
    }),
    criterion({
      key: "stop_distance",
      label: "Stop distance reasonable",
      maxPoints: 4,
      points: inverseTiered(stopDistancePercent, [
        { max: 8, points: 4 },
        { max: 12, points: 2 },
      ]),
      explanation:
        stopDistancePercent === null
          ? "Stop distance unavailable without ATR."
          : `Suggested stop is ${stopDistancePercent.toFixed(2)}% below the last close.`,
      source: SOURCE,
    }),
  ]);
}

/**
 * Entry timing score (0-100). Independent from investment quality: a great
 * business can score poorly here when price structure is extended.
 */
export function computeEntryScore(inputs: EntryScoreInputs): EntryScore {
  const calculatedAt = inputs.calculatedAt ?? new Date();
  const close = inputs.latestClose ?? null;
  const atr14 = inputs.indicators?.atr14 ?? null;
  const invalidation = computeInvalidationLevel(close, atr14);

  const components = [
    dmaAlignment(inputs.indicators, close),
    momentum(inputs.indicators),
    priceStructure(inputs.indicators),
    volumeConfirmation(inputs.indicators),
    relativeStrength(inputs.indicators, inputs.benchmark),
    riskRewardCategory(close, invalidation, inputs.indicators?.weekHigh52 ?? null),
    volatilityCategory(close, atr14, invalidation),
  ];

  const score = roundScore(components.reduce((sum, component) => sum + component.score, 0));
  const coveragePercent = totalCoverage(components, 100);

  const riskFactors: string[] = [];
  const rsi14 = inputs.indicators?.rsi14 ?? null;
  const distanceHigh = inputs.indicators?.distanceFrom52WeekHighPercent ?? null;
  const relativeVolume = inputs.indicators?.relativeVolume ?? null;

  if (rsi14 !== null && rsi14 > 70) riskFactors.push("RSI above 70 suggests an overbought condition.");
  if (rsi14 !== null && rsi14 < 40) riskFactors.push("RSI below 40 indicates weak momentum.");
  if (distanceHigh !== null && distanceHigh > -2) {
    riskFactors.push("Price is at or very near its 52-week high; breakout failure risk is elevated.");
  }
  if (relativeVolume !== null && relativeVolume < 1) {
    riskFactors.push("Volume is below its 20-day average, so the move lacks participation.");
  }
  if (close !== null && inputs.indicators?.sma200 !== null && inputs.indicators?.sma200 !== undefined) {
    if (close < inputs.indicators.sma200) riskFactors.push("Price is below the 200-day SMA.");
  }
  if (invalidation !== null && close !== null && close > 0) {
    const stopPercent = ((close - invalidation) / close) * 100;
    if (stopPercent > 10) riskFactors.push("Suggested stop is more than 10% below price, implying high volatility.");
  }
  if (coveragePercent < 60) {
    riskFactors.push("Insufficient technical history: the entry score is provisional.");
  }

  return {
    symbol: inputs.symbol,
    score,
    maxScore: 100,
    coveragePercent,
    components,
    riskFactors,
    invalidationLevel: invalidation,
    explanation:
      `Entry timing score ${score}/100 with ${coveragePercent.toFixed(2)}% data coverage. ` +
      "This measures whether current price structure offers a reasonable entry window. " +
      "It is independent of investment quality and is not a trading recommendation.",
    methodologyVersion: ENTRY_METHODOLOGY_VERSION,
    calculatedAt: calculatedAt.toISOString(),
  };
}
