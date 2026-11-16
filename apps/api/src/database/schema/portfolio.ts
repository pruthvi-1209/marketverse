import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { transactionTypeEnum } from "./enums";
import { stocks } from "./reference";

export const portfolioAccounts = pgTable(
  "portfolio_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    currency: text("currency").notNull().default("INR"),
    benchmarkSymbol: text("benchmark_symbol").notNull().default("NIFTY 50"),
    fdAnnualRate: numeric("fd_annual_rate", { precision: 6, scale: 5 }).notNull().default("0.08"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("portfolio_accounts_name_unique").on(table.name)],
);

export const portfolioTransactions = pgTable(
  "portfolio_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => portfolioAccounts.id, { onDelete: "cascade" }),
    stockId: uuid("stock_id")
      .notNull()
      .references(() => stocks.id, { onDelete: "restrict" }),
    symbol: text("symbol").notNull(),
    type: transactionTypeEnum("type").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
    price: numeric("price", { precision: 18, scale: 4 }).notNull(),
    charges: numeric("charges", { precision: 18, scale: 4 }).notNull().default("0"),
    tradedAt: timestamp("traded_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("portfolio_transactions_account_idx").on(table.accountId, table.tradedAt.desc()),
    index("portfolio_transactions_symbol_idx").on(table.symbol),
  ],
);

/**
 * Holdings are derived from transactions. They are a materialised view kept in
 * a table so dashboards can read them cheaply; the ledger stays authoritative.
 */
export const portfolioHoldings = pgTable(
  "portfolio_holdings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => portfolioAccounts.id, { onDelete: "cascade" }),
    stockId: uuid("stock_id")
      .notNull()
      .references(() => stocks.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
    averageBuyPrice: numeric("average_buy_price", { precision: 18, scale: 4 }),
    investedAmount: numeric("invested_amount", { precision: 20, scale: 4 }).notNull(),
    realizedPnl: numeric("realized_pnl", { precision: 20, scale: 4 }).notNull().default("0"),
    firstBuyDate: date("first_buy_date"),
    lastCalculatedAt: timestamp("last_calculated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("portfolio_holdings_unique").on(table.accountId, table.stockId),
    index("portfolio_holdings_account_idx").on(table.accountId),
  ],
);

export type PortfolioAccountRow = typeof portfolioAccounts.$inferSelect;
export type PortfolioTransactionRow = typeof portfolioTransactions.$inferSelect;
export type PortfolioHoldingRow = typeof portfolioHoldings.$inferSelect;
