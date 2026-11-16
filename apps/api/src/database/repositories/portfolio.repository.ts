import { asc, eq, sql } from "drizzle-orm";
import { db } from "../client";
import {
  portfolioAccounts,
  portfolioHoldings,
  portfolioTransactions,
  stocks,
  type PortfolioAccountRow,
  type PortfolioHoldingRow,
  type PortfolioTransactionRow,
} from "../schema";

export interface TransactionInput {
  accountId: string;
  stockId: string;
  symbol: string;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  charges: number;
  tradedAt: Date;
  notes?: string | null;
}

export interface HoldingComputation {
  stockId: string;
  symbol: string;
  quantity: number;
  averageBuyPrice: number | null;
  investedAmount: number;
  realizedPnl: number;
  firstBuyDate: string | null;
}

export const portfolioRepository = {
  async listAccounts(): Promise<PortfolioAccountRow[]> {
    return db.select().from(portfolioAccounts).orderBy(asc(portfolioAccounts.createdAt));
  },

  async findAccount(id: string): Promise<PortfolioAccountRow | null> {
    const rows = await db.select().from(portfolioAccounts).where(eq(portfolioAccounts.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async findAccountByName(name: string): Promise<PortfolioAccountRow | null> {
    const rows = await db
      .select()
      .from(portfolioAccounts)
      .where(sql`lower(${portfolioAccounts.name}) = lower(${name})`)
      .limit(1);
    return rows[0] ?? null;
  },

  async createAccount(input: {
    name: string;
    description?: string | null;
    currency: string;
    benchmarkSymbol: string;
    fdAnnualRate: number;
  }): Promise<PortfolioAccountRow> {
    const rows = await db
      .insert(portfolioAccounts)
      .values({
        name: input.name,
        description: input.description ?? null,
        currency: input.currency,
        benchmarkSymbol: input.benchmarkSymbol,
        fdAnnualRate: input.fdAnnualRate.toFixed(5),
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to create portfolio account");
    return row;
  },

  async updateAccount(
    id: string,
    input: { name?: string; description?: string | null; benchmarkSymbol?: string; fdAnnualRate?: number },
  ): Promise<PortfolioAccountRow> {
    const rows = await db
      .update(portfolioAccounts)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.benchmarkSymbol !== undefined ? { benchmarkSymbol: input.benchmarkSymbol } : {}),
        ...(input.fdAnnualRate !== undefined ? { fdAnnualRate: input.fdAnnualRate.toFixed(5) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(portfolioAccounts.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Portfolio account not found while updating");
    return row;
  },

  async deleteAccount(id: string): Promise<void> {
    await db.delete(portfolioAccounts).where(eq(portfolioAccounts.id, id));
  },

  async transactions(accountId: string): Promise<PortfolioTransactionRow[]> {
    return db
      .select()
      .from(portfolioTransactions)
      .where(eq(portfolioTransactions.accountId, accountId))
      .orderBy(asc(portfolioTransactions.tradedAt), asc(portfolioTransactions.createdAt));
  },

  async findTransaction(id: string): Promise<PortfolioTransactionRow | null> {
    const rows = await db
      .select()
      .from(portfolioTransactions)
      .where(eq(portfolioTransactions.id, id))
      .limit(1);
    return rows[0] ?? null;
  },

  async createTransaction(input: TransactionInput): Promise<PortfolioTransactionRow> {
    const rows = await db
      .insert(portfolioTransactions)
      .values({
        accountId: input.accountId,
        stockId: input.stockId,
        symbol: input.symbol,
        type: input.type,
        quantity: input.quantity.toFixed(4),
        price: input.price.toFixed(4),
        charges: input.charges.toFixed(4),
        tradedAt: input.tradedAt,
        notes: input.notes ?? null,
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Failed to create portfolio transaction");
    return row;
  },

  async updateTransaction(
    id: string,
    input: {
      type?: "buy" | "sell";
      quantity?: number;
      price?: number;
      charges?: number;
      tradedAt?: Date;
      notes?: string | null;
    },
  ): Promise<PortfolioTransactionRow> {
    const rows = await db
      .update(portfolioTransactions)
      .set({
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.quantity !== undefined ? { quantity: input.quantity.toFixed(4) } : {}),
        ...(input.price !== undefined ? { price: input.price.toFixed(4) } : {}),
        ...(input.charges !== undefined ? { charges: input.charges.toFixed(4) } : {}),
        ...(input.tradedAt !== undefined ? { tradedAt: input.tradedAt } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedAt: new Date(),
      })
      .where(eq(portfolioTransactions.id, id))
      .returning();
    const row = rows[0];
    if (!row) throw new Error("Transaction not found while updating");
    return row;
  },

  async deleteTransaction(id: string): Promise<void> {
    await db.delete(portfolioTransactions).where(eq(portfolioTransactions.id, id));
  },

  async holdings(accountId: string): Promise<Array<PortfolioHoldingRow & { name: string | null }>> {
    return db
      .select({
        id: portfolioHoldings.id,
        accountId: portfolioHoldings.accountId,
        stockId: portfolioHoldings.stockId,
        symbol: portfolioHoldings.symbol,
        quantity: portfolioHoldings.quantity,
        averageBuyPrice: portfolioHoldings.averageBuyPrice,
        investedAmount: portfolioHoldings.investedAmount,
        realizedPnl: portfolioHoldings.realizedPnl,
        firstBuyDate: portfolioHoldings.firstBuyDate,
        lastCalculatedAt: portfolioHoldings.lastCalculatedAt,
        name: stocks.name,
      })
      .from(portfolioHoldings)
      .leftJoin(stocks, eq(stocks.id, portfolioHoldings.stockId))
      .where(eq(portfolioHoldings.accountId, accountId))
      .orderBy(asc(portfolioHoldings.symbol));
  },

  /** Recomputes and replaces derived holdings atomically from the ledger. */
  async replaceHoldings(accountId: string, holdings: HoldingComputation[], calculatedAt: Date): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(portfolioHoldings).where(eq(portfolioHoldings.accountId, accountId));
      const rows = holdings.filter((holding) => holding.quantity > 0);
      if (rows.length === 0) return;
      await tx.insert(portfolioHoldings).values(
        rows.map((holding) => ({
          accountId,
          stockId: holding.stockId,
          symbol: holding.symbol,
          quantity: holding.quantity.toFixed(4),
          averageBuyPrice:
            holding.averageBuyPrice === null ? null : holding.averageBuyPrice.toFixed(4),
          investedAmount: holding.investedAmount.toFixed(4),
          realizedPnl: holding.realizedPnl.toFixed(4),
          firstBuyDate: holding.firstBuyDate,
          lastCalculatedAt: calculatedAt,
        })),
      );
    });
  },
};

export type { PortfolioAccountRow, PortfolioTransactionRow };
