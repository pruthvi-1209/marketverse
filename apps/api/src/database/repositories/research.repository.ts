import { and, desc, eq } from "drizzle-orm";
import type { AiRelevance } from "@marketverse/contracts";
import { db } from "../client";
import {
  aiInfrastructureCompanies,
  companyFundamentals,
  type AiInfrastructureRow,
  type CompanyFundamentalRow,
} from "../schema";

export interface FundamentalUpsert {
  stockId: string;
  symbol: string;
  periodType: "annual" | "quarterly" | "ttm";
  periodEnd: string;
  currency?: string;
  revenue?: number | null;
  netProfit?: number | null;
  eps?: number | null;
  roePercent?: number | null;
  operatingMarginPercent?: number | null;
  debtToEquity?: number | null;
  promoterHoldingPercent?: number | null;
  institutionalHoldingPercent?: number | null;
  source: string;
  sourceUrl?: string | null;
  verified: boolean;
  retrievedAt: Date;
}

const numericString = (value: number | null | undefined): string | null =>
  value === null || value === undefined ? null : value.toFixed(4);

export const researchRepository = {
  async upsertCompany(input: {
    stockId: string;
    symbol: string;
    name: string;
    isWatchlistMember: boolean;
    relevance: AiRelevance;
    sourceNotes?: string | null;
  }): Promise<AiInfrastructureRow> {
    const rows = await db
      .insert(aiInfrastructureCompanies)
      .values({ ...input, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: aiInfrastructureCompanies.symbol,
        set: {
          stockId: input.stockId,
          name: input.name,
          isWatchlistMember: input.isWatchlistMember,
          relevance: input.relevance,
          sourceNotes: input.sourceNotes ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to persist AI infrastructure company");
    return row;
  },

  async listCompanies(): Promise<AiInfrastructureRow[]> {
    return db
      .select()
      .from(aiInfrastructureCompanies)
      .orderBy(desc(aiInfrastructureCompanies.isWatchlistMember), aiInfrastructureCompanies.symbol);
  },

  async findCompany(symbol: string): Promise<AiInfrastructureRow | null> {
    const rows = await db
      .select()
      .from(aiInfrastructureCompanies)
      .where(eq(aiInfrastructureCompanies.symbol, symbol))
      .limit(1);
    return rows[0] ?? null;
  },

  async deleteCompany(symbol: string): Promise<void> {
    await db.delete(aiInfrastructureCompanies).where(eq(aiInfrastructureCompanies.symbol, symbol));
  },

  async upsertFundamental(input: FundamentalUpsert): Promise<CompanyFundamentalRow> {
    const rows = await db
      .insert(companyFundamentals)
      .values({
        stockId: input.stockId,
        symbol: input.symbol,
        periodType: input.periodType,
        periodEnd: input.periodEnd,
        currency: input.currency ?? "INR",
        revenue: numericString(input.revenue),
        netProfit: numericString(input.netProfit),
        eps: numericString(input.eps),
        roePercent: numericString(input.roePercent),
        operatingMarginPercent: numericString(input.operatingMarginPercent),
        debtToEquity: numericString(input.debtToEquity),
        promoterHoldingPercent: numericString(input.promoterHoldingPercent),
        institutionalHoldingPercent: numericString(input.institutionalHoldingPercent),
        source: input.source,
        sourceUrl: input.sourceUrl ?? null,
        verified: input.verified,
        retrievedAt: input.retrievedAt,
      })
      .onConflictDoUpdate({
        target: [
          companyFundamentals.stockId,
          companyFundamentals.periodType,
          companyFundamentals.periodEnd,
          companyFundamentals.source,
        ],
        set: {
          revenue: numericString(input.revenue),
          netProfit: numericString(input.netProfit),
          eps: numericString(input.eps),
          roePercent: numericString(input.roePercent),
          operatingMarginPercent: numericString(input.operatingMarginPercent),
          debtToEquity: numericString(input.debtToEquity),
          promoterHoldingPercent: numericString(input.promoterHoldingPercent),
          institutionalHoldingPercent: numericString(input.institutionalHoldingPercent),
          verified: input.verified,
          retrievedAt: input.retrievedAt,
        },
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to persist company fundamentals");
    return row;
  },

  async latestVerifiedFundamental(stockId: string): Promise<CompanyFundamentalRow | null> {
    const rows = await db
      .select()
      .from(companyFundamentals)
      .where(and(eq(companyFundamentals.stockId, stockId), eq(companyFundamentals.verified, true)))
      .orderBy(desc(companyFundamentals.periodEnd))
      .limit(1);
    return rows[0] ?? null;
  },

  async priorVerifiedFundamental(
    stockId: string,
    beforePeriodEnd: string,
  ): Promise<CompanyFundamentalRow | null> {
    const rows = await db
      .select()
      .from(companyFundamentals)
      .where(and(eq(companyFundamentals.stockId, stockId), eq(companyFundamentals.verified, true)))
      .orderBy(desc(companyFundamentals.periodEnd));
    return rows.find((row) => row.periodEnd < beforePeriodEnd) ?? null;
  },

  async fundamentalsForStock(stockId: string): Promise<CompanyFundamentalRow[]> {
    return db
      .select()
      .from(companyFundamentals)
      .where(eq(companyFundamentals.stockId, stockId))
      .orderBy(desc(companyFundamentals.periodEnd));
  },
};
