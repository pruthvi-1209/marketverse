import { Router } from "express";
import {
  addWatchlistItemSchema,
  createWatchlistSchema,
  reorderWatchlistSchema,
  updateWatchlistSchema,
} from "@marketverse/contracts";
import { validateBody, validateParams } from "../core/middleware/validate";
import { watchlistService } from "../modules/watchlist/watchlist.service";
import { idParamSchema, watchlistScoreParamSchema } from "./params";

export const watchlistsRouter = Router();

watchlistsRouter.get("/", async (_req, res) => {
  const result = await watchlistService.list();
  res.json({ data: result.items, meta: result.meta });
});

watchlistsRouter.post(
  "/",
  validateBody(createWatchlistSchema),
  async (req, res) => {
    const result = await watchlistService.create(req.body);
    res.status(201).json({ data: result.watchlist, meta: result.meta });
  },
);

watchlistsRouter.get(
  "/:id",
  validateParams(idParamSchema),
  async (req, res) => {
    const result = await watchlistService.get(req.params.id as string);
    res.json({ data: result.watchlist, meta: result.meta });
  },
);

watchlistsRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateWatchlistSchema),
  async (req, res) => {
    const result = await watchlistService.update(req.params.id as string, req.body);
    res.json({ data: result.watchlist, meta: result.meta });
  },
);

watchlistsRouter.delete(
  "/:id",
  validateParams(idParamSchema),
  async (req, res) => {
    await watchlistService.delete(req.params.id as string);
    res.status(204).send();
  },
);

watchlistsRouter.post(
  "/:id/items",
  validateParams(idParamSchema),
  validateBody(addWatchlistItemSchema),
  async (req, res) => {
    const result = await watchlistService.addStock(req.params.id as string, req.body);
    res.status(201).json({ data: result.item, meta: result.meta });
  },
);

watchlistsRouter.delete(
  "/:id/items/:symbol",
  validateParams(watchlistScoreParamSchema),
  async (req, res) => {
    const result = await watchlistService.removeStock(
      req.params.id as string,
      req.params.symbol as string,
    );
    res.json({ data: null, meta: result.meta });
  },
);

watchlistsRouter.patch(
  "/:id/reorder",
  validateParams(idParamSchema),
  validateBody(reorderWatchlistSchema),
  async (req, res) => {
    const result = await watchlistService.reorder(req.params.id as string, req.body.symbols);
    res.json({ data: result.watchlist, meta: result.meta });
  },
);

watchlistsRouter.get(
  "/:id/scores/:symbol",
  validateParams(watchlistScoreParamSchema),
  async (req, res) => {
    const result = await watchlistService.scores(
      req.params.id as string,
      req.params.symbol as string,
    );
    res.json({ data: { quality: result.quality, entry: result.entry }, meta: result.meta });
  },
);
