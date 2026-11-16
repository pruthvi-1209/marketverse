import type { DelayClassification } from "@marketverse/contracts";

export type NseServerKey = "nse-bhavcopy" | "nse-cm-market";

/**
 * Capability -> actual discovered tool names. These names were verified against
 * the live servers; they are not invented. If a name disappears, the provider
 * reports the capability as unavailable instead of guessing a substitute.
 */
export const NSE_TOOL_CAPABILITIES = {
  "nse-bhavcopy": {
    bulkQuote: "get_bulk_quote",
    stockHistory: "get_stock_history",
    marketBreadth: "get_market_breadth",
    indexSnapshot: "get_index_snapshot",
    indexHistory: "get_index_history",
    topMovers: "get_top_movers",
    topByVolume: "get_top_by_volume",
    searchSymbols: "search_symbols",
    lookupSymbol: "nse_lookup_symbol",
    weekRange: "get_52_week_high_low",
    marketMood: "get_market_mood",
    indexPerformance: "get_index_performance",
    corporateActions: "get_corporate_actions",
    volumeAnalysis: "get_volume_analysis",
    movingAverage: "moving_average",
  },
  "nse-cm-market": {
    stockQuote: "cm_get_stock_quote",
    liveIndices: "cm_get_live_indices",
    indexQuote: "cm_get_index_quote",
    marketMovers: "nse_get_market_movers",
    gainers: "nse_get_gainers",
    losers: "nse_get_losers",
    equityStocks: "cm_get_equity_stocks",
    dataStatus: "cm_get_data_status",
    allStocksStatus: "cm_get_allstocks_status",
  },
} as const;

export type NseCapability = keyof (typeof NSE_TOOL_CAPABILITIES)["nse-bhavcopy"];

export const NSE_DELAY_CLASSIFICATION: Record<NseServerKey, DelayClassification> = {
  // End-of-day official bhavcopy data.
  "nse-bhavcopy": "end_of_day",
  // NSE documents CM live market data as delayed by roughly 1-3 minutes.
  "nse-cm-market": "delayed_1_3_min",
};

export const NSE_TERMS_NOTE =
  "Data is sourced from the official NSE MCP servers for personal, informational and " +
  "educational research. NSE data must not be commercially redistributed or used for " +
  "prohibited AI model training/fine-tuning.";

export const NSE_SERVER_LABELS: Record<NseServerKey, string> = {
  "nse-bhavcopy": "NSE Bhavcopy (end of day)",
  "nse-cm-market": "NSE CM Market (delayed 1-3 min)",
};
