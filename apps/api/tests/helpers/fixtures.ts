import type { IndicatorValues } from "@marketverse/contracts";
import type { AlertRow } from "../../src/database/schema";
import type { PortfolioTransactionRow } from "../../src/database/schema";
import type { MapperContext } from "../../src/providers/nse/mappers/normalize";

/**
 * Deterministic indicator fixture with every field populated. Tests opt out by
 * overriding specific keys with null, which mirrors the real engine's approach
 * of leaving unavailable values null rather than substituting zero.
 */
export function indicatorValues(overrides: Partial<IndicatorValues> = {}): IndicatorValues {
  return {
    sma5: 104,
    sma20: 100,
    sma50: 95,
    sma100: 90,
    sma200: 85,
    ema12: 103,
    ema26: 99,
    ema50: 94,
    rsi14: 58,
    macd: 1.2,
    macdSignal: 1,
    macdHistogram: 0.2,
    averageVolume20: 1_000_000,
    averageVolume50: 900_000,
    relativeVolume: 1.2,
    priceChange1dPercent: 1.5,
    priceChange5dPercent: 3.2,
    priceChange1mPercent: 5.4,
    priceChange3mPercent: 12.5,
    priceChange1yPercent: 30,
    volumeChange1dPercent: 10,
    distanceFromSma20Percent: 4,
    distanceFromSma50Percent: 8,
    distanceFromSma200Percent: 20,
    weekHigh52: 120,
    weekLow52: 70,
    distanceFrom52WeekHighPercent: -10,
    distanceFrom52WeekLowPercent: 45,
    atr14: 3,
    annualizedVolatilityPercent: 25,
    ...overrides,
  };
}

export const completeFundamentals = {
  revenueGrowthPercent: 15,
  netProfitGrowthPercent: 20,
  epsGrowthPercent: 18,
  roePercent: 22,
  operatingMarginPercent: 18,
  debtToEquity: 0.4,
  promoterHoldingPercent: 55,
  institutionalHoldingPercent: 25,
  periodLabel: "annual 2026-03-31",
};

export function alertRow(overrides: Partial<AlertRow> = {}): AlertRow {
  const now = new Date("2026-11-16T10:00:00.000Z");
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Test alert",
    type: "price_threshold",
    symbol: "TCS",
    watchlistId: null,
    operator: "above",
    threshold: "1500.0000",
    parameters: null,
    enabled: true,
    cooldownSeconds: 3600,
    lastTriggeredAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export type TransactionOverrides = Omit<
  Partial<PortfolioTransactionRow>,
  "quantity" | "price" | "charges" | "tradedAt" | "type"
> & {
  type?: "buy" | "sell";
  quantity?: number;
  price?: number;
  charges?: number;
  tradedAt?: Date;
};

export function transaction(overrides: TransactionOverrides = {}): PortfolioTransactionRow {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const { quantity, price, charges, tradedAt, ...rest } = overrides;
  return {
    id: "22222222-2222-4222-8222-222222222222",
    accountId: "33333333-3333-4333-8333-333333333333",
    stockId: overrides.stockId ?? "44444444-4444-4444-8444-444444444444",
    symbol: overrides.symbol ?? "TCS",
    type: overrides.type ?? "buy",
    quantity: String(quantity ?? 10),
    price: String(price ?? 100),
    charges: String(charges ?? 0),
    tradedAt: tradedAt ?? now,
    notes: null,
    createdAt: now,
    ...rest,
  } as PortfolioTransactionRow;
}

export const mapperContext: MapperContext = {
  provider: "nse",
  tool: "get_bulk_quote",
  retrievedAt: new Date("2026-11-17T01:00:00.000Z"),
  delayClassification: "end_of_day",
  includeRaw: false,
};
