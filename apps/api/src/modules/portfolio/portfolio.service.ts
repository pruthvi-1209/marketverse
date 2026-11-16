import type {
  BenchmarkComparison,
  CreatePortfolioInput,
  CreateTransactionInput,
  PortfolioAccount,
  PortfolioDetail,
  PortfolioHolding,
  PortfolioPerformance,
  PortfolioTransaction,
  UpdateTransactionInput,
} from "@marketverse/contracts";
import { BadRequestError, NotFoundError } from "../../core/errors/app-error";
import { storedResponseMeta } from "../../core/http/response-meta";
import { round, toNumber } from "../../core/utils/numbers";
import { env } from "../../config/env";
import { marketRepository } from "../../database/repositories/market.repository";
import {
  portfolioRepository,
  type HoldingComputation,
  type PortfolioAccountRow,
  type PortfolioTransactionRow,
} from "../../database/repositories/portfolio.repository";
import { stocksRepository } from "../../database/repositories/stocks.repository";
import { marketDataService } from "../../services/market-data.service";
import type { ResponseMeta } from "@marketverse/contracts";

interface LedgerComputation {
  holdings: HoldingComputation[];
  totalRealized: number;
  totalBuyCost: number;
  firstTradeAt: Date | null;
}

export function computeLedger(transactions: PortfolioTransactionRow[]): LedgerComputation {
  interface State {
    stockId: string;
    symbol: string;
    quantity: number;
    costBasis: number;
    realized: number;
    firstBuyDate: string | null;
  }
  const states = new Map<string, State>();
  let totalRealized = 0;
  let totalBuyCost = 0;
  let firstTradeAt: Date | null = null;

  const ordered = [...transactions].sort((a, b) => a.tradedAt.getTime() - b.tradedAt.getTime());

  for (const transaction of ordered) {
    if (!firstTradeAt || transaction.tradedAt < firstTradeAt) firstTradeAt = transaction.tradedAt;
    const quantity = toNumber(transaction.quantity) ?? 0;
    const price = toNumber(transaction.price) ?? 0;
    const charges = toNumber(transaction.charges) ?? 0;
    if (quantity <= 0 || price <= 0) continue;

    const current = states.get(transaction.stockId) ?? {
      stockId: transaction.stockId,
      symbol: transaction.symbol,
      quantity: 0,
      costBasis: 0,
      realized: 0,
      firstBuyDate: null,
    };

    if (transaction.type === "buy") {
      current.quantity += quantity;
      current.costBasis += quantity * price + charges;
      totalBuyCost += quantity * price + charges;
      current.firstBuyDate ??= transaction.tradedAt.toISOString().slice(0, 10);
      states.set(transaction.stockId, current);
      continue;
    }

    // Sell: cannot dispose of more shares than the ledger holds.
    if (quantity > current.quantity + 1e-9) {
      throw new BadRequestError(
        `Cannot sell ${quantity} ${transaction.symbol}: only ${current.quantity} held at that point in time`,
      );
    }
    const averageCost = current.quantity > 0 ? current.costBasis / current.quantity : 0;
    const costSold = averageCost * quantity;
    const proceeds = quantity * price - charges;
    current.realized += proceeds - costSold;
    totalRealized += proceeds - costSold;
    current.quantity = round(current.quantity - quantity, 6);
    current.costBasis = round(Math.max(0, current.costBasis - costSold), 6);
    if (current.quantity <= 0) {
      current.quantity = 0;
      current.costBasis = 0;
    }
    states.set(transaction.stockId, current);
  }

  const holdings: HoldingComputation[] = [...states.values()].map((state) => ({
    stockId: state.stockId,
    symbol: state.symbol,
    quantity: state.quantity,
    averageBuyPrice: state.quantity > 0 ? state.costBasis / state.quantity : null,
    investedAmount: state.costBasis,
    realizedPnl: state.realized,
    firstBuyDate: state.firstBuyDate,
  }));

  return { holdings, totalRealized, totalBuyCost, firstTradeAt };
}

