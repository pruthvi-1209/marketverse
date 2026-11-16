import type { ApiErrorCode } from "@marketverse/contracts";

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(
    message: string,
    options: {
      code?: ApiErrorCode;
      statusCode?: number;
      details?: unknown;
      cause?: unknown;
      expose?: boolean;
    } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details;
    this.expose = options.expose ?? this.statusCode < 500;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Request validation failed", details?: unknown) {
    super(message, { code: "VALIDATION_ERROR", statusCode: 400, details });
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: "BAD_REQUEST", statusCode: 400, details });
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    super(identifier ? `${resource} '${identifier}' was not found` : `${resource} was not found`, {
      code: "NOT_FOUND",
      statusCode: 404,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: "CONFLICT", statusCode: 409, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Missing or invalid API key") {
    super(message, { code: "UNAUTHORIZED", statusCode: 401 });
  }
}

export class ProviderUnavailableError extends AppError {
  constructor(provider: string, message: string, details?: unknown) {
    super(`${provider} is unavailable: ${message}`, {
      code: "PROVIDER_UNAVAILABLE",
      statusCode: 503,
      details,
    });
  }
}

export class ProviderTimeoutError extends AppError {
  constructor(provider: string, timeoutMs: number) {
    super(`${provider} did not respond within ${timeoutMs}ms`, {
      code: "PROVIDER_TIMEOUT",
      statusCode: 504,
    });
  }
}

export class DataUnavailableError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, { code: "DATA_UNAVAILABLE", statusCode: 409, details });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
