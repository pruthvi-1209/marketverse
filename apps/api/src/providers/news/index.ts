import type { NewsItem, NewsProvider } from "./types";

/**
 * Default provider. No licensed Indian market-news feed is configured in this
 * deployment, so the honest answer is "no articles", never invented headlines.
 * A real provider can be registered without touching the service layer.
 */
export class NullNewsProvider implements NewsProvider {
  readonly name = "none";
  readonly enabled = false;

  async fetchLatest(): Promise<NewsItem[]> {
    return [];
  }
}

let provider: NewsProvider = new NullNewsProvider();

export function getNewsProvider(): NewsProvider {
  return provider;
}

export function setNewsProvider(next: NewsProvider): void {
  provider = next;
}

export function resetNewsProvider(): void {
  provider = new NullNewsProvider();
}

export type { NewsItem, NewsProvider } from "./types";
