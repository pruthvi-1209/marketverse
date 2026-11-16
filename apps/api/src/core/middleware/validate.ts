import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { ValidationError } from "../errors/app-error";

function issueDetails(error: z.ZodError): Array<{ path: string; message: string; code: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));
}

export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      next(new ValidationError("Request body validation failed", issueDetails(result.error)));
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Express 5 exposes `req.query` through a getter, so validated query data is
 * stored on `res.locals.query` and read with `getValidatedQuery`.
 */
export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      next(new ValidationError("Query parameter validation failed", issueDetails(result.error)));
      return;
    }
    res.locals.query = result.data;
    next();
  };
}

export function validateParams<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params ?? {});
    if (!result.success) {
      next(new ValidationError("Path parameter validation failed", issueDetails(result.error)));
      return;
    }
    req.params = result.data;
    next();
  };
}

export function getValidatedQuery<T>(res: Response): T {
  return res.locals.query as T;
}
