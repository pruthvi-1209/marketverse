import { Router } from "express";
import {
  indexHistoryQuerySchema,
  marketMoversQuerySchema,
  type VolumeTrend,
} from "@marketverse/contracts";
import { storedResponseMeta } from "../core/http/response-meta";
import {
  getValidatedQuery,
  validateParams,
  validateQuery,
} from "../core/middleware/validate";
import { marketService } from "../modules/market/market.service";
import {
  breadthQuerySchema,
  marketIndicesQuerySchema,
  symbolParamSchema,
} from "./params";

export const marketRouter = Router();

marketRouter.get(
  "/indices",
  validateQuery(marketIndicesQuerySchema),
  async (_req, res) => {
    const query = getValidatedQuery<{ group?: string; nameFilter?: string }>(res);
    const result = await marketService.indices(query);
    res.json({ data: result.indices, meta: result.meta });
  },
);

marketRouter.get(
  "/breadth",
  validateQuery(breadthQuerySchema),
  async (_req, res) => {
    const query = getValidatedQuery<{ date?: string }>(res);
    const result = await marketService.breadth(query.date);
    res.json({ data: result.breadth, meta: result.meta });
  },
);

marketRouter.get(
  "/movers",
  validateQuery(marketMoversQuerySchema),
  async (_req, res) => {
    const query = getValidatedQuery<{ limit: number }>(res);
    const result = await marketService.movers(query.limit);
    res.json({ data: result.movers, meta: result.meta });
  },
);

marketRouter.get("/overview", async (_req, res) => {
  const result = await marketService.overview();
  res.json({ data: result.overview, meta: result.meta });
});

marketRouter.get(
  "/indices/:symbol/history",
  validateParams(symbolParamSchema),
  validateQuery(indexHistoryQuerySchema),
  async (req, res) => {
    const query = getValidatedQuery<{ limit: number }>(res);
    const result = await marketService.indexHistory(req.params.symbol as string, query.limit);
    res.json({ data: result.points, meta: result.meta });
  },
);

marketRouter.get(
  "/volume-trend/:symbol",
  validateParams(symbolParamSchema),
  async (req, res) => {
    const trend = (await marketService.volumeTrendFor(req.params.symbol as string)) as VolumeTrend;
    res.json({ data: trend, meta: storedResponseMeta({ provider: "marketverse" }) });
  },
);
