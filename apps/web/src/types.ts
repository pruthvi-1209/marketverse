export type DelayClassification = "real_time" | "delayed_1_3_min" | "end_of_day" | "unknown";
export type FreshnessStatus = "fresh" | "stale" | "unknown";

export interface Freshness {
  status: FreshnessStatus;
  ageSeconds: number | null;
  staleAfterSeconds: number;
}

export interface ResponseMeta {
  provider: string;
  tool: string | null;
  retrievedAt: string;
  observedAt: string | null;
  tradingDate: string | null;
  delayClassification: DelayClassification;
  freshness: Freshness;
  cached: boolean;
  warnings: string[];
}

export interface IndexQuote {
  symbol: string;
  name: string;
  lastPrice: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  observedAt: string | null;
  tradingDate: string | null;
}

export interface MarketBreadth {
  advances: number | null;
  declines: number | null;
  unchanged: number | null;
  advanceDeclineRatio: number | null;
  newHighs: number | null;
  newLows: number | null;
  totalTradedVolume: number | null;
  totalTradedValue: number | null;
  asOf: string | null;
}

export interface Mover {
  symbol: string;
  name: string | null;
  lastPrice: number | null;
  changePercent: number | null;
  volume: number | null;
}

export interface MarketMovers {
  gainers: Mover[];
  losers: Mover[];
  mostActiveByVolume: Mover[];
  mostActiveByValue: Mover[];
  weekHigh52: Mover[];
  weekLow52: Mover[];
}

export interface MarketOverviewData {
  indices: IndexQuote[];
  breadth: MarketBreadth;
  movers: MarketMovers;
  tradingDate: string | null;
}

export interface ApiOverview { data: MarketOverviewData; meta: ResponseMeta }
export interface ApiIndices { data: IndexQuote[]; meta: ResponseMeta }

export interface ScoreSummary {
  symbol?: string;
  score: number | null;
}

export interface Quote {
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
  observedAt: string | null;
  tradingDate: string | null;
}

export interface Performance {
  oneDayPercent: number | null;
  oneWeekPercent: number | null;
  oneMonthPercent: number | null;
  threeMonthPercent: number | null;
  sixMonthPercent: number | null;
  oneYearPercent: number | null;
  yearToDatePercent: number | null;
}

export interface Stock {
  id: string;
  symbol: string;
  name: string | null;
  isin: string | null;
  exchangeCode: string;
  sector: string | null;
  industry: string | null;
  listingStatus: string;
  instrumentType: string | null;
  dataSource: string;
  lastUpdatedAt: string | null;
}

export interface StockDetail extends Stock {
  quote: Quote | null;
  performance: Performance | null;
}

export interface WatchlistItemQuote {
  lastPrice: number | null;
  changePercent: number | null;
  observedAt: string | null;
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  name: string | null;
  position: number;
  addedAt: string;
  quote: WatchlistItemQuote | null;
  qualityScore: ScoreSummary | null;
  entryScore: ScoreSummary | null;
}

export interface Watchlist {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  itemCount: number;
  items?: WatchlistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ApiWatchlists { data: Watchlist[]; meta: ResponseMeta }
export interface ApiWatchlist { data: Watchlist; meta: ResponseMeta }

export interface ApiStocks {
  data: Stock[];
  meta: ResponseMeta;
  pagination: { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean };
}

export interface ApiSearch {
  data: Array<{ symbol: string; name: string | null; exchangeCode: string }>;
  meta: ResponseMeta;
}

export interface StockScores {
  quality: ScoreSummary | null;
  entry: ScoreSummary | null;
  disclaimer: string;
}

export interface ApiStockScores { data: StockScores; meta: ResponseMeta }

export interface PortfolioAccount {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  benchmarkSymbol: string;
  fdAnnualRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioHolding {
  symbol: string;
  name: string | null;
  quantity: number;
  averageBuyPrice: number | null;
  investedAmount: number;
  lastPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPercent: number | null;
  realizedPnl: number;
  allocationPercent: number | null;
  weightBasis: string;
}

export interface PortfolioComparison {
  benchmarkSymbol: string;
  benchmarkReturnPercent: number | null;
  fdReferenceAnnualRate: number;
  fdReferenceReturnPercent: number | null;
  portfolioReturnPercent: number | null;
  excessVsBenchmarkPercent: number | null;
  excessVsFdPercent: number | null;
  periodStart: string | null;
  periodEnd: string | null;
  note: string;
}

export interface PortfolioPerformance {
  account: PortfolioAccount;
  asOf: string;
  investedAmount: number;
  currentValue: number;
  totalUnrealizedPnl: number;
  totalRealizedPnl: number;
  totalPnl: number;
  totalPnlPercent: number | null;
  allocation: PortfolioHolding[];
  comparison: PortfolioComparison;
  dataWarnings: string[];
}

export interface PortfolioDetail extends PortfolioAccount {
  holdings: PortfolioHolding[];
  transactions: Array<Record<string, unknown>>;
  performance: PortfolioPerformance | null;
}

export interface ApiPortfolios { data: PortfolioAccount[]; meta: ResponseMeta }
export interface ApiPortfolio { data: PortfolioDetail; meta: ResponseMeta }
export interface ApiPortfolioPerformance { data: PortfolioPerformance; meta: ResponseMeta }

export interface Alert {
  id: string;
  name: string;
  type: string;
  symbol: string | null;
  watchlistId: string | null;
  operator: string | null;
  threshold: number | null;
  parameters: Record<string, string | number | boolean> | null;
  enabled: boolean;
  cooldownSeconds: number;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEvent {
  id: string;
  alertId: string;
  alertName: string | undefined;
  triggeredAt: string;
  observedValue: number | null;
  message: string;
  dedupeKey: string;
  delivered: boolean;
  deliveryError: string | null;
}

export interface ApiAlerts { data: Alert[]; meta: ResponseMeta }
export interface ApiAlertEvents { data: AlertEvent[]; meta: ResponseMeta }
