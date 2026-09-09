import { Router } from "express";
import prisma from "../../config/prisma";
import { redisAvailable } from "../../config/redis";
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
 * Redis is reported but is NOT part of the readiness verdict: the API degrades
 * gracefully without it (rate limiting falls back to an in-memory store), so a
 * Redis outage must not take the whole API out of rotation.
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

router.get("/ready", async (_req, res) => {
  const checks: Record<string, "ok" | "unavailable"> = {
    database: "unavailable",
    redis: redisAvailable() ? "ok" : "unavailable",
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (err) {
    logger.error("Readiness probe: database unreachable", err as Error);
  }

  // Only the database gates readiness; see the note above on Redis.
  const ready = checks.database === "ok";

  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    service: "shm-api",
    checks,
  });
});

export default router;
