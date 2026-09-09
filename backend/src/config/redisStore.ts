import { MemoryStore, type Options, type Store } from "express-rate-limit";
import { getRedis } from "./redis";
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
  constructor(scope: string) {
    this.scope = scope;
    this.fallback = new MemoryStore();
  }

  init(options: Options): void {
    this.options = options;
    this.fallback.init(options);
  }

  private redisKey(key: string): string {
    return `${WINDOW_PREFIX}${this.scope}:${key}`;
  }

  async get(key: string) {
    const redis = getRedis();
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
    const redis = getRedis();
    if (!redis) return this.fallback.increment(key);

    try {
      const windowSecs = Math.max(
        1,
        Math.floor((this.options?.windowMs ?? 60_000) / 1000),
      );
      const rkey = this.redisKey(key);
      const totalHits = await redis.incr(rkey);
      if (totalHits === 1) {
        await redis.expire(rkey, windowSecs);
      }
      const ttl = await redis.ttl(rkey);
      const resetTime =
        ttl > 0 ? new Date(Date.now() + ttl * 1000) : undefined;
      return { totalHits, resetTime };
    } catch (err) {
      logger.warn(`Redis rate-limit increment failed, using memory: ${(err as Error).message}`);
      return this.fallback.increment(key);
    }
  }

  async decrement(key: string) {
    const redis = getRedis();
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
    const redis = getRedis();
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