function mapAccount(row: PortfolioAccountRow): PortfolioAccount {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    currency: row.currency,
    benchmarkSymbol: row.benchmarkSymbol,
    fdAnnualRate: Number(row.fdAnnualRate),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapTransaction(row: PortfolioTransactionRow): PortfolioTransaction {
  return {
    id: row.id,
    accountId: row.accountId,
    symbol: row.symbol,
    type: row.type,
    quantity: toNumber(row.quantity) ?? 0,
    price: toNumber(row.price) ?? 0,
    charges: toNumber(row.charges) ?? 0,
    tradedAt: row.tradedAt.toISOString(),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export class PortfolioService {
  async list(): Promise<{ accounts: PortfolioAccount[]; meta: ResponseMeta }> {
    const rows = await portfolioRepository.listAccounts();
    return {
      accounts: rows.map(mapAccount),
      meta: storedResponseMeta({ provider: "marketverse" }),
    };
  }

  async create(input: CreatePortfolioInput): Promise<{ account: PortfolioAccount; meta: ResponseMeta }> {
    const duplicate = await portfolioRepository.findAccountByName(input.name);
    if (duplicate) throw new BadRequestError(`A portfolio named '${input.name}' already exists`);
    const row = await portfolioRepository.createAccount({
      name: input.name,
      description: input.description ?? null,
      currency: input.currency ?? "INR",
      benchmarkSymbol: input.benchmarkSymbol ?? env.BENCHMARK_INDEX_SYMBOL,
      fdAnnualRate: input.fdAnnualRate ?? env.BENCHMARK_FD_ANNUAL_RATE,
    });
    return { account: mapAccount(row), meta: storedResponseMeta({ provider: "marketverse" }) };
  }

  async delete(id: string): Promise<void> {
    await this.requireAccount(id);
    await portfolioRepository.deleteAccount(id);
  }

  async detail(id: string): Promise<{ detail: PortfolioDetail; meta: ResponseMeta }> {    const account = await this.requireAccount(id);
    const [transactionRows, performance] = await Promise.all([
      portfolioRepository.transactions(account.id),
      this.performance(account.id).catch(() => null),
    ]);

    const holdings = await this.buildHoldings(account, transactionRows);

    const detail: PortfolioDetail = {
      ...mapAccount(account),
      holdings,
      transactions: transactionRows.map(mapTransaction),
      performance: performance?.performance ?? null,
    };
    return { detail, meta: storedResponseMeta({ provider: "marketverse" }) };
  }

  async addTransaction(
    id: string,
    input: CreateTransactionInput,
  ): Promise<{ transaction: PortfolioTransaction; meta: ResponseMeta }> {
    const account = await this.requireAccount(id);
    const symbol = input.symbol.toUpperCase();
    const stock = await this.resolveStock(symbol);

    const transaction = await portfolioRepository.createTransaction({
      accountId: account.id,
      stockId: stock.id,
      symbol,
      type: input.type,
      quantity: input.quantity,
      price: input.price,
      charges: input.charges ?? 0,
      tradedAt: input.tradedAt ?? new Date(),
      notes: input.notes ?? null,
    });

    await this.recalculateHoldings(account.id);
    return { transaction: mapTransaction(transaction), meta: storedResponseMeta({ provider: "marketverse" }) };
  }

  async updateTransaction(
    accountId: string,
    transactionId: string,
    input: UpdateTransactionInput,
  ): Promise<{ transaction: PortfolioTransaction; meta: ResponseMeta }> {
    await this.requireAccount(accountId);
    const existing = await portfolioRepository.findTransaction(transactionId);
    if (!existing || existing.accountId !== accountId) throw new NotFoundError("Transaction", transactionId);

    const updated = await portfolioRepository.updateTransaction(transactionId, {
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.charges !== undefined ? { charges: input.charges } : {}),
      ...(input.tradedAt !== undefined ? { tradedAt: input.tradedAt } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    await this.recalculateHoldings(accountId);
    return { transaction: mapTransaction(updated), meta: storedResponseMeta({ provider: "marketverse" }) };
  }

  async deleteTransaction(accountId: string, transactionId: string): Promise<void> {
    await this.requireAccount(accountId);
    const existing = await portfolioRepository.findTransaction(transactionId);
    if (!existing || existing.accountId !== accountId) throw new NotFoundError("Transaction", transactionId);
    await portfolioRepository.deleteTransaction(transactionId);
    await this.recalculateHoldings(accountId);
  }

  async performance(id: string): Promise<{ performance: PortfolioPerformance; meta: ResponseMeta }> {
    const account = await this.requireAccount(id);
    const transactions = await portfolioRepository.transactions(account.id);
    const holdings = await this.buildHoldings(account, transactions);

    const investedAmount = round(
      holdings.reduce((sum, holding) => sum + holding.investedAmount, 0),
      2,
    );
    const pricedHoldings = holdings.filter((holding) => holding.marketValue !== null);
    const currentValue = round(
      pricedHoldings.reduce((sum, holding) => sum + (holding.marketValue ?? 0), 0),
      2,
    );
    const totalUnrealized = round(
      pricedHoldings.reduce((sum, holding) => sum + (holding.unrealizedPnl ?? 0), 0),
      2,
    );
    const totalRealized = round(
      holdings.reduce((sum, holding) => sum + holding.realizedPnl, 0),
      2,
    );
    const totalPnl = round(totalUnrealized + totalRealized, 2);
    const ledger = computeLedger(transactions);
    const capitalBase = ledger.totalBuyCost;
    const totalPnlPercent = capitalBase > 0 ? round((totalPnl / capitalBase) * 100, 2) : null;

    const warnings: string[] = [];
    if (pricedHoldings.length < holdings.length) {
      warnings.push("Some holdings have no stored quote; their market value is excluded.");
    }

    const comparison = await this.compare(account, ledger.firstTradeAt, totalPnlPercent);

    return {
      performance: {
        account: mapAccount(account),
        asOf: new Date().toISOString(),
        investedAmount,
        currentValue,
        totalUnrealizedPnl: totalUnrealized,
        totalRealizedPnl: totalRealized,
        totalPnl,
        totalPnlPercent,
        allocation: holdings,
        comparison,
        dataWarnings: warnings,
      },
      meta: storedResponseMeta({ provider: "marketverse", warnings }),
    };
  }

  private async compare(
    account: PortfolioAccountRow,
    firstTradeAt: Date | null,
    portfolioReturnPercent: number | null,
  ): Promise<BenchmarkComparison> {
    const fdRate = Number(account.fdAnnualRate);
    const note =
      "Actual realised and unrealised gains use your own transaction inputs (charges only where provided). " +
      "Benchmark and fixed-deposit figures are hypothetical references over the same approximate window, not actual returns.";

    if (!firstTradeAt) {
      return {
        benchmarkSymbol: account.benchmarkSymbol,
        benchmarkReturnPercent: null,
        fdReferenceAnnualRate: fdRate,
        fdReferenceReturnPercent: null,
        portfolioReturnPercent,
        excessVsBenchmarkPercent: null,
        excessVsFdPercent: null,
        periodStart: null,
        periodEnd: null,
        note,
      };
    }

    const periodStart = firstTradeAt.toISOString().slice(0, 10);
    const periodEnd = new Date().toISOString().slice(0, 10);
    const days = Math.max(1, (Date.now() - firstTradeAt.getTime()) / 86_400_000);
    const fdReturnPercent = round(((1 + fdRate) ** (days / 365) - 1) * 100, 2);

    const rows = await marketRepository.indexHistoryForSymbol(account.benchmarkSymbol, 400);
    const ascending = [...rows].reverse();
    const startRow = ascending.find((row) => row.tradingDate >= periodStart);
    const endRow = ascending[ascending.length - 1];
    const startClose = startRow ? toNumber(startRow.close) : null;
    const endClose = endRow ? toNumber(endRow.close) : null;
    const benchmarkReturnPercent =
      startClose !== null && endClose !== null && startClose !== 0
        ? round(((endClose - startClose) / startClose) * 100, 2)
        : null;

    return {
      benchmarkSymbol: account.benchmarkSymbol,
      benchmarkReturnPercent,
      fdReferenceAnnualRate: fdRate,
      fdReferenceReturnPercent: fdReturnPercent,
      portfolioReturnPercent,
      excessVsBenchmarkPercent:
        benchmarkReturnPercent !== null && portfolioReturnPercent !== null
          ? round(portfolioReturnPercent - benchmarkReturnPercent, 2)
          : null,
      excessVsFdPercent:
        portfolioReturnPercent !== null ? round(portfolioReturnPercent - fdReturnPercent, 2) : null,
      periodStart,
      periodEnd,
      note,
    };
  }

  private async buildHoldings(
    _account: PortfolioAccountRow,
    transactions: PortfolioTransactionRow[],
  ): Promise<PortfolioHolding[]> {
    const ledger = computeLedger(transactions);
    const symbols = ledger.holdings.map((holding) => holding.symbol);
    const quotes = await marketRepository.latestQuotesForSymbols(symbols);
    const stockIds = ledger.holdings.map((holding) => holding.stockId);
    const stocks = await stocksRepository.findByIds(stockIds);
    const nameById = new Map(stocks.map((stock) => [stock.id, stock.name]));

    const withValues = ledger.holdings.map((holding) => {
      const quoteRow = quotes.get(holding.symbol);
      const lastPrice = quoteRow ? toNumber(quoteRow.lastPrice) : null;
      const marketValue = lastPrice !== null ? round(lastPrice * holding.quantity, 2) : null;
      const unrealized = marketValue !== null ? round(marketValue - holding.investedAmount, 2) : null;
      return {
        symbol: holding.symbol,
        name: nameById.get(holding.stockId) ?? null,
        quantity: round(holding.quantity, 4),
        averageBuyPrice: holding.averageBuyPrice === null ? null : round(holding.averageBuyPrice, 4),
        investedAmount: round(holding.investedAmount, 2),
        lastPrice,
        marketValue,
        unrealizedPnl: unrealized,
        unrealizedPnlPercent:
          unrealized !== null && holding.investedAmount > 0
            ? round((unrealized / holding.investedAmount) * 100, 2)
            : null,
        realizedPnl: round(holding.realizedPnl, 2),
        allocationPercent: null,
        weightBasis: (marketValue !== null ? "market" : "cost") as "market" | "cost",
      };
    });

    const totalMarket = withValues.reduce((sum, holding) => sum + (holding.marketValue ?? 0), 0);
    const totalCost = withValues.reduce((sum, holding) => sum + holding.investedAmount, 0);

    return withValues.map((holding) => ({
      ...holding,
      allocationPercent: (() => {
        if (holding.marketValue !== null && totalMarket > 0) {
          return round((holding.marketValue / totalMarket) * 100, 2);
        }
        if (totalCost > 0) return round((holding.investedAmount / totalCost) * 100, 2);
        return null;
      })(),
    }));
  }

  private async recalculateHoldings(accountId: string): Promise<void> {
    const transactions = await portfolioRepository.transactions(accountId);
    const ledger = computeLedger(transactions);
    await portfolioRepository.replaceHoldings(accountId, ledger.holdings, new Date());
  }

  private async resolveStock(symbol: string) {
    const existing = await stocksRepository.findBySymbol(symbol);
    if (existing) return existing;
    return marketDataService.ensureStock(symbol);
  }

  private async requireAccount(id: string): Promise<PortfolioAccountRow> {
    const account = await portfolioRepository.findAccount(id);
    if (!account) throw new NotFoundError("Portfolio", id);
    return account;
  }
}

export const portfolioService = new PortfolioService();
