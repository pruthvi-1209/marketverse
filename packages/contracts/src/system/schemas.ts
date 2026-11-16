import { z } from "zod";

export const providerStatusSchema = z.object({
  name: z.enum(["nse-bhavcopy", "nse-cm-market"]),
  url: z.string(),
  enabled: z.boolean(),
  status: z.enum(["connected", "unavailable", "disabled", "unknown"]),
  detail: z.string().nullable(),
  toolCount: z.number().int().nullable(),
  lastConnectedAt: z.string().datetime().nullable(),
  lastErrorAt: z.string().datetime().nullable(),
  capabilities: z.array(z.string()).optional(),
});
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

export const nseToolSummarySchema = z.object({
  provider: z.enum(["nse-bhavcopy", "nse-cm-market"]),
  name: z.string(),
  description: z.string().nullable(),
  inputSchema: z.unknown(),
  requiredFields: z.array(z.string()),
  discoveredAt: z.string().datetime(),
  supported: z.boolean(),
  notes: z.array(z.string()),
});
export type NseToolSummary = z.infer<typeof nseToolSummarySchema>;

export const dataFreshnessEntrySchema = z.object({
  dataset: z.string(),
  source: z.string(),
  newestObservationAt: z.string().datetime().nullable(),
  tradingDate: z.string().nullable(),
  ageSeconds: z.number().nullable(),
  status: z.enum(["fresh", "stale", "missing", "unknown"]),
  rowCount: z.number().int(),
  notes: z.array(z.string()),
});
export type DataFreshnessEntry = z.infer<typeof dataFreshnessEntrySchema>;

export const jobRunSchema = z.object({
  id: z.string().uuid(),
  jobName: z.string(),
  status: z.enum(["running", "success", "partial", "failed", "skipped"]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().nullable(),
  durationMs: z.number().nullable(),
  attempt: z.number().int(),
  itemsProcessed: z.number().int(),
  errorMessage: z.string().nullable(),
  details: z.unknown().nullable(),
});
export type JobRun = z.infer<typeof jobRunSchema>;

export const jobSummarySchema = z.object({
  name: z.string(),
  schedule: z.string(),
  enabled: z.boolean(),
  lastRun: jobRunSchema.nullable(),
  consecutiveFailures: z.number().int(),
});
export type JobSummary = z.infer<typeof jobSummarySchema>;

export const systemStatusSchema = z.object({
  status: z.enum(["ok", "degraded", "error"]),
  version: z.string(),
  environment: z.string(),
  startedAt: z.string().datetime(),
  uptimeSeconds: z.number(),
  database: z.object({
    connected: z.boolean(),
    latencyMs: z.number().nullable(),
    migrationCount: z.number().int().nullable(),
  }),
  providers: z.array(providerStatusSchema),
  jobs: z.object({ enabled: z.boolean(), scheduled: z.number().int() }),
  counts: z.object({
    stocks: z.number().int(),
    quotes: z.number().int(),
    historicalPrices: z.number().int(),
    watchlists: z.number().int(),
    alerts: z.number().int(),
  }),
});
export type SystemStatus = z.infer<typeof systemStatusSchema>;
