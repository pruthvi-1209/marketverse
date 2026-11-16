import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const newsArticles = pgTable(
  "news_articles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    sourceName: text("source_name").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    summary: text("summary"),
    relatedSymbols: jsonb("related_symbols").$type<string[]>().notNull().default([]),
    relatedSectors: jsonb("related_sectors").$type<string[]>().notNull().default([]),
    sentiment: text("sentiment"),
    isDerivedMetadata: boolean("is_derived_metadata").notNull().default(true),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("news_articles_url_unique").on(table.url),
    index("news_articles_published_idx").on(table.publishedAt.desc()),
    index("news_articles_source_idx").on(table.sourceName),
  ],
);

export type NewsArticleRow = typeof newsArticles.$inferSelect;
