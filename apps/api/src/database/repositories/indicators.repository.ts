import { and, desc, eq } from "drizzle-orm";
import type { IndicatorValues } from "@marketverse/contracts";
import { db } from "../client";
import { technicalIndicators, type TechnicalIndicatorRow } from "../schema";

export const indicatorsRepository = {
  async upsert(input: {
    stockId: string;
    symbol: string;
    asOfDate: string;
    version: string;
    calculatedAt: Date;
    observationsUsed: number;
    values: IndicatorValues;
    missing: string[];
    source: string;
  }): Promise<TechnicalIndicatorRow> {
    const rows = await db
      .insert(technicalIndicators)
      .values(input)
      .onConflictDoUpdate({
        target: [technicalIndicators.stockId, technicalIndicators.asOfDate, technicalIndicators.version],
        set: {
          calculatedAt: input.calculatedAt,
          observationsUsed: input.observationsUsed,
          values: input.values,
          missing: input.missing,
          source: input.source,
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to persist technical indicators");
    return row;
  },

  async latest(stockId: string): Promise<TechnicalIndicatorRow | null> {
    const rows = await db
      .select()
      .from(technicalIndicators)
      .where(eq(technicalIndicators.stockId, stockId))
      .orderBy(desc(technicalIndicators.asOfDate))
      .limit(1);
    return rows[0] ?? null;
  },

  async latestBySymbol(symbol: string): Promise<TechnicalIndicatorRow | null> {
    const rows = await db
      .select()
      .from(technicalIndicators)
      .where(eq(technicalIndicators.symbol, symbol))
      .orderBy(desc(technicalIndicators.asOfDate))
      .limit(1);
    return rows[0] ?? null;
  },

  async forDate(stockId: string, asOfDate: string): Promise<TechnicalIndicatorRow | null> {
    const rows = await db
      .select()
      .from(technicalIndicators)
      .where(and(eq(technicalIndicators.stockId, stockId), eq(technicalIndicators.asOfDate, asOfDate)))
      .limit(1);
    return rows[0] ?? null;
  },

  async count(): Promise<number> {
    const rows = await db.select({ id: technicalIndicators.id }).from(technicalIndicators);
    return rows.length;
  },
};
