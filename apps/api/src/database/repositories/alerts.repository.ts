import { and, desc, eq, sql } from "drizzle-orm";
import type { AlertOperator, AlertType } from "@marketverse/contracts";
import { db } from "../client";
import { alertEvents, alerts, type AlertEventRow, type AlertRow } from "../schema";

export interface AlertCreateInput {
  name: string;
  type: AlertType;
  symbol?: string | null;
  watchlistId?: string | null;
  operator: AlertOperator;
  threshold?: number | null;
  parameters?: Record<string, number | string | boolean> | null;
  cooldownSeconds: number;
}

const toNumeric = (value: number | null | undefined): string | null =>
  value === null || value === undefined ? null : value.toFixed(4);

export const alertRepository = {
  async list(): Promise<AlertRow[]> {
    return db.select().from(alerts).orderBy(desc(alerts.createdAt));
  },

  async findById(id: string): Promise<AlertRow | null> {
    const rows = await db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async enabled(): Promise<AlertRow[]> {
    return db.select().from(alerts).where(eq(alerts.enabled, true)).orderBy(desc(alerts.createdAt));
  },

  async create(input: AlertCreateInput): Promise<AlertRow> {
    const rows = await db
      .insert(alerts)
      .values({
        name: input.name,
        type: input.type,
        symbol: input.symbol ?? null,
        watchlistId: input.watchlistId ?? null,
        operator: input.operator,
        threshold: toNumeric(input.threshold),
        parameters: input.parameters ?? null,
        cooldownSeconds: input.cooldownSeconds,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to create alert");
    return row;
  },

  async update(
    id: string,
    input: {
      name?: string;
      operator?: AlertOperator;
      threshold?: number | null;
      parameters?: Record<string, number | string | boolean> | null;
      enabled?: boolean;
      cooldownSeconds?: number;
    },
  ): Promise<AlertRow> {
    const rows = await db
      .update(alerts)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.operator !== undefined ? { operator: input.operator } : {}),
        ...(input.threshold !== undefined ? { threshold: toNumeric(input.threshold) } : {}),
        ...(input.parameters !== undefined ? { parameters: input.parameters } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.cooldownSeconds !== undefined ? { cooldownSeconds: input.cooldownSeconds } : {}),
        updatedAt: new Date(),
      })
      .where(eq(alerts.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Alert not found while updating");
    return row;
  },

  async delete(id: string): Promise<void> {
    await db.delete(alerts).where(eq(alerts.id, id));
  },

  async recordTrigger(
    alertId: string,
    input: { observedValue: number | null; message: string; dedupeKey: string; delivered: boolean; deliveryError?: string | null },
    triggeredAt: Date,
  ): Promise<AlertEventRow | null> {
    const inserted = await db
      .insert(alertEvents)
      .values({
        alertId,
        triggeredAt,
        observedValue: input.observedValue === null ? null : input.observedValue.toFixed(4),
        message: input.message,
        dedupeKey: input.dedupeKey,
        delivered: input.delivered,
        deliveryError: input.deliveryError ?? null,
      })
      .onConflictDoNothing({ target: alertEvents.dedupeKey })
      .returning();
    if (inserted.length === 0) return null;
    await db.update(alerts).set({ lastTriggeredAt: triggeredAt, updatedAt: new Date() }).where(eq(alerts.id, alertId));
    return inserted[0] ?? null;
  },

  async events(alertId: string, limit = 50): Promise<AlertEventRow[]> {
    return db
      .select()
      .from(alertEvents)
      .where(eq(alertEvents.alertId, alertId))
      .orderBy(desc(alertEvents.triggeredAt))
      .limit(limit);
  },

  async recentEvents(limit = 100): Promise<AlertEventRow[]> {
    return db.select().from(alertEvents).orderBy(desc(alertEvents.triggeredAt)).limit(limit);
  },

  async latestEvent(alertId: string): Promise<AlertEventRow | null> {
    const rows = await db
      .select()
      .from(alertEvents)
      .where(eq(alertEvents.alertId, alertId))
      .orderBy(desc(alertEvents.triggeredAt))
      .limit(1);
    return rows[0] ?? null;
  },

  async previousEventBefore(alertId: string, before: Date): Promise<AlertEventRow | null> {
    const rows = await db
      .select()
      .from(alertEvents)
      .where(and(eq(alertEvents.alertId, alertId), sql`${alertEvents.triggeredAt} < ${before}`))
      .orderBy(desc(alertEvents.triggeredAt))
      .limit(1);
    return rows[0] ?? null;
  },

  async count(): Promise<number> {
    const rows = await db.select({ value: sql<number>`count(*)` }).from(alerts);
    return Number(rows[0]?.value ?? 0);
  },
};
