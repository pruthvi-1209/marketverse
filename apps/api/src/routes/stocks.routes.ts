import { Router } from "express";
import {
  historyQuerySchema,
  stockListQuerySchema,
  type HistoryQuery,
  type StockListQuery,
} from "@marketverse/contracts";
import { storedResponseMeta } from "../core/http/response-meta";
import { stocksService } from "../modules/stocks/stocks.service";
import {
  booleanQuery,
  stockSearchQuerySchema,
  symbolParamSchema,
} from "./params";
import {
  getValidatedQuery,
  validateParams,
  validateQuery,
} from "../core/middleware/validate";

export const stocksRouter = Router();

stocksRouter.get(
  "/",
  validateQuery(stockListQuerySchema),
  async (_req, res) => {
    const query = getValidatedQuery<StockListQuery>(res);
    const result = await stocksService.list(query);
    const totalPages = Math.max(0, Math.ceil(result.total / query.pageSize));
    res.json({
      data: result.items,
      meta: storedResponseMeta({ provider: "marketverse" }),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages,
        hasNext: query.page < totalPages,
      },
    });
  },
);

// Declared before `/:symbol` so the literal path wins.
stocksRouter.get(
  "/search",
  validateQuery(stockSearchQuerySchema),
  async (_req, res) => {
    const query = getValidatedQuery<{ q: string }>(res);
    const result = await stocksService.search(query.q);
    res.json({
      data: result.items,
      meta: storedResponseMeta({ provider: "marketverse", warnings: result.warnings }),
    });
  },
);

stocksRouter.get(
  "/:symbol",
  validateParams(symbolParamSchema),
  async (req, res) => {
    const result = await stocksService.detail(req.params.symbol as string);
    res.json({ data: result.detail, meta: result.meta });
  },
);

stocksRouter.get(
  "/:symbol/quote",
  validateParams(symbolParamSchema),
  async (req, res) => {
    const refresh = booleanQuery.parse(req.query.refresh);
    const result = await stocksService.quote(req.params.symbol as string, { refresh });
    res.json({ data: result.quote, meta: result.meta });
  },
);

stocksRouter.get(
  "/:symbol/history",
  validateParams(symbolParamSchema),
  validateQuery(historyQuerySchema),
  async (req, res) => {
    const query = getValidatedQuery<HistoryQuery>(res);
    const result = await stocksService.history(req.params.symbol as string, query);
    res.json({ data: result.items, meta: result.meta });
  },
);

stocksRouter.get(
  "/:symbol/indicators",
  validateParams(symbolParamSchema),
  async (req, res) => {
    const recalculate = booleanQuery.parse(req.query.recalculate);
    const result = await stocksService.indicators(req.params.symbol as string, { recalculate });
    res.json({
      data: result.snapshot,
      meta: storedResponseMeta({ provider: "marketverse", warnings: result.warnings }),
    });
  },
);

stocksRouter.get(
  "/:symbol/scores",
  validateParams(symbolParamSchema),
  async (req, res) => {
    const recalculate = booleanQuery.parse(req.query.recalculate);
    const result = await stocksService.scores(req.params.symbol as string, { recalculate });
    res.json({ data: result, meta: storedResponseMeta({ provider: "marketverse" }) });
  },
);
