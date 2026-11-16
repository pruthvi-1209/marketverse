import { z } from "zod";

/**
 * Every externally sourced observation is wrapped in this envelope so clients
 * can always tell where data came from and how old it is. MarketVerse never
 * presents NSE data as guaranteed real-time.
 */
export const delayClassificationSchema = z.enum([
  "real_time",
  "delayed_1_3_min",
  "end_of_day",
  "unknown",
]);
export type DelayClassification = z.infer<typeof delayClassificationSchema>;

export const freshnessStatusSchema = z.enum(["fresh", "stale", "unknown"]);
export type FreshnessStatus = z.infer<typeof freshnessStatusSchema>;

export const freshnessSchema = z.object({
  status: freshnessStatusSchema,
  ageSeconds: z.number().nullable(),
  staleAfterSeconds: z.number(),
});
export type Freshness = z.infer<typeof freshnessSchema>;

export const responseMetaSchema = z.object({
  provider: z.string(),
  tool: z.string().nullable().optional(),
  retrievedAt: z.string().datetime(),
  observedAt: z.string().datetime().nullable(),
  /** Indian exchange trading date (YYYY-MM-DD, Asia/Kolkata). */
  tradingDate: z.string().nullable(),
  delayClassification: delayClassificationSchema,
  freshness: freshnessSchema,
  cached: z.boolean(),
  warnings: z.array(z.string()),
});
export type ResponseMeta = z.infer<typeof responseMetaSchema>;

export const paginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
});
export type Pagination = z.infer<typeof paginationSchema>;

export function envelopeSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data, meta: responseMetaSchema });
}

export function paginatedEnvelopeSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item),
    meta: responseMetaSchema,
    pagination: paginationSchema,
  });
}

export const apiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "DATA_UNAVAILABLE",
  "INTERNAL_ERROR",
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().nullable(),
  }),
});
export type ApiErrorResponse = z.infer<typeof apiErrorSchema>;

export const healthSchema = z.object({
  status: z.enum(["ok", "degraded", "error"]),
  uptimeSeconds: z.number(),
  version: z.string(),
  environment: z.string(),
  checks: z.object({
    database: z.object({ status: z.enum(["up", "down"]), latencyMs: z.number().nullable() }),
    nse: z.object({
      status: z.enum(["connected", "unavailable", "disabled", "unknown"]),
      detail: z.string().nullable(),
    }),
  }),
});
export type Health = z.infer<typeof healthSchema>;

export const tradingDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
