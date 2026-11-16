import { Router } from "express";
import { storedResponseMeta } from "../core/http/response-meta";
import { validateParams } from "../core/middleware/validate";
import { systemService } from "../modules/system/system.service";
import { jobNameParamSchema } from "./params";

export const systemRouter = Router();

systemRouter.get("/status", async (_req, res) => {
  const result = await systemService.status();
  res.json({ data: result.status, meta: result.meta });
});

systemRouter.get("/tools", async (_req, res) => {
  const result = await systemService.tools();
  res.json({ data: result.tools, meta: result.meta });
});

systemRouter.get("/freshness", async (_req, res) => {
  const result = await systemService.freshness();
  res.json({ data: result.datasets, meta: result.meta });
});

systemRouter.get("/jobs", async (_req, res) => {
  const result = await systemService.jobs();
  res.json({ data: result.jobs, meta: result.meta });
});

systemRouter.get("/jobs/runs", async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 30) || 30));
  const result = await systemService.jobRuns(limit);
  res.json({ data: result.runs, meta: result.meta });
});

systemRouter.post(
  "/jobs/:name/run",
  validateParams(jobNameParamSchema),
  async (req, res) => {
    const result = await systemService.runJob(req.params.name as string);
    res.json({ data: result.summary, meta: result.meta });
  },
);

systemRouter.get("/labels", (_req, res) => {
  res.json({
    data: systemService.labels(),
    meta: storedResponseMeta({ provider: "marketverse" }),
  });
});
