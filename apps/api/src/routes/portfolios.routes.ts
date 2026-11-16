import { Router } from "express";
import {
  createPortfolioSchema,
  createTransactionSchema,
  updateTransactionSchema,
} from "@marketverse/contracts";
import { validateBody, validateParams } from "../core/middleware/validate";
import { portfolioService } from "../modules/portfolio/portfolio.service";
import { idParamSchema, portfolioTransactionParamSchema } from "./params";

export const portfoliosRouter = Router();

portfoliosRouter.get("/", async (_req, res) => {
  const result = await portfolioService.list();
  res.json({ data: result.accounts, meta: result.meta });
});

portfoliosRouter.post(
  "/",
  validateBody(createPortfolioSchema),
  async (req, res) => {
    const result = await portfolioService.create(req.body);
    res.status(201).json({ data: result.account, meta: result.meta });
  },
);

portfoliosRouter.get(
  "/:id",
  validateParams(idParamSchema),
  async (req, res) => {
    const result = await portfolioService.detail(req.params.id as string);
    res.json({ data: result.detail, meta: result.meta });
  },
);

portfoliosRouter.delete(
  "/:id",
  validateParams(idParamSchema),
  async (req, res) => {
    await portfolioService.delete(req.params.id as string);
    res.status(204).send();
  },
);

portfoliosRouter.get(
  "/:id/performance",  validateParams(idParamSchema),
  async (req, res) => {
    const result = await portfolioService.performance(req.params.id as string);
    res.json({ data: result.performance, meta: result.meta });
  },
);

portfoliosRouter.post(
  "/:id/transactions",
  validateParams(idParamSchema),
  validateBody(createTransactionSchema),
  async (req, res) => {
    const result = await portfolioService.addTransaction(req.params.id as string, req.body);
    res.status(201).json({ data: result.transaction, meta: result.meta });
  },
);

portfoliosRouter.patch(
  "/:id/transactions/:transactionId",
  validateParams(portfolioTransactionParamSchema),
  validateBody(updateTransactionSchema),
  async (req, res) => {
    const result = await portfolioService.updateTransaction(
      req.params.id as string,
      req.params.transactionId as string,
      req.body,
    );
    res.json({ data: result.transaction, meta: result.meta });
  },
);

portfoliosRouter.delete(
  "/:id/transactions/:transactionId",
  validateParams(portfolioTransactionParamSchema),
  async (req, res) => {
    await portfolioService.deleteTransaction(
      req.params.id as string,
      req.params.transactionId as string,
    );
    res.status(204).send();
  },
);
