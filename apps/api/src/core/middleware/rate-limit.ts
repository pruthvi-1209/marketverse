import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { env } from "../../config/env";

export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // Tests and local tooling should not be throttled.
  skip: () => env.isTest,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please retry later.",
        requestId: req.requestId ?? null,
      },
    });
  },
});
