import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

/**
 * Assigns every request a correlation id and exposes it to handlers, logs and
 * the client.
 *
 * Without this, a report of "the export failed at about 3pm" cannot be tied to
 * a specific request in the logs, and a single failure spanning ingestion,
 * a worker and the API cannot be reconstructed at all. §55 requires request
 * ids; §97 requires them in structured logs.
 *
 * An inbound `x-request-id` is honoured so that a trace started at nginx (or by
 * a field gateway) survives into the API rather than being renamed at the door.
 * The value is length-capped and character-restricted before being echoed back:
 * it is attacker-controlled input, and it ends up in both a response header and
 * the log stream.
 */

const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]+$/;

export interface RequestWithContext extends Request {
  requestId?: string;
  startedAt?: number;
}

function sanitizeInboundId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_REQUEST_ID_LENGTH) return null;
  if (!SAFE_REQUEST_ID.test(trimmed)) return null;
  return trimmed;
}

export function requestContext(
  req: RequestWithContext,
  res: Response,
  next: NextFunction,
): void {
  const inbound = sanitizeInboundId(req.headers["x-request-id"]);
  const requestId = inbound ?? randomUUID();

  req.requestId = requestId;
  req.startedAt = Date.now();
  res.setHeader("x-request-id", requestId);

  next();
}
