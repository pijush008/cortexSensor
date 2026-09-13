import { MemoryStore, type Options, type Store } from "express-rate-limit";
import { getRedis } from "./redis";
import type Redis from "ioredis";

type RedisClient = Redis;
import { logger } from "../utils/logger";

const WINDOW_PREFIX = "rl:";

/**
 * A rate-limit store backed by Redis, with automatic fallback to the built-in
 * MemoryStore when Redis is unavailable. Pass this where the code currently
 * relies on the default (per-process) limiter so hits are shared across
 * instances once Redis is reachable.
 */
export class RedisRateLimitStore implements Store {
  private fallback: MemoryStore;
  private options: Options | null = null;
  private readonly scope: string;
  private readonly injected: RedisClient | null;

  /**
   * @param scope Namespace for this limiter's counters.
   *
   * Required, not optional. Every limiter previously keyed on the client
   * address alone, so the global limiter, the login limiter and the OTP limiter
   * all incremented ONE counter per client. Two consequences, both observed:
   * a single login request counted twice, and ordinary browsing consumed the
   * login budget — roughly two page loads of API calls were enough to exhaust
   * the 20-attempt sign-in allowance and lock the user out of their own account.
   */
  /**
   * @param client Optional Redis client, used instead of the shared one.
   *
   * Exists for tests. test/setup.ts disables Redis process-wide so counters
   * cannot leak between suites, and the suites share ONE process — so a test
   * that re-enables it via the environment would switch Redis on for whichever
   * files import the config afterwards. Injecting a client keeps that test
   * hermetic without touching the flag.
   */
  constructor(scope: string, client?: RedisClient) {
    this.scope = scope;
    this.injected = client ?? null;
    this.fallback = new MemoryStore();
  }

  private client(): RedisClient | null {
    return this.injected ?? getRedis();
  }

  init(options: Options): void {
    this.options = options;
    this.fallback.init(options);
  }

  private redisKey(key: string): string {
    return `${WINDOW_PREFIX}${this.scope}:${key}`;
  }

  async get(key: string) {
    const redis = this.client();
    if (!redis) return this.fallback.get(key);

    try {
      const rkey = this.redisKey(key);
      const ttl = await redis.ttl(rkey);
      if (ttl <= 0) return { totalHits: 0, resetTime: undefined };
      const totalHits = Number((await redis.get(rkey)) || 0);
      const resetTime = new Date(Date.now() + ttl * 1000);
      return { totalHits, resetTime };
    } catch (err) {
      logger.warn(`Redis rate-limit get failed, using memory: ${(err as Error).message}`);
      return this.fallback.get(key);
    }
  }

  async increment(key: string) {
    const redis = this.client();
    if (!redis) return this.fallback.increment(key);

    try {
      const windowSecs = Math.max(
        1,
        Math.floor((this.options?.windowMs ?? 60_000) / 1000),
      );
      const rkey = this.redisKey(key);
      const totalHits = await redis.incr(rkey);

      // The expiry is set whenever the key HAS none, not only when the counter
      // happens to be 1.
      //
      // Setting it on totalHits === 1 alone leaves exactly one moment in which
      // the window can be lost: a throw between the incr and the expire, or a
      // concurrent request that incremented first. After that the counter is
      // permanent — every later call sees totalHits > 1 and never sets an
      // expiry again — so the limiter silently stops being a rate limit and
      // becomes a ban. The global limiter was found at 3,568 hits against a
      // ceiling of 500 with ttl = -1, which no amount of waiting would clear.
      //
      // `ttl` distinguishes the two cases that matter: -1 means the key exists
      // with no expiry (repair it), -2 means it expired between the incr and
      // this read (the next request starts a fresh window). A POSITIVE ttl is
      // left alone: refreshing a live window on every request would slide it
      // forward indefinitely and it would never reset.
      let ttl = await redis.ttl(rkey);
      if (ttl < 0) {
        await redis.expire(rkey, windowSecs);
        ttl = windowSecs;
      }

      const resetTime = new Date(Date.now() + ttl * 1000);
      return { totalHits, resetTime };
    } catch (err) {
      logger.warn(`Redis rate-limit increment failed, using memory: ${(err as Error).message}`);
      return this.fallback.increment(key);
    }
  }

  async decrement(key: string) {
    const redis = this.client();
    if (!redis) {
      this.fallback.decrement(key);
      return;
    }
    try {
      const current = Number((await redis.get(this.redisKey(key))) || 0);
      if (current > 0) {
        await redis.decr(this.redisKey(key));
      }
    } catch {
      this.fallback.decrement(key);
    }
  }

  async resetKey(key: string) {
    const redis = this.client();
    this.fallback.resetKey(key);
    if (!redis) return;
    try {
      await redis.del(this.redisKey(key));
    } catch {
      // ignore
    }
  }

  async shutdown() {
    this.fallback.shutdown?.();
  }
}

export function rateLimitStore(scope: string): Store {
  return new RedisRateLimitStore(scope);
}