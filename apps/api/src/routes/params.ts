import { z } from "zod";

export const symbolParamSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((value) => value.toUpperCase()),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const watchlistItemParamSchema = z.object({
  id: z.string().uuid(),
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((value) => value.toUpperCase()),
});

export const portfolioTransactionParamSchema = z.object({
  id: z.string().uuid(),
  transactionId: z.string().uuid(),
});

export const watchlistScoreParamSchema = z.object({
  id: z.string().uuid(),
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((value) => value.toUpperCase()),
});

export const jobNameParamSchema = z.object({
  name: z.string().trim().min(1).max(64),
});

export const booleanQuery = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((value) => value === "true" || value === "1");

export const stockSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(64),
});

export const marketIndicesQuerySchema = z.object({
  group: z.string().trim().max(32).optional(),
  nameFilter: z.string().trim().max(64).optional(),
});

export const breadthQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const newsListQuerySchema = z.object({
  symbol: z.string().trim().max(32).optional(),
  sector: z.string().trim().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const jobsRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(30),
});
