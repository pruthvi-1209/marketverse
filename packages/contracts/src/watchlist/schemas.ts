import { z } from "zod";
import { entryScoreSchema, qualityScoreSchema } from "../scoring/schemas";

export const watchlistItemSchema = z.object({
  id: z.string().uuid(),
  symbol: z.string(),
  name: z.string().nullable(),
  position: z.number().int(),
  addedAt: z.string().datetime(),
  quote: z
    .object({
      lastPrice: z.number().nullable(),
      changePercent: z.number().nullable(),
      observedAt: z.string().datetime().nullable(),
    })
    .nullable(),
  qualityScore: qualityScoreSchema.nullable().optional(),
  entryScore: entryScoreSchema.nullable().optional(),
});
export type WatchlistItem = z.infer<typeof watchlistItemSchema>;

export const watchlistSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  itemCount: z.number().int().nonnegative(),
  items: z.array(watchlistItemSchema).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Watchlist = z.infer<typeof watchlistSchema>;

export const createWatchlistSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  isDefault: z.boolean().optional(),
});
export type CreateWatchlistInput = z.infer<typeof createWatchlistSchema>;

export const updateWatchlistSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
});
export type UpdateWatchlistInput = z.infer<typeof updateWatchlistSchema>;

export const addWatchlistItemSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((value) => value.toUpperCase()),
  position: z.number().int().min(0).optional(),
});
export type AddWatchlistItemInput = z.infer<typeof addWatchlistItemSchema>;

export const reorderWatchlistSchema = z.object({
  symbols: z.array(z.string().trim().min(1).max(32)).min(1),
});
export type ReorderWatchlistInput = z.infer<typeof reorderWatchlistSchema>;
