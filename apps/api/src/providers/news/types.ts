export interface NewsItem {
  title: string;
  url: string;
  sourceName: string;
  publishedAt: Date;
  summary: string | null;
  relatedSymbols: string[];
  relatedSectors: string[];
  sentiment: "positive" | "neutral" | "negative" | "unknown" | null;
}

export interface NewsProvider {
  readonly name: string;
  readonly enabled: boolean;
  /**
   * Fetches already-licensed headlines. Implementations must use an official
   * feed or API. MarketVerse does not scrape news websites.
   */
  fetchLatest(limit: number): Promise<NewsItem[]>;
}
