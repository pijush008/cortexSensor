export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors?: unknown;

  constructor(statusCode: number, message: string, errors?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad Request", errors?: unknown) {
    super(400, message, errors);
  }
}

/**
 * Distinct from a plain 401 so the client can tell "wrong credentials" from
 * "credentials fine, now supply your second factor" and prompt accordingly.
 */
export class MfaRequiredError extends AppError {
  constructor(message = "Multi-factor authentication required") {
    super(401, message);
  }
}

export class PaymentRequiredError extends AppError {
  constructor(message = "Plan limit reached") {
    super(402, message);
  }
}