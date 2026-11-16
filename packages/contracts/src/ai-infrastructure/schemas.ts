import { z } from "zod";
import { entryScoreSchema, qualityScoreSchema } from "../scoring/schemas";
import { indicatorSnapshotSchema } from "../indicators/schemas";

export const aiRelevanceSchema = z.object({
  /** Sourced business description. */
  businessSummary: z.string().nullable(),
  /** Analytical interpretation, clearly labelled. */
  aiInfrastructureRelevance: z.string().nullable(),
  powerInfrastructureExposure: z.string().nullable(),
  dataCenterExposure: z.string().nullable(),
  coolingThermalExposure: z.string().nullable(),
  networkingConnectivityExposure: z.string().nullable(),
  orderBookNotes: z.string().nullable(),
  majorRisks: z.array(z.string()),
  interpretationDisclaimer: z.string(),
});
export type AiRelevance = z.infer<typeof aiRelevanceSchema>;

export const aiInfrastructureCompanySchema = z.object({
  id: z.string().uuid(),
  symbol: z.string(),
  name: z.string(),
  relevance: aiRelevanceSchema,
  /** True when this row came from the configurable watchlist rather than research notes. */
  isWatchlistMember: z.boolean(),
  quote: z
    .object({
      lastPrice: z.number().nullable(),
      changePercent: z.number().nullable(),
      volume: z.number().nullable(),
      observedAt: z.string().datetime().nullable(),
    })
    .nullable(),
  indicators: indicatorSnapshotSchema.nullable(),
  qualityScore: qualityScoreSchema.nullable(),
  entryScore: entryScoreSchema.nullable(),
  latestNews: z
    .array(
      z.object({
        title: z.string(),
        url: z.string().url(),
        publishedAt: z.string().datetime(),
        sourceName: z.string(),
      }),
    )
    .optional(),
  updatedAt: z.string().datetime(),
});
export type AiInfrastructureCompany = z.infer<typeof aiInfrastructureCompanySchema>;

export const aiInfrastructureOverviewSchema = z.object({
  companies: z.array(aiInfrastructureCompanySchema),
  coverage: z.object({
    total: z.number().int(),
    withQualityScore: z.number().int(),
    withEntryScore: z.number().int(),
    withVerifiedFundamentals: z.number().int(),
  }),
  asOf: z.string().datetime(),
});
export type AiInfrastructureOverview = z.infer<typeof aiInfrastructureOverviewSchema>;
