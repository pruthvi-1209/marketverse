import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { delayClassificationEnum } from "./enums";
import { exchanges, stocks } from "./reference";

const price = (name: string) => numeric(name, { precision: 18, scale: 4 });
const amount = (name: string) => numeric(name, { precision: 24, scale: 4 });
const percent = (name: string) => numeric(name, { precision: 12, scale: 4 });

/**
 * Intraday (or end-of-day) quote snapshots. A quote is an observation at a
 * point in time, never an overwrite, so history stays auditable.
 */
export const marketQuotes = pgTable(
  "market_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockId: uuid("stock_id")
      .notNull()
      .references(() => stocks.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    exchangeCode: text("exchange_code").notNull().default("NSE"),
    tradingDate: date("trading_date").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    lastPrice: price("last_price"),
    changeValue: price("change_value"),
    changePercent: percent("change_percent"),
    open: price("open"),
    high: price("high"),
    low: price("low"),
    previousClose: price("previous_close"),
    volume: bigint("volume", { mode: "number" }),
    turnover: amount("turnover"),
    yearHigh: price("year_high"),
    yearLow: price("year_low"),
    source: text("source").notNull(),
    tool: text("tool"),
    delayClassification: delayClassificationEnum("delay_classification").notNull().default("delayed_1_3_min"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("market_quotes_dedupe_unique").on(
      table.stockId,
      table.tradingDate,
      table.observedAt,
      table.source,
    ),
    index("market_quotes_stock_observed_idx").on(table.stockId, table.observedAt.desc()),
    index("market_quotes_trading_date_idx").on(table.tradingDate),
    index("market_quotes_symbol_idx").on(table.symbol),
  ],
);

/**
 * Daily OHLCV history. The (stock, trading date, source) triple is unique so
 * re-synchronising the same bhavcopy file is idempotent.
 */
export const historicalPrices = pgTable(
  "historical_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockId: uuid("stock_id")
      .notNull()
      .references(() => stocks.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    tradingDate: date("trading_date").notNull(),
    open: price("open"),
    high: price("high"),
    low: price("low"),
    close: price("close"),
    previousClose: price("previous_close"),
    volume: bigint("volume", { mode: "number" }),
    turnover: amount("turnover"),
    source: text("source").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("historical_prices_dedupe_unique").on(table.stockId, table.tradingDate, table.source),
    index("historical_prices_stock_date_idx").on(table.stockId, table.tradingDate.desc()),
    index("historical_prices_date_idx").on(table.tradingDate),
  ],
);

export const marketIndices = pgTable(
  "market_indices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    exchangeId: uuid("exchange_id").references(() => exchanges.id, { onDelete: "set null" }),
    exchangeCode: text("exchange_code").notNull().default("NSE"),
    description: text("description"),
    isBenchmark: boolean("is_benchmark").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("market_indices_symbol_unique").on(table.symbol),
    index("market_indices_exchange_idx").on(table.exchangeCode),
  ],
);

export const indexHistory = pgTable(
  "index_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    indexId: uuid("index_id")
      .notNull()
      .references(() => marketIndices.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    tradingDate: date("trading_date").notNull(),
    open: price("open"),
    high: price("high"),
    low: price("low"),
    close: price("close"),
    previousClose: price("previous_close"),
    changePercent: percent("change_percent"),
    source: text("source").notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("index_history_dedupe_unique").on(table.indexId, table.tradingDate, table.source),
    index("index_history_index_date_idx").on(table.indexId, table.tradingDate.desc()),
    index("index_history_symbol_idx").on(table.symbol),
  ],
);

/** Latest index observation, indexed for cheap dashboard reads. */
export const indexQuotes = pgTable(
  "index_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    indexId: uuid("index_id")
      .notNull()
      .references(() => marketIndices.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    tradingDate: date("trading_date").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    lastPrice: price("last_price"),
    changeValue: price("change_value"),
    changePercent: percent("change_percent"),
    open: price("open"),
    high: price("high"),
    low: price("low"),
    previousClose: price("previous_close"),
    source: text("source").notNull(),
    delayClassification: delayClassificationEnum("delay_classification").notNull().default("delayed_1_3_min"),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("index_quotes_dedupe_unique").on(table.indexId, table.observedAt, table.source),
    index("index_quotes_symbol_observed_idx").on(table.symbol, table.observedAt.desc()),
    index("index_quotes_trading_date_idx").on(table.tradingDate),
    index("index_quotes_observation_idx").on(sql`${table.observedAt} desc`),
  ],
);

/** Stored daily breadth summary so the dashboard has a consistent snapshot. */
export const marketBreadth = pgTable(
  "market_breadth",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tradingDate: date("trading_date").notNull(),
    advances: bigint("advances", { mode: "number" }),
    declines: bigint("declines", { mode: "number" }),
    unchanged: bigint("unchanged", { mode: "number" }),
    advanceDeclineRatio: numeric("advance_decline_ratio", { precision: 12, scale: 4 }),
    totalStocks: bigint("total_stocks", { mode: "number" }),
    totalVolume: numeric("total_volume", { precision: 30, scale: 0 }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    source: text("source").notNull(),
  },
  (table) => [
    uniqueIndex("market_breadth_dedupe_unique").on(table.tradingDate, table.source),
    index("market_breadth_date_idx").on(table.tradingDate.desc()),
  ],
);

export type MarketQuoteRow = typeof marketQuotes.$inferSelect;
export type NewMarketQuote = typeof marketQuotes.$inferInsert;
export type MarketBreadthRow = typeof marketBreadth.$inferSelect;
export type HistoricalPriceRow = typeof historicalPrices.$inferSelect;
export type NewHistoricalPrice = typeof historicalPrices.$inferInsert;
export type MarketIndexRow = typeof marketIndices.$inferSelect;
export type IndexHistoryRow = typeof indexHistory.$inferSelect;
export type IndexQuoteRow = typeof indexQuotes.$inferSelect;
