import Redis from "ioredis";
import { logger } from "../utils/logger";

// REDIS_URL is provided by docker-compose (redis://redis:6379). When it is
// absent — e.g. during unit tests that import `app` but never start the
// server — we don't connect at all; callers must tolerate `null`.
//
// READ LAZILY, not at module load. This file used to capture the value in a
// top-level `const`, and it was always "". The only reason `dotenv.config()`
// would have run first is the `import { config } from "./index"` that sat at
// the top — but nothing in this module ever USED `config`, so TypeScript
// elided the import as dead, and with it the one thing that loaded .env on
// this path. The result was silent and total: getRedis() returned null
// forever, rate limiting fell back to its in-memory store, and no error was
// logged because nothing had failed — the URL was simply never seen.
//
// event-bus.ts and analysis.queue.ts read process.env inside their functions
// and so were never affected, which is why the queue and the pub/sub bus
// connected happily while this client did not.
function redisUrl(): string {
  return process.env.REDIS_URL || "";
}

// Tests deliberately disable Redis so rate-limit counters (and caches) stay
// isolated per run instead of accumulating in a shared server.
function redisEnabled(): boolean {
  return (process.env.REDIS_ENABLED || "true") !== "false";
}

let redis: Redis | null = null;
let connecting = false;

/**
 * Redis client used for shared infra (rate limiting, small caches).
 * Gracefully degrades: returns null when REDIS_URL is unset or the first
 * connect attempt fails, so the API keeps serving without Redis.
 */
export function getRedis(): Redis | null {
  if (redis) return redis;
  const url = redisUrl();
  if (!redisEnabled() || !url || connecting) return null;

  connecting = true;
  const client = new Redis(url, {
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
 * Actively verifies Redis, rather than reporting whether anything has happened
 * to use it yet.
 *
 * `redisAvailable()` answers "has the shared client connected", and that client
 * connects lazily on the first rate-limited request. A readiness probe run
 * before any such request therefore reported Redis as unavailable while the
 * analysis worker and the event bus — which hold their own connections — were
 * demonstrably talking to it. The probe was describing its own laziness.
 *
 * So: ask for the client (which starts the connect if it has not begun), give
 * it a moment to finish, then PING. Same shape as the database check, which has
 * always issued a real SELECT 1 rather than trusting a flag.
 */
export async function redisHealthy(timeoutMs = 2000): Promise<boolean> {
  if (!redisEnabled() || !redisUrl()) return false;

  const deadline = Date.now() + timeoutMs;
  let client = getRedis();
  while (!client && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    client = getRedis();
  }
  if (!client) return false;

  try {
    return (await client.ping()) === "PONG";
  } catch {
    return false;
  }
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