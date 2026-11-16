import { z } from "zod";

export const alertTypeSchema = z.enum([
  "price_threshold",
  "percent_change",
  "dma_crossover",
  "rsi_threshold",
  "volume_spike",
  "quality_score_change",
  "entry_score_change",
  "watchlist_event",
]);
export type AlertType = z.infer<typeof alertTypeSchema>;

export const alertOperatorSchema = z.enum([
  "above",
  "below",
  "crosses_above",
  "crosses_below",
  "change_above",
  "change_below",
]);
export type AlertOperator = z.infer<typeof alertOperatorSchema>;

export const alertSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: alertTypeSchema,
  symbol: z.string().nullable(),
  watchlistId: z.string().uuid().nullable(),
  operator: alertOperatorSchema,
  threshold: z.number().nullable(),
  /** Extra parameters, e.g. { dmaPeriod: 50, rsiPeriod: 14, volumeMultiplier: 2 }. */
  parameters: z.record(z.union([z.number(), z.string(), z.boolean()])).nullable(),
  enabled: z.boolean(),
  cooldownSeconds: z.number().int().nonnegative(),
  lastTriggeredAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Alert = z.infer<typeof alertSchema>;

export const createAlertSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: alertTypeSchema,
    symbol: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .transform((v) => v.toUpperCase())
      .nullable()
      .optional(),
    watchlistId: z.string().uuid().nullable().optional(),
    operator: alertOperatorSchema,
    threshold: z.number().nullable().optional(),
    parameters: z.record(z.union([z.number(), z.string(), z.boolean()])).nullable().optional(),
    cooldownSeconds: z.number().int().min(0).max(86400).default(3600),
  })
  .superRefine((value, ctx) => {
    const needsSymbol = !["watchlist_event"].includes(value.type);
    if (needsSymbol && !value.symbol) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["symbol"], message: "symbol is required for this alert type" });
    }
    if (value.type === "watchlist_event" && !value.watchlistId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["watchlistId"],
        message: "watchlistId is required for watchlist_event alerts",
      });
    }
    const thresholdTypes = [
      "price_threshold",
      "percent_change",
      "rsi_threshold",
      "volume_spike",
      "quality_score_change",
      "entry_score_change",
    ];
    if (thresholdTypes.includes(value.type) && value.threshold === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["threshold"],
        message: "threshold is required for this alert type",
      });
    }
  });
export type CreateAlertInput = z.input<typeof createAlertSchema>;

export const updateAlertSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  operator: alertOperatorSchema.optional(),
  threshold: z.number().nullable().optional(),
  parameters: z.record(z.union([z.number(), z.string(), z.boolean()])).nullable().optional(),
  enabled: z.boolean().optional(),
  cooldownSeconds: z.number().int().min(0).max(86400).optional(),
});
export type UpdateAlertInput = z.infer<typeof updateAlertSchema>;

export const alertEventSchema = z.object({
  id: z.string().uuid(),
  alertId: z.string().uuid(),
  alertName: z.string().optional(),
  triggeredAt: z.string().datetime(),
  observedValue: z.number().nullable(),
  message: z.string(),
  dedupeKey: z.string(),
  delivered: z.boolean(),
  deliveryError: z.string().nullable(),
});
export type AlertEvent = z.infer<typeof alertEventSchema>;
