import { Router } from "express";
import { storedResponseMeta } from "../core/http/response-meta";
import { validateParams } from "../core/middleware/validate";
import { aiInfrastructureService } from "../modules/ai-infrastructure/ai-infrastructure.service";
import { symbolParamSchema } from "./params";

export const aiInfrastructureRouter = Router();

aiInfrastructureRouter.get("/", async (_req, res) => {
  const result = await aiInfrastructureService.overview();
  res.json({ data: result.overview, meta: result.meta });
});

aiInfrastructureRouter.post("/sync", async (_req, res) => {
  const result = await aiInfrastructureService.syncConfiguredCompanies();
  res.json({ data: result, meta: storedResponseMeta({ provider: "marketverse" }) });
});

aiInfrastructureRouter.get(
  "/:symbol",
  validateParams(symbolParamSchema),
  async (req, res) => {
    const result = await aiInfrastructureService.company(req.params.symbol as string);
    res.json({ data: result.company, meta: result.meta });
  },
);
