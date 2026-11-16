import { Router } from "express";
import { aiInfrastructureRouter } from "./ai-infrastructure.routes";
import { alertsRouter } from "./alerts.routes";
import { healthRouter } from "./health.routes";
import { marketRouter } from "./market.routes";
import { newsRouter } from "./news.routes";
import { portfoliosRouter } from "./portfolios.routes";
import { stocksRouter } from "./stocks.routes";
import { systemRouter } from "./system.routes";
import { watchlistsRouter } from "./watchlists.routes";

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use("/stocks", stocksRouter);
apiRouter.use("/market", marketRouter);
apiRouter.use("/watchlists", watchlistsRouter);
apiRouter.use("/portfolios", portfoliosRouter);
apiRouter.use("/alerts", alertsRouter);
apiRouter.use("/news", newsRouter);
apiRouter.use("/ai-infrastructure", aiInfrastructureRouter);
apiRouter.use("/system", systemRouter);
