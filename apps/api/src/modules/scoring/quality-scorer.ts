import type { IndicatorValues, QualityScore, ScoreCategory } from "@marketverse/contracts";
import { QUALITY_METHODOLOGY_VERSION } from "@marketverse/contracts";
import { buildCategory, criterion, roundScore, tiered, inverseTiered, totalCoverage } from "./scoring-helpers";

export interface FundamentalInputs {
  /** Year-over-year revenue growth, in percent. */
  revenueGrowthPercent?: number | null;
  netProfitGrowthPercent?: number | null;
  epsGrowthPercent?: number | null;
  roePercent?: number | null;
  operatingMarginPercent?: number | null;
  debtToEquity?: number | null;
  promoterHoldingPercent?: number | null;
  institutionalHoldingPercent?: number | null;
  /** Period identifier used for source attribution, e.g. "annual 2025-03-31". */
  periodLabel?: string | null;
}

export interface QualityScoreInputs {
  symbol: string;
  indicators: IndicatorValues | null;
  /** Latest close price. Used for trend comparisons; never derived when absent. */
  latestClose?: number | null;
  fundamentals?: FundamentalInputs | null;
  calculatedAt?: Date;
}

const TREND_SOURCE = "technical_indicators (daily OHLCV via NSE)";
const FUNDAMENTAL_SOURCE = "company_fundamentals (verified filings only)";

function trendCategory(
  indicators: IndicatorValues | null,
  latestCloseInput: number | null | undefined,
): ScoreCategory {
  const sma20 = indicators?.sma20 ?? null;
  const sma50 = indicators?.sma50 ?? null;
  const sma200 = indicators?.sma200 ?? null;
  const close =
    latestCloseInput ??
    (indicators?.distanceFromSma20Percent !== null &&
    indicators?.distanceFromSma20Percent !== undefined &&
    sma20 !== null
      ? sma20 * (1 + indicators.distanceFromSma20Percent / 100)
      : null);
  const distanceHigh = indicators?.distanceFrom52WeekHighPercent ?? null;
  const threeMonth = indicators?.priceChange3mPercent ?? null;

  const subCriteria = [
    criterion({
      key: "price_above_sma50",
      label: "Price above 50-day SMA",
      maxPoints: 6,
      points: close !== null && sma50 !== null ? (close > sma50 ? 6 : 0) : null,
      explanation:
        close !== null && sma50 !== null
          ? close > sma50
            ? "Price is trading above the 50-day SMA, a constructive intermediate trend."
            : "Price is trading below the 50-day SMA."
          : "50-day SMA or latest close unavailable.",
      source: TREND_SOURCE,
      dataRequirement: "At least 50 valid daily closes",
    }),
    criterion({
      key: "price_above_sma200",
      label: "Price above 200-day SMA",
      maxPoints: 6,
      points: close !== null && sma200 !== null ? (close > sma200 ? 6 : 0) : null,
      explanation:
        close !== null && sma200 !== null
          ? close > sma200
            ? "Price is above the 200-day SMA, indicating a long-term uptrend."
            : "Price is below the 200-day SMA."
          : "200-day SMA requires roughly 200 valid closes.",
      source: TREND_SOURCE,
      dataRequirement: "At least 200 valid daily closes",
    }),
    criterion({
      key: "sma20_above_sma50",
      label: "20-day SMA above 50-day SMA",
      maxPoints: 5,
      points: sma20 !== null && sma50 !== null ? (sma20 > sma50 ? 5 : 0) : null,
      explanation:
        sma20 !== null && sma50 !== null
          ? sma20 > sma50
            ? "Short-term average is above the intermediate average."
            : "Short-term average is below the intermediate average."
          : "Moving averages unavailable.",
      source: TREND_SOURCE,
    }),
    criterion({
      key: "sma50_above_sma200",
      label: "50-day SMA above 200-day SMA",
      maxPoints: 5,
      points: sma50 !== null && sma200 !== null ? (sma50 > sma200 ? 5 : 0) : null,
      explanation:
        sma50 !== null && sma200 !== null
          ? sma50 > sma200
            ? "Golden-cross style alignment is intact."
            : "50-day SMA is below the 200-day SMA."
          : "Moving averages unavailable.",
      source: TREND_SOURCE,
    }),
    criterion({
      key: "positive_3m_return",
      label: "Positive 3-month return",
      maxPoints: 4,
      points: threeMonth === null ? null : threeMonth > 0 ? 4 : 0,
      explanation:
        threeMonth === null
          ? "Three-month price history unavailable."
          : `Three-month price change is ${threeMonth.toFixed(2)}%.`,
      source: TREND_SOURCE,
    }),
    criterion({
      key: "near_52w_high",
      label: "Within 10% of 52-week high",
      maxPoints: 4,
      points: distanceHigh === null ? null : distanceHigh >= -10 ? 4 : 0,
      explanation:
        distanceHigh === null
          ? "52-week high unavailable."
          : `Price is ${Math.abs(distanceHigh).toFixed(2)}% below the 52-week high.`,
      source: TREND_SOURCE,
      dataRequirement: "Up to 252 trading sessions of highs/lows",
    }),
  ];

  return buildCategory("trend", "Trend", 30, subCriteria);
}

