import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({ status_code: 404, message: "Not Found", error: null });
};

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err instanceof AppError ? err.message : "Internal Server Error";

  if (!(err instanceof AppError)) {
    logger.error({
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
  }

  res.status(statusCode).json({
    status_code: statusCode,
    message,
    error:
      process.env.NODE_ENV === "production" && !(err instanceof AppError)
        ? null
        : (err as unknown as { errors: unknown }).errors ?? null,
  });
};