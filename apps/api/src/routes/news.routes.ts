import { Router } from "express";
import {
  newsQuerySchema,
  type NewsQuery,
} from "@marketverse/contracts";
import {
  getValidatedQuery,
  validateQuery,
} from "../core/middleware/validate";
import { newsService } from "../modules/news/news.service";

export const newsRouter = Router();

newsRouter.get("/", validateQuery(newsQuerySchema), async (_req, res) => {
  const query = getValidatedQuery<NewsQuery>(res);
  const result = await newsService.list(query);
  res.json({ data: result.articles, meta: result.meta });
});
