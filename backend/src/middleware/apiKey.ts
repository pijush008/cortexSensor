import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { UnauthorizedError } from "../utils/AppError";

/**
 * Device-to-cloud ingress authentication via a shared API key in header.
 * Devices present `x-api-key: <key>`; the server compares against
 * IOT_API_KEY using a constant-time comparison.
 */
export function requireApiKey(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.header("x-api-key");
  const expected = config.iotApiKey;

  if (!provided || !expected) {
    return next(new UnauthorizedError("Missing or invalid API key"));
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(new UnauthorizedError("Missing or invalid API key"));
  }

  next();
}