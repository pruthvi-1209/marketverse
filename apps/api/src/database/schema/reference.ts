import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { dataSourceKindEnum, listingStatusEnum } from "./enums";

export const exchanges = pgTable(
  "exchanges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    mic: text("mic"),
    country: text("country").notNull().default("IN"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("exchanges_code_unique").on(table.code)],
);

export const stocks = pgTable(
  "stocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").notNull(),
    name: text("name"),
    isin: text("isin"),
    exchangeId: uuid("exchange_id")
      .notNull()
      .references(() => exchanges.id, { onDelete: "restrict" }),
    sector: text("sector"),
    industry: text("industry"),
    listingStatus: listingStatusEnum("listing_status").notNull().default("unknown"),
    instrumentType: text("instrument_type"),
    dataSource: text("data_source").notNull().default("nse"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("stocks_symbol_unique").on(table.symbol),
    index("stocks_isin_idx").on(table.isin),
    index("stocks_sector_idx").on(table.sector),
    index("stocks_exchange_idx").on(table.exchangeId),
    index("stocks_name_lower_idx").on(sql`lower(${table.name})`),
  ],
);

export const dataSources = pgTable(
  "data_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    kind: dataSourceKindEnum("kind").notNull(),
    baseUrl: text("base_url"),
    enabled: boolean("enabled").notNull().default(true),
    termsNotes: text("terms_notes"),
    lastConnectedAt: timestamp("last_connected_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastError: text("last_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("data_sources_key_unique").on(table.key)],
);

export type Exchange = typeof exchanges.$inferSelect;
export type NewExchange = typeof exchanges.$inferInsert;
export type Stock = typeof stocks.$inferSelect;
export type NewStock = typeof stocks.$inferInsert;
export type DataSourceRow = typeof dataSources.$inferSelect;
