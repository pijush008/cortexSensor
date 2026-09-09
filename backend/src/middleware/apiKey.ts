import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { UnauthorizedError } from "../utils/AppError";
import { logger } from "../utils/logger";
import {
  authenticateDeviceKey,
  type AuthenticatedDevice,
} from "../modules/devices/device-credentials.service";

/**
 * Device-to-cloud ingress authentication.
 *
 * Two mechanisms, in priority order:
 *
 *   1. `x-device-key: <keyId>.<secret>` — a per-device credential. Revocable
 *      for one unit, rotatable, and it identifies WHICH device is calling, so
 *      ingest can bind a payload to a tenant instead of trusting the body.
 *
 *   2. `x-api-key: <shared>` — the legacy fleet-wide secret. Still accepted so
 *      already-deployed hardware keeps reporting, but it is deprecated: it
 *      cannot be revoked per device, and leaking it exposes every tenant's
 *      ingestion path. Each use is logged so the remaining callers can be
 *      found and migrated.
 *
 * The legacy path can be turned off entirely with ALLOW_LEGACY_INGEST_KEY=false
 * once no device depends on it.
 */

export interface DeviceAuthRequest extends Request {
  /** Set only when a per-device credential authenticated the request. */
  device?: AuthenticatedDevice;
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

let warnedLegacy = false;

export async function requireApiKey(
  req: DeviceAuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const deviceKey = req.header("x-device-key");
    if (deviceKey) {
      const device = await authenticateDeviceKey(deviceKey);
      if (!device) {
        return next(new UnauthorizedError("Missing or invalid device credential"));
      }
      req.device = device;
      return next();
    }

    if (!config.allowLegacyIngestKey) {
      return next(new UnauthorizedError("Missing or invalid device credential"));
    }

    const provided = req.header("x-api-key");
    const expected = config.iotApiKey;

    if (!provided || !expected) {
      return next(new UnauthorizedError("Missing or invalid API key"));
    }
    if (!constantTimeEquals(provided, expected)) {
      return next(new UnauthorizedError("Missing or invalid API key"));
    }

    // Warn once per process rather than per message: this fires on every
    // reading from every legacy device and would otherwise flood the log.
    if (!warnedLegacy) {
      warnedLegacy = true;
      logger.warn(
        "Ingest authenticated with the deprecated shared IOT_API_KEY. Issue per-device credentials and set ALLOW_LEGACY_INGEST_KEY=false.",
      );
    }

    return next();
  } catch (err) {
    return next(err as Error);
  }
}
