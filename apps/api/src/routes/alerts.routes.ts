import { Router } from "express";
import { createAlertSchema, updateAlertSchema } from "@marketverse/contracts";
import { storedResponseMeta } from "../core/http/response-meta";
import { validateBody, validateParams } from "../core/middleware/validate";
import { alertsService } from "../modules/alerts/alerts.service";
import { idParamSchema } from "./params";

export const alertsRouter = Router();

alertsRouter.get("/", async (_req, res) => {
  const result = await alertsService.list();
  res.json({ data: result.alerts, meta: result.meta });
});

alertsRouter.post(
  "/",
  validateBody(createAlertSchema),
  async (req, res) => {
    const result = await alertsService.create(req.body);
    res.status(201).json({ data: result.alert, meta: result.meta });
  },
);

// Literal path declared before `/:id`.
alertsRouter.get("/events/recent", async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100) || 100));
  const result = await alertsService.recentEvents(limit);
  res.json({ data: result.events, meta: result.meta });
});

// Manual evaluation endpoint; the scheduler runs the same code path.
alertsRouter.post("/evaluate", async (_req, res) => {
  const summary = await alertsService.evaluateAll();
  res.json({ data: summary, meta: storedResponseMeta({ provider: "marketverse" }) });
});

alertsRouter.get(
  "/:id",
  validateParams(idParamSchema),
  async (req, res) => {
    const result = await alertsService.get(req.params.id as string);
    res.json({ data: result.alert, meta: result.meta });
  },
);

alertsRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateAlertSchema),
  async (req, res) => {
    const result = await alertsService.update(req.params.id as string, req.body);
    res.json({ data: result.alert, meta: result.meta });
  },
);

alertsRouter.delete(
  "/:id",
  validateParams(idParamSchema),
  async (req, res) => {
    await alertsService.delete(req.params.id as string);
    res.status(204).send();
  },
);

alertsRouter.get(
  "/:id/events",
  validateParams(idParamSchema),
  async (req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
    const result = await alertsService.events(req.params.id as string, limit);
    res.json({ data: result.events, meta: result.meta });
  },
);
