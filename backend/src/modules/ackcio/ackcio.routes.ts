import express, { Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { rateLimitStore } from "../../config/redisStore";
import { logger } from "../../utils/logger";
import { authenticateGatewayPush, type GatewayPushRequest } from "./ackcio.auth";
import { ingestAckcioPayload, sameKey } from "./ackcio.service";
import { ackcioEnvelopeSchema } from "./ackcio.types";

/**
 * `POST /ingest/ackcio/:token` and `POST /ingest/ackcio`.
 *
 * Mounted AHEAD of the global rate limiter in app.ts, with its own. The
 * global budget is 500 requests per quarter hour per address, sized for a
 * person at a browser; a gateway posting one request per sensor per sample,
 * for every node behind it, exhausts that in minutes and then every push is
 * refused — which the gateway retries, which keeps the bucket full.
 */
const router = Router();

const ingestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // A 100-sensor site sampling every minute is 1,500 pushes a quarter hour;
  // a full replay after an outage bunches many readings into one push, so the
  // ceiling only matters against a runaway client.
  max: 20_000,
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore("ingest"),
});

// An SAA chain of a hundred segments with four channels each is well under a
// megabyte; ten is room for a retry batch spanning several nodes.
const parseBody = express.json({ limit: "10mb" });

async function push(req: GatewayPushRequest, res: Response) {
  const gateway = req.gateway!;
  const parsed = ackcioEnvelopeSchema.safeParse(req.body);
  if (!parsed.success) {
    // Not a payload this API describes at all. A 400 here is right: nothing
    // is lost by refusing a body with no Type or Telemetries, and answering
    // 200 would hide a misconfigured client for ever.
    return res.status(400).json({
      status_code: 400,
      message: `Expected an Ackcio push with Type and Telemetries: ${parsed.error.issues[0]?.message ?? "invalid body"}`,
    });
  }

  // The URL says which gateway this is; the payload must agree. A token
  // configured on the wrong unit would otherwise file one site's readings
  // under another's, and the mismatch is a configuration fault someone
  // needs to see, so it is refused rather than acknowledged.
  const claimed = (parsed.data.Telemetries as Array<{ GatewayDeviceId?: unknown }>)
    .map((t) => (t && typeof t === "object" && typeof t.GatewayDeviceId === "string" ? t.GatewayDeviceId : null))
    .find((k) => k !== null && k !== "");
  if (claimed && !sameKey(claimed, gateway.gatewayKey)) {
    logger.warn(
      `Ackcio: push for GatewayDeviceId "${claimed}" arrived with the credential of "${gateway.gatewayKey}"; refused`,
    );
    return res.status(403).json({
      status_code: 403,
      message: `This credential belongs to gateway ${gateway.gatewayKey}, but the payload is from ${claimed}`,
    });
  }

  try {
    const summary = await ingestAckcioPayload(parsed.data, gateway);
    return res.status(200).json({ status_code: 200, message: "Accepted", ...summary });
  } catch (error) {
    // A genuine server fault. 500 is correct here: the gateway keeps the data
    // and retries, which is exactly what should happen when the database is
    // down for a minute.
    logger.error("Ackcio ingest failed", error as Error);
    return res.status(500).json({ status_code: 500, message: "Ingest failed; retry" });
  }
}

router.post("/ingest/ackcio/:token", ingestLimiter, parseBody, authenticateGatewayPush, push);
router.post("/ingest/ackcio", ingestLimiter, parseBody, authenticateGatewayPush, push);

export default router;
