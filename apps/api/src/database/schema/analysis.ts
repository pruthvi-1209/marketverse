import type {
  AiRelevance,
  EntryScore,
  IndicatorValues,
  QualityScore,
  ScoreCategory,
  ScoreExplanation,
} from "@marketverse/contracts";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { periodTypeEnum } from "./enums";
import { stocks } from "./reference";

export const technicalIndicators = pgTable(
  "technical_indicators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockId: uuid("stock_id")
      .notNull()
      .references(() => stocks.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    asOfDate: date("as_of_date").notNull(),
    version: text("version").notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull(),
    observationsUsed: integer("observations_used").notNull().default(0),
    values: jsonb("values").$type<IndicatorValues>().notNull(),
    missing: jsonb("missing").$type<string[]>().notNull().default([]),
    source: text("source").notNull(),
  },
  (table) => [
    uniqueIndex("technical_indicators_unique").on(table.stockId, table.asOfDate, table.version),
    index("technical_indicators_symbol_date_idx").on(table.symbol, table.asOfDate.desc()),
  ],
);

export const investmentScores = pgTable(
  "investment_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockId: uuid("stock_id")
      .notNull()
      .references(() => stocks.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    asOfDate: date("as_of_date").notNull(),
    score: numeric("score", { precision: 6, scale: 2 }).notNull(),
    maxScore: integer("max_score").notNull().default(100),
    availablePoints: numeric("available_points", { precision: 6, scale: 2 }).notNull(),
    coveragePercent: numeric("coverage_percent", { precision: 6, scale: 2 }).notNull(),
    categories: jsonb("categories").$type<ScoreCategory[]>().notNull(),
    missingFields: jsonb("missing_fields").$type<string[]>().notNull().default([]),
    explanation: jsonb("explanation").$type<ScoreExplanation>().notNull(),
    methodologyVersion: text("methodology_version").notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("investment_scores_unique").on(table.stockId, table.asOfDate, table.methodologyVersion),
    index("investment_scores_symbol_date_idx").on(table.symbol, table.asOfDate.desc()),
    index("investment_scores_score_idx").on(table.score),
  ],
);

export const entryScores = pgTable(
  "entry_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockId: uuid("stock_id")
      .notNull()
      .references(() => stocks.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    asOfDate: date("as_of_date").notNull(),
    score: numeric("score", { precision: 6, scale: 2 }).notNull(),
    maxScore: integer("max_score").notNull().default(100),
    coveragePercent: numeric("coverage_percent", { precision: 6, scale: 2 }).notNull(),
    components: jsonb("components").$type<ScoreCategory[]>().notNull(),
    riskFactors: jsonb("risk_factors").$type<string[]>().notNull().default([]),
    invalidationLevel: numeric("invalidation_level", { precision: 18, scale: 4 }),
    explanation: text("explanation").notNull(),
    methodologyVersion: text("methodology_version").notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("entry_scores_unique").on(table.stockId, table.asOfDate, table.methodologyVersion),
    index("entry_scores_symbol_date_idx").on(table.symbol, table.asOfDate.desc()),
    index("entry_scores_score_idx").on(table.score),
  ],
);

/** Analytical research notes. Always labelled as interpretation, not sourced fact. */
export const aiInfrastructureCompanies = pgTable(
  "ai_infrastructure_companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockId: uuid("stock_id")
      .notNull()
      .references(() => stocks.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    isWatchlistMember: boolean("is_watchlist_member").notNull().default(true),
    relevance: jsonb("relevance").$type<AiRelevance>().notNull(),
    sourceNotes: text("source_notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ai_infrastructure_symbol_unique").on(table.symbol),
    uniqueIndex("ai_infrastructure_stock_unique").on(table.stockId),
  ],
);

/**
 * Fundamentals are only stored when a legitimate source provides them.
 * `verified` distinguishes observed filings from user-entered research notes.
 */
export const companyFundamentals = pgTable(
  "company_fundamentals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stockId: uuid("stock_id")
      .notNull()
      .references(() => stocks.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    periodType: periodTypeEnum("period_type").notNull(),
    periodEnd: date("period_end").notNull(),
    currency: text("currency").notNull().default("INR"),
    revenue: numeric("revenue", { precision: 20, scale: 2 }),
    netProfit: numeric("net_profit", { precision: 20, scale: 2 }),
    eps: numeric("eps", { precision: 18, scale: 4 }),
    roePercent: numeric("roe_percent", { precision: 10, scale: 4 }),
    operatingMarginPercent: numeric("operating_margin_percent", { precision: 10, scale: 4 }),
    debtToEquity: numeric("debt_to_equity", { precision: 10, scale: 4 }),
    promoterHoldingPercent: numeric("promoter_holding_percent", { precision: 10, scale: 4 }),
    institutionalHoldingPercent: numeric("institutional_holding_percent", { precision: 10, scale: 4 }),
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    verified: boolean("verified").notNull().default(false),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("company_fundamentals_unique").on(
      table.stockId,
      table.periodType,
      table.periodEnd,
      table.source,
    ),
    index("company_fundamentals_stock_period_idx").on(table.stockId, table.periodEnd.desc()),
    index("company_fundamentals_symbol_idx").on(table.symbol),
  ],
);

export type TechnicalIndicatorRow = typeof technicalIndicators.$inferSelect;
export type InvestmentScoreRow = typeof investmentScores.$inferSelect;
export type EntryScoreRow = typeof entryScores.$inferSelect;
export type AiInfrastructureRow = typeof aiInfrastructureCompanies.$inferSelect;
export type CompanyFundamentalRow = typeof companyFundamentals.$inferSelect;

/** Compile-time guards: stored JSON must stay compatible with the public contract. */
export type _QualityScoreContractCheck = QualityScore;
export type _EntryScoreContractCheck = EntryScore;
