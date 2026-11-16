import { z } from "zod";

export const transactionTypeSchema = z.enum(["buy", "sell"]);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const portfolioTransactionSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid(),
  symbol: z.string(),
  type: transactionTypeSchema,
  quantity: z.number(),
  price: z.number(),
  charges: z.number(),
  tradedAt: z.string().datetime(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type PortfolioTransaction = z.infer<typeof portfolioTransactionSchema>;

export const createTransactionSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .transform((v) => v.toUpperCase()),
  type: transactionTypeSchema,
  quantity: z.number().positive(),
  price: z.number().positive(),
  charges: z.number().min(0).default(0),
  tradedAt: z.coerce.date().default(() => new Date()),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export type CreateTransactionInput = z.input<typeof createTransactionSchema>;

export const updateTransactionSchema = createTransactionSchema.partial();
export type UpdateTransactionInput = z.input<typeof updateTransactionSchema>;

export const portfolioHoldingSchema = z.object({
  symbol: z.string(),
  name: z.string().nullable(),
  quantity: z.number(),
  averageBuyPrice: z.number().nullable(),
  investedAmount: z.number(),
  lastPrice: z.number().nullable(),
  marketValue: z.number().nullable(),
  unrealizedPnl: z.number().nullable(),
  unrealizedPnlPercent: z.number().nullable(),
  realizedPnl: z.number(),
  allocationPercent: z.number().nullable(),
  weightBasis: z.enum(["cost", "market"]),
});
export type PortfolioHolding = z.infer<typeof portfolioHoldingSchema>;

export const portfolioAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  currency: z.string(),
  benchmarkSymbol: z.string(),
  fdAnnualRate: z.number(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PortfolioAccount = z.infer<typeof portfolioAccountSchema>;

export const createPortfolioSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  currency: z.string().trim().length(3).default("INR"),
  benchmarkSymbol: z.string().trim().min(1).max(64).optional(),
  fdAnnualRate: z.number().min(0).max(1).optional(),
});
export type CreatePortfolioInput = z.input<typeof createPortfolioSchema>;

export const benchmarkComparisonSchema = z.object({
  benchmarkSymbol: z.string(),
  benchmarkReturnPercent: z.number().nullable(),
  fdReferenceAnnualRate: z.number(),
  fdReferenceReturnPercent: z.number().nullable(),
  portfolioReturnPercent: z.number().nullable(),
  excessVsBenchmarkPercent: z.number().nullable(),
  excessVsFdPercent: z.number().nullable(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  note: z.string(),
});
export type BenchmarkComparison = z.infer<typeof benchmarkComparisonSchema>;

export const portfolioPerformanceSchema = z.object({
  account: portfolioAccountSchema,
  asOf: z.string().datetime(),
  investedAmount: z.number(),
  currentValue: z.number(),
  totalUnrealizedPnl: z.number(),
  totalRealizedPnl: z.number(),
  totalPnl: z.number(),
  totalPnlPercent: z.number().nullable(),
  allocation: z.array(portfolioHoldingSchema),
  comparison: benchmarkComparisonSchema,
  dataWarnings: z.array(z.string()),
});
export type PortfolioPerformance = z.infer<typeof portfolioPerformanceSchema>;

export const portfolioDetailSchema = portfolioAccountSchema.extend({
  holdings: z.array(portfolioHoldingSchema),
  transactions: z.array(portfolioTransactionSchema),
  performance: portfolioPerformanceSchema.nullable(),
});
export type PortfolioDetail = z.infer<typeof portfolioDetailSchema>;