function volumeCategory(indicators: IndicatorValues | null): ScoreCategory {
  const relVolume = indicators?.relativeVolume ?? null;
  const avg20 = indicators?.averageVolume20 ?? null;
  const avg50 = indicators?.averageVolume50 ?? null;
  const volumeChange = indicators?.volumeChange1dPercent ?? null;

  const subCriteria = [
    criterion({
      key: "relative_volume",
      label: "Elevated relative volume",
      maxPoints: 4,
      points: tiered(relVolume, [
        { min: 1.2, points: 4 },
        { min: 1.0, points: 2 },
      ]),
      explanation:
        relVolume === null
          ? "Relative volume unavailable."
          : `Latest volume is ${relVolume.toFixed(2)}x the 20-day average.`,
      source: TREND_SOURCE,
    }),
    criterion({
      key: "participation_above_average",
      label: "20-day volume above 50-day volume",
      maxPoints: 3,
      points: avg20 === null || avg50 === null ? null : avg20 > avg50 ? 3 : 0,
      explanation:
        avg20 === null || avg50 === null
          ? "Long-term average volume unavailable."
          : avg20 > avg50
            ? "Recent participation is above its longer-term baseline."
            : "Recent participation is not above its longer-term baseline.",
      source: TREND_SOURCE,
      dataRequirement: "50 sessions of volume",
    }),
    criterion({
      key: "volume_change_1d",
      label: "Volume increased versus previous session",
      maxPoints: 3,
      points: volumeChange === null ? null : volumeChange > 0 ? 3 : 0,
      explanation:
        volumeChange === null
          ? "Previous session volume unavailable."
          : `Volume changed ${volumeChange.toFixed(2)}% versus the prior session.`,
      source: TREND_SOURCE,
    }),
  ];

  return buildCategory("volume_participation", "Volume and participation", 10, subCriteria);
}

function growthCategory(fundamentals: FundamentalInputs | null | undefined): ScoreCategory {
  const source = `${FUNDAMENTAL_SOURCE}${fundamentals?.periodLabel ? ` — ${fundamentals.periodLabel}` : ""}`;
  const revenue = fundamentals?.revenueGrowthPercent ?? null;
  const profit = fundamentals?.netProfitGrowthPercent ?? null;
  const eps = fundamentals?.epsGrowthPercent ?? null;

  const subCriteria = [
    criterion({
      key: "revenue_growth",
      label: "Revenue growth",
      maxPoints: 12,
      points: tiered(revenue, [
        { min: 15, points: 12 },
        { min: 8, points: 8 },
        { min: 0, points: 4 },
      ]),
      explanation:
        revenue === null
          ? "Verified revenue growth is not available, so no growth points are awarded."
          : `Revenue growth of ${revenue.toFixed(2)}% year over year.`,
      source,
      dataRequirement: "Verified revenue for the current and prior comparable period",
    }),
    criterion({
      key: "net_profit_growth",
      label: "Net profit growth",
      maxPoints: 10,
      points: tiered(profit, [
        { min: 15, points: 10 },
        { min: 8, points: 6 },
        { min: 0, points: 3 },
      ]),
      explanation:
        profit === null ? "Verified net profit growth is not available." : `Net profit growth of ${profit.toFixed(2)}%.`,
      source,
      dataRequirement: "Verified net profit for the current and prior comparable period",
    }),
    criterion({
      key: "eps_growth",
      label: "EPS growth",
      maxPoints: 8,
      points: tiered(eps, [
        { min: 15, points: 8 },
        { min: 8, points: 5 },
        { min: 0, points: 2 },
      ]),
      explanation: eps === null ? "Verified EPS growth is not available." : `EPS growth of ${eps.toFixed(2)}%.`,
      source,
      dataRequirement: "Verified diluted EPS for both periods",
    }),
  ];

  return buildCategory("business_growth", "Business growth", 30, subCriteria);
}

function qualityCategory(fundamentals: FundamentalInputs | null | undefined): ScoreCategory {
  const source = `${FUNDAMENTAL_SOURCE}${fundamentals?.periodLabel ? ` — ${fundamentals.periodLabel}` : ""}`;
  const roe = fundamentals?.roePercent ?? null;
  const margin = fundamentals?.operatingMarginPercent ?? null;
  const debt = fundamentals?.debtToEquity ?? null;

  const subCriteria = [
    criterion({
      key: "roe",
      label: "Return on equity",
      maxPoints: 8,
      points: tiered(roe, [
        { min: 15, points: 8 },
        { min: 10, points: 5 },
        { min: 5, points: 2 },
      ]),
      explanation: roe === null ? "Verified ROE is not available." : `ROE of ${roe.toFixed(2)}%.`,
      source,
      dataRequirement: "Verified net profit and shareholders' equity",
    }),
    criterion({
      key: "operating_margin",
      label: "Operating margin",
      maxPoints: 6,
      points: tiered(margin, [
        { min: 12, points: 6 },
        { min: 8, points: 4 },
        { min: 0, points: 2 },
      ]),
      explanation:
        margin === null ? "Verified operating margin is not available." : `Operating margin of ${margin.toFixed(2)}%.`,
      source,
      dataRequirement: "Verified operating profit and revenue",
    }),
    criterion({
      key: "debt_to_equity",
      label: "Leverage (debt to equity)",
      maxPoints: 6,
      points: inverseTiered(debt, [
        { max: 1, points: 6 },
        { max: 1.5, points: 3 },
      ]),
      explanation:
        debt === null ? "Verified debt-to-equity is not available." : `Debt-to-equity of ${debt.toFixed(2)}x.`,
      source,
      dataRequirement: "Verified total debt and shareholders' equity",
    }),
  ];

  return buildCategory("quality", "Quality", 20, subCriteria);
}

