import type { ScoreCategory, ScoringStatus, SubCriterion } from "@marketverse/contracts";

export interface CriterionDefinition {
  key: string;
  label: string;
  maxPoints: number;
  /** Points awarded, or null when the required data is unavailable. */
  points: number | null;
  explanation: string;
  source?: string | null;
  dataRequirement?: string | null;
  status?: ScoringStatus;
}

export function criterion(definition: CriterionDefinition): SubCriterion {
  const status: ScoringStatus =
    definition.status ?? (definition.points === null ? "missing_data" : "scored");
  return {
    key: definition.key,
    label: definition.label,
    points: definition.points ?? 0,
    maxPoints: definition.maxPoints,
    status,
    explanation: definition.explanation,
    source: definition.source ?? null,
    dataRequirement: definition.dataRequirement ?? null,
  };
}

/** Builds a category and derives coverage from the subcriteria that were scorable. */
export function buildCategory(
  key: string,
  label: string,
  maxPoints: number,
  subCriteria: SubCriterion[],
): ScoreCategory {
  const score = subCriteria.reduce((sum, item) => sum + item.points, 0);
  const scorable = subCriteria.reduce(
    (sum, item) => sum + (item.status === "missing_data" ? 0 : item.maxPoints),
    0,
  );
  const coveragePercent = maxPoints > 0 ? (scorable / maxPoints) * 100 : 0;
  return {
    key,
    label,
    score: Math.round(score * 100) / 100,
    maxPoints,
    coveragePercent: Math.round(coveragePercent * 100) / 100,
    subCriteria,
  };
}

export function totalCoverage(categories: ScoreCategory[], maxScore: number): number {
  const available = categories.reduce(
    (sum, category) => sum + (category.maxPoints * category.coveragePercent) / 100,
    0,
  );
  return maxScore > 0 ? Math.round((available / maxScore) * 10000) / 100 : 0;
}

/**
 * Tiered allocation: returns the first matching tier's points, or 0 when the
 * value is known but does not meet any tier.
 */
export function tiered(
  value: number | null | undefined,
  tiers: Array<{ min: number; points: number }>,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const sorted = [...tiers].sort((a, b) => b.min - a.min);
  for (const tier of sorted) {
    if (value >= tier.min) return tier.points;
  }
  return 0;
}

/** Inverse tier: lower is better (e.g. debt/equity). */
export function inverseTiered(
  value: number | null | undefined,
  tiers: Array<{ max: number; points: number }>,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const sorted = [...tiers].sort((a, b) => a.max - b.max);
  for (const tier of sorted) {
    if (value <= tier.max) return tier.points;
  }
  return 0;
}

export function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}
