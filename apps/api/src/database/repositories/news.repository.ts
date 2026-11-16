import { desc, sql } from "drizzle-orm";
import { db } from "../client";
import { newsArticles, type NewsArticleRow } from "../schema";

export interface NewsUpsert {
  title: string;
  url: string;
  sourceName: string;
  publishedAt: Date;
  summary?: string | null;
  relatedSymbols?: string[];
  relatedSectors?: string[];
  sentiment?: "positive" | "neutral" | "negative" | "unknown" | null;
  retrievedAt: Date;
}

export const newsRepository = {
  async upsertMany(articles: NewsUpsert[]): Promise<number> {
    if (articles.length === 0) return 0;
    const rows = await db
      .insert(newsArticles)
      .values(
        articles.map((article) => ({
          title: article.title,
          url: article.url,
          sourceName: article.sourceName,
          publishedAt: article.publishedAt,
          summary: article.summary ?? null,
          relatedSymbols: article.relatedSymbols ?? [],
          relatedSectors: article.relatedSectors ?? [],
          sentiment: article.sentiment ?? null,
          isDerivedMetadata: true,
          retrievedAt: article.retrievedAt,
        })),
      )
      .onConflictDoNothing({ target: newsArticles.url })
      .returning({ id: newsArticles.id });
    return rows.length;
  },

  async list(options: { symbol?: string; sector?: string; limit: number }): Promise<NewsArticleRow[]> {
    const conditions = [];
    if (options.symbol) {
      conditions.push(sql`${newsArticles.relatedSymbols} @> ${JSON.stringify([options.symbol.toUpperCase()])}::jsonb`);
    }
    if (options.sector) {
      conditions.push(sql`${newsArticles.relatedSectors} @> ${JSON.stringify([options.sector])}::jsonb`);
    }
    const query = db.select().from(newsArticles);
    const filtered = conditions.length === 0 ? query : query.where(sql.join(conditions, sql` and `));
    return filtered.orderBy(desc(newsArticles.publishedAt)).limit(options.limit);
  },
};
