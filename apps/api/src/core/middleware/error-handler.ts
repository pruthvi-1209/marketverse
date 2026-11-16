import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import type { ApiErrorCode } from "@marketverse/contracts";
import { AppError, isAppError } from "../errors/app-error";
import { logger } from "../logger/logger";

interface PgErrorShape {
  code?: string;
  constraint?: string;
  detail?: string;
}

function mapPostgresError(error: PgErrorShape): AppError | null {
  switch (error.code) {
    case "23505":
      return new AppError("A record with the same unique value already exists", {
        code: "CONFLICT",
        statusCode: 409,
        details: error.constraint ? { constraint: error.constraint } : undefined,
      });
    case "23503":
      return new AppError("The referenced record does not exist or is still in use", {
        code: "CONFLICT",
        statusCode: 409,
      });
    case "22P02":
    case "22007":
      return new AppError("One of the provided values has an invalid format", {
        code: "BAD_REQUEST",
        statusCode: 400,
      });
    case "23502":
      return new AppError("A required value is missing", {
        code: "BAD_REQUEST",
        statusCode: 400,
        details: error.detail,
      });
    case "ECONNREFUSED":
    case "57P01":
    case "08006":
      return new AppError("Database is currently unavailable", {
        code: "INTERNAL_ERROR",
        statusCode: 503,
      });
    default:
      return null;
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.path} was not found`,
      requestId: req.requestId ?? null,
    },
  });
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  let appError: AppError;

  if (isAppError(error)) {
    appError = error;
  } else if (error instanceof ZodError) {
    appError = new AppError("Validation failed", {
      code: "VALIDATION_ERROR",
      statusCode: 400,
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  } else if (error instanceof SyntaxError && "body" in (error as object)) {
    appError = new AppError("Malformed JSON request body", {
      code: "BAD_REQUEST",
      statusCode: 400,
    });
  } else if (typeof error === "object" && error !== null) {
    const mapped = mapPostgresError(error as PgErrorShape);
    appError =
      mapped ??
      new AppError("An unexpected error occurred", {
        code: "INTERNAL_ERROR",
        statusCode: 500,
        cause: error,
      });
  } else {
    appError = new AppError("An unexpected error occurred", {
      code: "INTERNAL_ERROR",
      statusCode: 500,
      cause: error,
    });
  }

  const logPayload = {
    err: error,
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    statusCode: appError.statusCode,
    code: appError.code,
  };

  if (appError.statusCode >= 500) {
    logger.error(logPayload, appError.message);
  } else {
    logger.warn(logPayload, appError.message);
  }

  const message =
    appError.statusCode >= 500 && !appError.expose
      ? "An unexpected error occurred"
      : appError.message;

  res.status(appError.statusCode).json({
    error: {
      code: appError.code as ApiErrorCode,
      message,
      ...(appError.details !== undefined ? { details: appError.details } : {}),
      requestId: req.requestId ?? null,
    },
  });
}
