import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../../config/env";
import { UnauthorizedError } from "../errors/app-error";

function safeCompare(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Mutating endpoints are protected only when `API_KEY` is configured. This
 * keeps local development frictionless while allowing a shared secret before
 * any public deployment.
 */
export function apiKeyGuard(req: Request, _res: Response, next: NextFunction): void {
  if (!env.API_KEY) {
    next();
    return;
  }
  const provided = req.header("x-api-key");
  if (!provided || !safeCompare(provided, env.API_KEY)) {
    next(new UnauthorizedError());
    return;
  }
  next();
}