function ownershipCategory(fundamentals: FundamentalInputs | null | undefined): ScoreCategory {
  const source = `${FUNDAMENTAL_SOURCE} — shareholding pattern`;
  const promoter = fundamentals?.promoterHoldingPercent ?? null;
  const institutional = fundamentals?.institutionalHoldingPercent ?? null;

  const subCriteria = [
    criterion({
      key: "promoter_holding",
      label: "Promoter holding",
      maxPoints: 5,
      points: tiered(promoter, [
        { min: 50, points: 5 },
        { min: 35, points: 3 },
      ]),
      explanation:
        promoter === null ? "Verified promoter holding is not available." : `Promoter holding is ${promoter.toFixed(2)}%.`,
      source,
      dataRequirement: "Verified shareholding pattern",
    }),
    criterion({
      key: "institutional_holding",
      label: "Institutional holding",
      maxPoints: 5,
      points: tiered(institutional, [
        { min: 10, points: 5 },
        { min: 5, points: 3 },
      ]),
      explanation:
        institutional === null
          ? "Verified institutional holding is not available."
          : `Institutional holding is ${institutional.toFixed(2)}%.`,
      source,
      dataRequirement: "Verified shareholding pattern",
    }),
  ];

  return buildCategory("ownership", "Ownership", 10, subCriteria);
}

/**
 * Investment quality score (0-100). Points are only awarded when the required
 * verified data exists; missing fundamentals reduce both score and coverage.
 */
export function computeQualityScore(inputs: QualityScoreInputs): QualityScore {
  const calculatedAt = inputs.calculatedAt ?? new Date();
  const categories = [
    trendCategory(inputs.indicators, inputs.latestClose),
    volumeCategory(inputs.indicators),
    growthCategory(inputs.fundamentals),
    qualityCategory(inputs.fundamentals),
    ownershipCategory(inputs.fundamentals),
  ];

  const score = roundScore(categories.reduce((sum, category) => sum + category.score, 0));
  const availablePoints = roundScore(
    categories.reduce(
      (sum, category) => sum + (category.maxPoints * category.coveragePercent) / 100,
      0,
    ),
  );
  const coveragePercent = totalCoverage(categories, 100);

  const missingFields = categories.flatMap((category) =>
    category.subCriteria
      .filter((sub) => sub.status === "missing_data")
      .map((sub) => sub.key),
  );

  const explanations: string[] = [];
  for (const category of categories) {
    for (const sub of category.subCriteria) {
      if (sub.status === "scored" && sub.points > 0) {
        explanations.push(`${sub.label}: ${sub.points}/${sub.maxPoints}`);
      }
    }
  }

  return {
    symbol: inputs.symbol,
    score,
    maxScore: 100,
    availablePoints,
    coveragePercent,
    categories,
    missingFields,
    explanation: {
      summary:
        `Quality score ${score}/100 with ${availablePoints.toFixed(2)} points available ` +
        `(${coveragePercent.toFixed(2)}% data coverage). Missing data is never awarded points.`,
      missingFields,
      riskFactors: buildQualityRiskFactors(categories, coveragePercent),
      notes: [
        ...explanations,
        "Fundamental inputs must come from verified filings; unavailable figures are left blank.",
      ],
    },
    methodologyVersion: QUALITY_METHODOLOGY_VERSION,
    calculatedAt: calculatedAt.toISOString(),
  };
}

function buildQualityRiskFactors(categories: ScoreCategory[], coveragePercent: number): string[] {
  const risks: string[] = [];
  const find = (categoryKey: string, criterionKey: string) =>
    categories
      .find((category) => category.key === categoryKey)
      ?.subCriteria.find((sub) => sub.key === criterionKey);

  if (find("trend", "price_above_sma200")?.points === 0) {
    risks.push("Price is below its 200-day moving average.");
  }
  if (find("trend", "near_52w_high")?.points === 0) {
    risks.push("Price is more than 10% below its 52-week high.");
  }
  if (find("volume_participation", "relative_volume")?.points === 0) {
    risks.push("Recent volume is below its 20-day average.");
  }
  if (find("quality", "debt_to_equity")?.points === 0) {
    risks.push("Leverage exceeds 1.5x debt-to-equity.");
  }
  if (coveragePercent < 60) {
    risks.push("Fundamental coverage is incomplete; treat the score as provisional.");
  }
  return risks;
}
