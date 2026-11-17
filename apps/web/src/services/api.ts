import type {
  Alert,
  ApiAlertEvents,
  ApiAlerts,
  ApiIndices,
  ApiOverview,
  ApiPortfolio,
  ApiPortfolioPerformance,
  ApiPortfolios,
  ApiSearch,
  ApiStockScores,
  ApiStocks,
  ApiWatchlist,
  ApiWatchlists,
  IndexQuote,
  MarketOverviewData,
  Quote,
  ResponseMeta,
  Stock,
  StockDetail,
  Watchlist,
  WatchlistItem,
} from "../types";

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const API_ROOT = API_BASE.replace(/\/api\/v1$/, "");

async function request<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input.toString(), {
    headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${res.status} ${res.statusText}${text ? ": " + text : ""}`);
  }
  return res.json();
}

export const api = {
  health: () => request<{ data: unknown }>(`${API_ROOT}/health`),

  marketOverview: () =>
    request<ApiOverview>(`${API_BASE}/market/overview`),
  marketIndices: () =>
    request<ApiIndices>(`${API_BASE}/market/indices`),

  watchlists: () =>
    request<ApiWatchlists>(`${API_BASE}/watchlists`),
  watchlist: (id: string) =>
    request<ApiWatchlist>(`${API_BASE}/watchlists/${encodeURIComponent(id)}`),

  stocks: (page = 1, pageSize = 50, search?: string) => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (search) params.set("search", search);
    return request<ApiStocks>(`${API_BASE}/stocks?${params.toString()}`);
  },

  stockSearch: (q: string) =>
    request<ApiSearch>(`${API_BASE}/stocks/search?q=${encodeURIComponent(q)}`),

  stockDetail: (symbol: string) =>
    request<{ data: StockDetail; meta: ResponseMeta }>(
      `${API_BASE}/stocks/${encodeURIComponent(symbol)}`,
    ),

  stockQuote: (symbol: string) =>
    request<{ data: Quote; meta: ResponseMeta }>(
      `${API_BASE}/stocks/${encodeURIComponent(symbol)}/quote`,
    ),

  stockScores: (symbol: string) =>
    request<ApiStockScores>(
      `${API_BASE}/stocks/${encodeURIComponent(symbol)}/scores`,
    ),

  portfolios: () =>
    request<ApiPortfolios>(`${API_BASE}/portfolios`),
  portfolioDetail: (id: string) =>
    request<ApiPortfolio>(`${API_BASE}/portfolios/${encodeURIComponent(id)}`),
  portfolioPerformance: (id: string) =>
    request<ApiPortfolioPerformance>(
      `${API_BASE}/portfolios/${encodeURIComponent(id)}/performance`,
    ),

  alerts: () => request<ApiAlerts>(`${API_BASE}/alerts`),
  alertEvents: (limit = 50) =>
    request<ApiAlertEvents>(`${API_BASE}/alerts/events/recent?limit=${limit}`),
};

export type WatchlistWithQuote = Watchlist & { items: WatchlistItem[] };

export function mapWatchlistItem(
  id: string,
  symbol: string,
  name: string | null,
  position: number,
  addedAt: string,
  quote: { lastPrice: number | null; changePercent: number | null; observedAt: string | null } | null,
  qualityScore: { score: number | null } | null,
  entryScore: { score: number | null } | null,
): WatchlistItem {
  return {
    id,
    symbol,
    name,
    position,
    addedAt,
    quote: quote
      ? {
          lastPrice: quote.lastPrice,
          changePercent: quote.changePercent,
          observedAt: quote.observedAt,
        }
      : null,
    qualityScore: qualityScore ? { score: qualityScore.score ?? null } : null,
    entryScore: entryScore ? { score: entryScore.score ?? null } : null,
  };
}

export function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}
