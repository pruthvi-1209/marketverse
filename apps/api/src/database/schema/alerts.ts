import type { AlertOperator, AlertType } from "@marketverse/contracts";
import {
  boolean,
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
import { alertOperatorEnum, alertTypeEnum } from "./enums";
import { watchlists } from "./watchlist";

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: alertTypeEnum("type").$type<AlertType>().notNull(),
    symbol: text("symbol"),
    watchlistId: uuid("watchlist_id").references(() => watchlists.id, { onDelete: "set null" }),
    operator: alertOperatorEnum("operator").$type<AlertOperator>().notNull(),
    threshold: numeric("threshold", { precision: 20, scale: 4 }),
    parameters: jsonb("parameters").$type<Record<string, number | string | boolean>>(),
    enabled: boolean("enabled").notNull().default(true),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(3600),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("alerts_symbol_idx").on(table.symbol),
    index("alerts_enabled_idx").on(table.enabled),
  ],
);

export const alertEvents = pgTable(
  "alert_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    triggeredAt: timestamp("triggered_at", { withTimezone: true }).notNull(),
    observedValue: numeric("observed_value", { precision: 20, scale: 4 }),
    message: text("message").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    delivered: boolean("delivered").notNull().default(false),
    deliveryError: text("delivery_error"),
  },
  (table) => [
    uniqueIndex("alert_events_dedupe_unique").on(table.dedupeKey),
    index("alert_events_alert_idx").on(table.alertId, table.triggeredAt.desc()),
  ],
);

export type AlertRow = typeof alerts.$inferSelect;
export type AlertEventRow = typeof alertEvents.$inferSelect;
