import { Router } from "express";
import prisma from "../../config/prisma";
import { redisHealthy } from "../../config/redis";
import { mqttIngestStatus } from "../iot/mqtt-ingest";
import { config } from "../../config";
import { logger } from "../../utils/logger";

/**
 * Liveness and readiness probes.
 *
 * These are split deliberately, because they answer different questions and a
 * load balancer acts on them differently:
 *
 *   /health  — "is this process alive?" Never touches a dependency. If this
 *              fails the container should be restarted.
 *   /ready   — "can this process serve traffic?" Checks the database. If this
 *              fails the instance should be pulled from rotation but NOT
 *              restarted, because restarting an API whose database is down
 *              accomplishes nothing except losing warm state.
 *
 * Redis and MQTT are reported but are NOT part of the readiness verdict: the
 * API degrades gracefully without either (rate limiting falls back to an
 * in-memory store; ingest resumes when the broker returns), so an outage in
 * one must not take the whole API out of rotation.
 *
 * Nginx was observed crash-looping during the architecture audit with no probe
 * available to explain which upstream was unhealthy. That is what these fix.
 */

const router = Router();

const startedAt = Date.now();

router.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "shm-api",
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  });
});

/** Host:port of a connection URL, with any credentials removed. */
function endpointOf(url: string): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.port ? `${u.hostname}:${u.port}` : u.hostname;
  } catch {
    return undefined;
  }
}

router.get("/ready", async (_req, res) => {
  const mqtt = mqttIngestStatus();

  const checks: Record<string, "ok" | "unavailable" | "disabled"> = {
    database: "unavailable",
    redis: "unavailable",
    mqtt: !mqtt.enabled ? "disabled" : mqtt.connected ? "ok" : "unavailable",
  };

  // Both verified, not inferred: a real SELECT 1 and a real PING, run together
  // so the probe costs one round trip rather than two.
  const [dbOk, redisOk] = await Promise.all([
    prisma
      .$queryRaw`SELECT 1`
      .then(() => true)
      .catch((err: unknown) => {
        logger.error("Readiness probe: database unreachable", err as Error);
        return false;
      }),
    redisHealthy(),
  ]);
  checks.database = dbOk ? "ok" : "unavailable";
  checks.redis = redisOk ? "ok" : "unavailable";

  // Only the database gates readiness; see the note above on Redis and MQTT.
  const ready = checks.database === "ok";

  // WHICH database and which broker, so a developer can see at a glance that
  // they are pointed at Supabase rather than the local container. Hostnames
  // only, never credentials — and withheld entirely in production, where this
  // endpoint may be publicly reachable and the answer is nobody's business.
  const detail =
    config.nodeEnv === "production"
      ? undefined
      : {
          database: endpointOf(process.env.DATABASE_URL || ""),
          redis: endpointOf(process.env.REDIS_URL || ""),
          mqtt: endpointOf(mqtt.broker),
        };

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    service: "shm-api",
    checks,
    ...(detail ? { detail } : {}),
  });
});

export default router;
