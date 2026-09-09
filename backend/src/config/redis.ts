import Redis from "ioredis";
import { config } from "./index";
import { logger } from "../utils/logger";

// REDIS_URL is provided by docker-compose (redis://redis:6379). When it is
// absent — e.g. during unit tests that import `app` but never start the
// server — we don't connect at all; callers must tolerate `null`.
const redisUrl = process.env.REDIS_URL || "";

// Tests deliberately disable Redis so rate-limit counters (and caches) stay
// isolated per run instead of accumulating in a shared server.
const redisEnabled = (process.env.REDIS_ENABLED || "true") !== "false";

let redis: Redis | null = null;
let connecting = false;

/**
 * Redis client used for shared infra (rate limiting, small caches).
 * Gracefully degrades: returns null when REDIS_URL is unset or the first
 * connect attempt fails, so the API keeps serving without Redis.
 */
export function getRedis(): Redis | null {
  if (redis) return redis;
  if (!redisEnabled || !redisUrl || connecting) return null;

  connecting = true;
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // don't retry indefinitely
  });

  client.on("error", (err) => {
    logger.warn(`Redis unavailable: ${err.message}`);
  });

  client
    .connect()
    .then(() => {
      redis = client;
      logger.info("Connected to Redis");
    })
    .catch((err) => {
      logger.warn(`Redis connect failed (degrading to in-memory): ${err.message}`);
      redis = null;
    })
    .finally(() => {
      connecting = false;
    });

  return null;
}

/** True once a live Redis connection is established. */
export function redisAvailable(): boolean {
  return redis !== null;
}

/**
 * Convenience wrapper for incrementing a fixed-window counter with expiry.
 * Returns the new count, or a fallback when Redis is unavailable.
 */
export async function redisIncr(
  key: string,
  ttlSeconds: number,
): Promise<number | null> {
  const client = redis;
  if (!client) return null;
  try {
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, ttlSeconds);
    }
    return count;
  } catch {
    return null;
  }
}

export async function redisGet(key: string): Promise<string | null> {
  const client = redis;
  if (!client) return null;
  try {
    return await client.get(key);
  } catch {
    return null;
  }
}

export async function redisSet(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  const client = redis;
  if (!client) return;
  try {
    if (ttlSeconds) {
      await client.set(key, value, "EX", ttlSeconds);
    } else {
      await client.set(key, value);
    }
  } catch {
    // ignore
  }
}

export async function redisDel(...keys: string[]): Promise<void> {
  const client = redis;
  if (!client) return;
  try {
    await client.del(...keys);
  } catch {
    // ignore
  }
}

export default { getRedis, redisAvailable, redisIncr, redisGet, redisSet, redisDel };