import { desc, eq } from "drizzle-orm";
import type { EntryScore, QualityScore, ScoreCategory, ScoreExplanation } from "@marketverse/contracts";
import { db } from "../client";
import { entryScores, investmentScores, type EntryScoreRow, type InvestmentScoreRow } from "../schema";

export function mapQualityRow(row: InvestmentScoreRow): QualityScore {
  return {
    symbol: row.symbol,
    score: Number(row.score),
    maxScore: 100,
    availablePoints: Number(row.availablePoints),
    coveragePercent: Number(row.coveragePercent),
    categories: row.categories,
    missingFields: row.missingFields,
    explanation: row.explanation,
    methodologyVersion: row.methodologyVersion,
    calculatedAt: row.calculatedAt.toISOString(),
  };
}

export function mapEntryRow(row: EntryScoreRow): EntryScore {
  return {
    symbol: row.symbol,
    score: Number(row.score),
    maxScore: 100,
    coveragePercent: Number(row.coveragePercent),
    components: row.components,
    riskFactors: row.riskFactors,
    invalidationLevel: row.invalidationLevel === null ? null : Number(row.invalidationLevel),
    explanation: row.explanation,
    methodologyVersion: row.methodologyVersion,
    calculatedAt: row.calculatedAt.toISOString(),
  };
}

export const scoringRepository = {
  async saveQuality(input: {
    stockId: string;
    symbol: string;
    asOfDate: string;
    score: number;
    availablePoints: number;
    coveragePercent: number;
    categories: ScoreCategory[];
    missingFields: string[];
    explanation: ScoreExplanation;
    methodologyVersion: string;
    calculatedAt: Date;
  }): Promise<InvestmentScoreRow> {
    const rows = await db
      .insert(investmentScores)
      .values({
        ...input,
        score: input.score.toFixed(2),
        availablePoints: input.availablePoints.toFixed(2),
        coveragePercent: input.coveragePercent.toFixed(2),
      })
      .onConflictDoUpdate({
        target: [investmentScores.stockId, investmentScores.asOfDate, investmentScores.methodologyVersion],
        set: {
          score: input.score.toFixed(2),
          availablePoints: input.availablePoints.toFixed(2),
          coveragePercent: input.coveragePercent.toFixed(2),
          categories: input.categories,
          missingFields: input.missingFields,
          explanation: input.explanation,
          calculatedAt: input.calculatedAt,
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to persist investment score");
    return row;
  },

  async saveEntry(input: {
    stockId: string;
    symbol: string;
    asOfDate: string;
    score: number;
    coveragePercent: number;
    components: ScoreCategory[];
    riskFactors: string[];
    invalidationLevel: number | null;
    explanation: string;
    methodologyVersion: string;
    calculatedAt: Date;
  }): Promise<EntryScoreRow> {
    const rows = await db
      .insert(entryScores)
      .values({
        ...input,
        score: input.score.toFixed(2),
        coveragePercent: input.coveragePercent.toFixed(2),
        invalidationLevel: input.invalidationLevel === null ? null : input.invalidationLevel.toFixed(4),
      })
      .onConflictDoUpdate({
        target: [entryScores.stockId, entryScores.asOfDate, entryScores.methodologyVersion],
        set: {
          score: input.score.toFixed(2),
          coveragePercent: input.coveragePercent.toFixed(2),
          components: input.components,
          riskFactors: input.riskFactors,
          invalidationLevel: input.invalidationLevel === null ? null : input.invalidationLevel.toFixed(4),
          explanation: input.explanation,
          calculatedAt: input.calculatedAt,
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to persist entry score");
    return row;
  },

  async latestQuality(stockId: string): Promise<InvestmentScoreRow | null> {
    const rows = await db
      .select()
      .from(investmentScores)
      .where(eq(investmentScores.stockId, stockId))
      .orderBy(desc(investmentScores.asOfDate), desc(investmentScores.calculatedAt))
      .limit(1);
    return rows[0] ?? null;
  },

  async latestEntry(stockId: string): Promise<EntryScoreRow | null> {
    const rows = await db
      .select()
      .from(entryScores)
      .where(eq(entryScores.stockId, stockId))
      .orderBy(desc(entryScores.asOfDate), desc(entryScores.calculatedAt))
      .limit(1);
    return rows[0] ?? null;
  },

  async qualityHistory(stockId: string, limit = 30): Promise<InvestmentScoreRow[]> {
    return db
      .select()
      .from(investmentScores)
      .where(eq(investmentScores.stockId, stockId))
      .orderBy(desc(investmentScores.asOfDate))
      .limit(limit);
  },

  async entryHistory(stockId: string, limit = 30): Promise<EntryScoreRow[]> {
    return db
      .select()
      .from(entryScores)
      .where(eq(entryScores.stockId, stockId))
      .orderBy(desc(entryScores.asOfDate))
      .limit(limit);
  },

  async scoreCount(): Promise<number> {
    const rows = await db.select({ id: investmentScores.id }).from(investmentScores);
    return rows.length;
  },
};
