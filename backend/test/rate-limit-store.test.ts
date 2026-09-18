import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Options } from "express-rate-limit";
import { RedisRateLimitStore } from "../src/config/redisStore";

/**
 * The rate-limit store's expiry.
 *
 * A counter that loses its TTL never resets, so the limiter stops being a rate
 * limit and becomes a permanent ban. That is not hypothetical: the global
 * limiter was found at 3,568 hits against a ceiling of 500 with ttl = -1, which
 * no amount of waiting would have cleared.
 *
 * The cause was setting the expiry only when the counter happened to be 1. Miss
 * that one moment — a throw, or a concurrent request that incremented first —
 * and every later call sees totalHits > 1 and never sets it again.
 *
 * The client is created here rather than taken from src/config/redis, which
 * test/setup.ts disables process-wide so counters cannot leak between suites.
 * Injecting one keeps this file from switching Redis on for every suite that
 * imports the config after it.
 */

const WINDOW_MS = 60_000;

let redis: Redis;

function makeStore(scope: string) {
  const store = new RedisRateLimitStore(scope, redis);
  store.init({ windowMs: WINDOW_MS } as Options);
  return store;
}

const SCOPE = `test-${Date.now()}`;
const KEY = "1.2.3.4";

function redisKey(scope: string, key: string) {
  return `rl:${scope}:${key}`;
}

beforeAll(async () => {
  redis = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  await expect(
    redis.connect(),
    "These tests exercise the Redis path. Start it with: docker compose up -d redis",
  ).resolves.not.toThrow();
});

afterAll(async () => {
  const keys = await redis.keys(`rl:${SCOPE}*`);
  if (keys.length) await redis.del(...keys);
  redis.disconnect();
});

describe("the Redis rate-limit store", () => {
  test("a fresh counter is given an expiry", async () => {
    const store = makeStore(SCOPE);
    const res = await store.increment(KEY);
    expect(res.totalHits).toBe(1);

    const ttl = await redis.ttl(redisKey(SCOPE, KEY));
    expect(ttl).toBeGreaterThan(0);
  });

  test("a counter that lost its expiry is repaired rather than left forever", async () => {
    const scope = `${SCOPE}-orphan`;
    const store = makeStore(scope);
    
    // Exactly the state found in production: a counter well past the limit,
    // with no expiry, which no amount of waiting would clear.
    await redis.set(redisKey(scope, KEY), "3568");
    expect(await redis.ttl(redisKey(scope, KEY))).toBe(-1);

    const res = await store.increment(KEY);
    expect(res.totalHits).toBe(3569);

    // The next request must put the window back, not inherit a permanent ban.
    expect(await redis.ttl(redisKey(scope, KEY))).toBeGreaterThan(0);
    expect(res.resetTime).toBeInstanceOf(Date);
  });

  test("an existing window is not extended by later requests", async () => {
    const scope = `${SCOPE}-sliding`;
    const store = makeStore(scope);
    
    await store.increment(KEY);
    await redis.expire(redisKey(scope, KEY), 5); // pretend the window is nearly up

    await store.increment(KEY);

    // Repairing a MISSING expiry must not become refreshing a live one: that
    // would make the window slide forward on every request and never reset.
    const ttl = await redis.ttl(redisKey(scope, KEY));
    expect(ttl).toBeLessThanOrEqual(5);
    expect(ttl).toBeGreaterThan(0);
  });

  test("counters in different scopes do not share a bucket", async () => {
    const a = makeStore(`${SCOPE}-a`);
    const b = makeStore(`${SCOPE}-b`);
    await a.increment(KEY);
    await a.increment(KEY);
    const second = await b.increment(KEY);
    // Ordinary browsing must not consume the sign-in allowance.
    expect(second.totalHits).toBe(1);
  });
});


/**
 * Round trips per increment.
 *
 * The limiter runs on EVERY request, against a Redis that in production is a
 * managed instance over the network. Each command it sends sequentially is a
 * full round trip added to every API call, so the count is part of the
 * contract. Measured with a fake client that only counts, because the real
 * one answers too fast locally for latency to show.
 */
describe("round trips per increment", () => {
  interface FakeRedis {
    roundTrips: number;
    store: Map<string, { value: number; ttl: number }>;
    incr(k: string): Promise<number>;
    ttl(k: string): Promise<number>;
    expire(k: string, s: number): Promise<number>;
    get(k: string): Promise<string | null>;
    del(k: string): Promise<number>;
    multi(): { incr(k: string): unknown; ttl(k: string): unknown; exec(): Promise<Array<[Error | null, unknown]>> };
  }

  function fakeRedis(): FakeRedis {
    const fake: FakeRedis = {
      roundTrips: 0,
      store: new Map(),
      async incr(k) {
        fake.roundTrips += 1;
        const e = fake.store.get(k) ?? { value: 0, ttl: -1 };
        e.value += 1;
        fake.store.set(k, e);
        return e.value;
      },
      async ttl(k) {
        fake.roundTrips += 1;
        return fake.store.get(k)?.ttl ?? -2;
      },
      async expire(k, s) {
        fake.roundTrips += 1;
        const e = fake.store.get(k);
        if (!e) return 0;
        e.ttl = s;
        return 1;
      },
      async get(k) {
        fake.roundTrips += 1;
        const e = fake.store.get(k);
        return e ? String(e.value) : null;
      },
      async del(k) {
        fake.roundTrips += 1;
        return fake.store.delete(k) ? 1 : 0;
      },
      multi() {
        const queued: Array<() => Promise<unknown>> = [];
        const chain = {
          incr(k: string) {
            queued.push(async () => {
              const e = fake.store.get(k) ?? { value: 0, ttl: -1 };
              e.value += 1;
              fake.store.set(k, e);
              return e.value;
            });
            return chain;
          },
          ttl(k: string) {
            queued.push(async () => fake.store.get(k)?.ttl ?? -2);
            return chain;
          },
          async exec() {
            // One pipeline is one round trip, however many commands it carries.
            fake.roundTrips += 1;
            const out: Array<[Error | null, unknown]> = [];
            for (const q of queued) out.push([null, await q()]);
            return out;
          },
        };
        return chain;
      },
    };
    return fake;
  }

  test("a fresh window costs at most two round trips, an open one costs one", async () => {
    const fake = fakeRedis();
    const store = new RedisRateLimitStore("trips", fake as unknown as Redis);
    store.init({ windowMs: 60_000 } as Options);

    const first = await store.increment("client");
    expect(first.totalHits).toBe(1);
    // Count plus setting the window's expiry: the pipeline, then the repair.
    expect(fake.roundTrips).toBeLessThanOrEqual(2);

    fake.roundTrips = 0;
    const second = await store.increment("client");
    expect(second.totalHits).toBe(2);
    expect(fake.roundTrips).toBe(1);
  });
});
