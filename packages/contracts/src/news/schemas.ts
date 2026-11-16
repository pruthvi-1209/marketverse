import { z } from "zod";

export const newsArticleSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  url: z.string().url(),
  sourceName: z.string(),
  publishedAt: z.string().datetime(),
  summary: z.string().nullable(),
  relatedSymbols: z.array(z.string()),
  relatedSectors: z.array(z.string()),
  /** Optional derived classification. Never presented as a sourced fact. */
  sentiment: z.enum(["positive", "neutral", "negative", "unknown"]).nullable(),
  isDerivedMetadata: z.literal(true),
  retrievedAt: z.string().datetime(),
});
export type NewsArticle = z.infer<typeof newsArticleSchema>;

export const newsQuerySchema = z.object({
  symbol: z.string().trim().max(32).optional(),
  sector: z.string().trim().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type NewsQuery = z.infer<typeof newsQuerySchema>;
