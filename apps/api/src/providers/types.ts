import type { DelayClassification } from "@marketverse/contracts";

export interface Provenance {
  provider: string;
  tool: string | null;
  retrievedAt: Date;
  observedAt: Date | null;
  tradingDate: string | null;
  delayClassification: DelayClassification;
  /** Raw provider payload preserved only when configured and permitted. */
  raw?: Record<string, unknown>;
}

export interface NormalizedQuote {
  symbol: string;
  name: string | null;
  lastPrice: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  volume: number | null;
  turnover: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  series: string | null;
  provenance: Provenance;
}

export interface NormalizedCandle {
  symbol: string;
  tradingDate: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  previousClose: number | null;
  volume: number | null;
  turnover: number | null;
  provenance: Provenance;
}

export interface NormalizedIndexQuote {
  symbol: string;
  name: string;
  lastPrice: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  pe: number | null;
  pb: number | null;
  dividendYield: number | null;
  tradingDate: string | null;
  provenance: Provenance;
}

export interface NormalizedBreadth {
  tradingDate: string;
  advances: number | null;
  declines: number | null;
  unchanged: number | null;
  advanceDeclineRatio: number | null;
  totalStocks: number | null;
  totalVolume: number | null;
  provenance: Provenance;
}

export interface NormalizedMovers {
  gainers: NormalizedQuote[];
  losers: NormalizedQuote[];
  provenance: Provenance;
}

export interface NormalizedSymbolMatch {
  symbol: string;
  name: string | null;
  lastPrice: number | null;
  changePercent: number | null;
  tradingDate: string | null;
  provenance: Provenance;
}

export interface NormalizedIndexHistoryPoint {
  tradingDate: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  changePercent: number | null;
  provenance: Provenance;
}

export interface QuoteRequest {
  symbol: string;
}

export interface HistoryRequest {
  symbol: string;
  /** Number of months to synchronise, fetched in provider-sized chunks. */
  months?: number;
  endDate?: string;
}

export interface MoversRequest {
  date?: string;
  limit?: number;
}

export interface ProviderHealth {
  name: string;
  enabled: boolean;
  status: "connected" | "unavailable" | "disabled" | "unknown";
  detail: string | null;
  toolCount: number | null;
  lastConnectedAt: Date | null;
  lastErrorAt: Date | null;
}

export interface MarketQuoteProvider {
  readonly name: string;
  getQuote(request: QuoteRequest): Promise<NormalizedQuote>;
  getQuotes(symbols: string[]): Promise<NormalizedQuote[]>;
}

export interface HistoricalDataProvider {
  readonly name: string;
  getDailyHistory(request: HistoryRequest): Promise<NormalizedCandle[]>;
  getIndexHistory(indexName: string, months: number): Promise<NormalizedIndexHistoryPoint[]>;
}

export interface MarketBreadthProvider {
  readonly name: string;
  getBreadth(date?: string): Promise<NormalizedBreadth>;
  getMovers(request: MoversRequest): Promise<NormalizedMovers>;
}

export interface MarketDataProvider
  extends MarketQuoteProvider,
    HistoricalDataProvider,
    MarketBreadthProvider {
  searchSymbols(query: string): Promise<NormalizedSymbolMatch[]>;
  getIndices(options?: { group?: string; nameFilter?: string }): Promise<NormalizedIndexQuote[]>;
  get52WeekRange(symbol: string): Promise<{ symbol: string; high: number | null; low: number | null } | null>;
  health(): ProviderHealth;
  availableTools(): Promise<string[]>;
}
