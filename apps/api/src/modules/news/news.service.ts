import type { NewsArticle, NewsQuery, ResponseMeta } from "@marketverse/contracts";
import { storedResponseMeta } from "../../core/http/response-meta";
import { newsRepository, type NewsUpsert } from "../../database/repositories/news.repository";
import { getNewsProvider } from "../../providers/news";

function mapArticle(row: {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  publishedAt: Date;
  summary: string | null;
  relatedSymbols: string[];
  relatedSectors: string[];
  sentiment: string | null;
  retrievedAt: Date;
}): NewsArticle {
  const sentiment =
    row.sentiment === "positive" || row.sentiment === "neutral" || row.sentiment === "negative"
      ? row.sentiment
      : row.sentiment === "unknown"
        ? "unknown"
        : null;
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    sourceName: row.sourceName,
    publishedAt: row.publishedAt.toISOString(),
    summary: row.summary,
    relatedSymbols: row.relatedSymbols,
    relatedSectors: row.relatedSectors,
    sentiment,
    isDerivedMetadata: true,
    retrievedAt: row.retrievedAt.toISOString(),
  };
}

export class NewsService {
  async list(query: NewsQuery): Promise<{ articles: NewsArticle[]; meta: ResponseMeta }> {
    const rows = await newsRepository.list({
      symbol: query.symbol,
      sector: query.sector,
      limit: query.limit,
    });
    const provider = getNewsProvider();
    const warnings: string[] = [];
    if (!provider.enabled) {
      warnings.push(
        "No licensed news provider is configured. MarketVerse does not scrape news sites; " +
          "articles appear only after an approved provider or manual import supplies them.",
      );
    }
    return {
      articles: rows.map(mapArticle),
      meta: storedResponseMeta({ provider: provider.name, warnings }),
    };
  }

  /** Used by the news refresh job. Never invents content when disabled. */
  async refresh(limit = 50): Promise<{ inserted: number; skipped: boolean; reason: string | null }> {
    const provider = getNewsProvider();
    if (!provider.enabled) {
      return {
        inserted: 0,
        skipped: true,
        reason: "no licensed news provider is configured",
      };
    }
    const items = await provider.fetchLatest(limit);
    if (items.length === 0) {
      return { inserted: 0, skipped: false, reason: "provider returned no articles" };
    }
    const retrievedAt = new Date();
    const payload: NewsUpsert[] = items.map((item) => ({
      title: item.title,
      url: item.url,
      sourceName: item.sourceName,
      publishedAt: item.publishedAt,
      summary: item.summary,
      relatedSymbols: item.relatedSymbols,
      relatedSectors: item.relatedSectors,
      sentiment: item.sentiment,
      retrievedAt,
    }));
    const inserted = await newsRepository.upsertMany(payload);
    return { inserted, skipped: false, reason: null };
  }

  /** Manual import for research workflows; the caller is responsible for rights. */
  async ingest(items: NewsUpsert[]): Promise<number> {
    return newsRepository.upsertMany(items);
  }
}

export const newsService = new NewsService();
