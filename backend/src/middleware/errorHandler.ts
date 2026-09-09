import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    status_code: 404,
    message: "Not Found",
    error: null,
    requestId: (req as { requestId?: string }).requestId,
  });
};

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  // A malformed JSON body is the client's mistake, not the server's.
  // body-parser raises a SyntaxError carrying the status it wants; without this
  // it fell through to a 500, which tells the caller nothing and pollutes
  // error dashboards with failures that are not ours.
  const isBodyParseError =
    err instanceof SyntaxError &&
    "body" in err &&
    typeof (err as { status?: number }).status === "number";

  const statusCode = isBodyParseError
    ? ((err as { status?: number }).status ?? 400)
    : err instanceof AppError
      ? err.statusCode
      : 500;

  const message = isBodyParseError
    ? "Malformed JSON in request body"
    : err instanceof AppError
      ? err.message
      : "Internal Server Error";

  const requestId = (req as { requestId?: string }).requestId;

  if (!(err instanceof AppError) && !isBodyParseError) {
    logger.error({
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      requestId,
    });
  }

  res.status(statusCode).json({
    status_code: statusCode,
    message,
    // Echoed so a user can quote it in a bug report and it can be found in the
    // logs. Safe to expose: it is an opaque correlation id, not a secret.
    requestId,
    error:
      process.env.NODE_ENV === "production" && !(err instanceof AppError)
        ? null
        : (err as unknown as { errors: unknown }).errors ?? null,
  });
};