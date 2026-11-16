import { z } from "zod";

export const scoringStatusSchema = z.enum(["scored", "missing_data", "not_applicable", "partial"]);
export type ScoringStatus = z.infer<typeof scoringStatusSchema>;

export const subCriterionSchema = z.object({
  key: z.string(),
  label: z.string(),
  points: z.number(),
  maxPoints: z.number(),
  status: scoringStatusSchema,
  explanation: z.string(),
  source: z.string().nullable(),
  dataRequirement: z.string().nullable(),
});
export type SubCriterion = z.infer<typeof subCriterionSchema>;

export const scoreCategorySchema = z.object({
  key: z.string(),
  label: z.string(),
  score: z.number(),
  maxPoints: z.number(),
  coveragePercent: z.number(),
  subCriteria: z.array(subCriterionSchema),
});
export type ScoreCategory = z.infer<typeof scoreCategorySchema>;

export const scoreExplanationSchema = z.object({
  summary: z.string(),
  missingFields: z.array(z.string()),
  riskFactors: z.array(z.string()),
  notes: z.array(z.string()),
});
export type ScoreExplanation = z.infer<typeof scoreExplanationSchema>;

export const qualityScoreSchema = z.object({
  symbol: z.string(),
  score: z.number(),
  maxScore: z.literal(100),
  availablePoints: z.number(),
  coveragePercent: z.number(),
  categories: z.array(scoreCategorySchema),
  missingFields: z.array(z.string()),
  explanation: scoreExplanationSchema,
  methodologyVersion: z.string(),
  calculatedAt: z.string().datetime(),
});
export type QualityScore = z.infer<typeof qualityScoreSchema>;

export const entryScoreSchema = z.object({
  symbol: z.string(),
  score: z.number(),
  maxScore: z.literal(100),
  coveragePercent: z.number(),
  components: z.array(scoreCategorySchema),
  riskFactors: z.array(z.string()),
  invalidationLevel: z.number().nullable(),
  explanation: z.string(),
  methodologyVersion: z.string(),
  calculatedAt: z.string().datetime(),
});
export type EntryScore = z.infer<typeof entryScoreSchema>;

export const combinedScoresSchema = z.object({
  symbol: z.string(),
  quality: qualityScoreSchema.nullable(),
  entry: entryScoreSchema.nullable(),
  disclaimer: z.string(),
});
export type CombinedScores = z.infer<typeof combinedScoresSchema>;

export const QUALITY_METHODOLOGY_VERSION = "1.0.0";
export const ENTRY_METHODOLOGY_VERSION = "1.0.0";

export const SCORE_DISCLAIMER =
  "Scores are informational analytics derived from delayed public market data. " +
  "They are not investment advice, recommendations or guarantees of future performance.";
