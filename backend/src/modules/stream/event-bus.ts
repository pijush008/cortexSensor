import Redis from "ioredis";
import { EventEmitter } from "events";
import { logger } from "../../utils/logger";

/**
 * Tenant-scoped event fan-out for live streaming.
 *
 * Two layers, because a single API process is not the deployment target:
 *
 *   - An in-process EventEmitter delivers to SSE clients connected to THIS
 *     instance.
 *   - Redis pub/sub carries events between instances, so a measurement ingested
 *     on instance A reaches a dashboard held open against instance B. Without
 *     it, "live" would silently mean "live only if you happened to land on the
 *     right pod".
 *
 * Redis is optional. When it is unavailable the bus degrades to single-process
 * fan-out rather than failing — consistent with how rate limiting and caching
 * already behave here.
 */

const CHANNEL_PREFIX = "shm:events:";

export interface MeasurementEvent {
  type: "measurement";
  tenantId: number;
  sensorId: number;
  sensorName?: string | null;
  structureId: number | null;
  locationId: number | null;
  deviceId: number | null;
  ts: string;
  /** Null when the device reported a non-finite reading (§30). */
  value: number | null;
  rawValue: number | null;
  unit?: string | null;
  qualityFlags: string[];
}

export interface GatewayEvent {
  type: "gateway";
  tenantId: number;
  gatewayId: number;
  gatewayKey: string;
  status: string;
  lastSeenAt: string;
}

export type StreamEvent = MeasurementEvent | GatewayEvent;

const local = new EventEmitter();
// A busy tenant may legitimately have many dashboards open; the default limit
// of 10 would emit spurious leak warnings.
local.setMaxListeners(0);

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let redisReady = false;

function channelFor(tenantId: number): string {
  return `${CHANNEL_PREFIX}${tenantId}`;
}

/**
 * Connects the cross-instance transport. Safe to call when REDIS_URL is unset:
 * the bus then works within this process only.
 */
export function initEventBus(): void {
  const url = process.env.REDIS_URL || "";
  const enabled = (process.env.REDIS_ENABLED || "true") !== "false";
  if (!url || !enabled || publisher) return;

  const options = {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    enableOfflineQueue: false,
    retryStrategy: (times: number) => Math.min(times * 500, 10_000),
  } as const;

  publisher = new Redis(url, options);
  subscriber = new Redis(url, options);

  const onError = (which: string) => (err: Error) => {
    // Warn, never throw: losing cross-instance fan-out degrades live updates,
    // it does not justify taking the API down.
    if (redisReady) {
      logger.warn(`Event bus ${which} error: ${err.message}`);
      redisReady = false;
    }
  };
  publisher.on("error", onError("publisher"));
  subscriber.on("error", onError("subscriber"));

  Promise.all([publisher.connect(), subscriber.connect()])
    .then(async () => {
      // One pattern subscription rather than one per tenant: tenants come and
      // go, and re-subscribing per connection would leak subscriptions.
      await subscriber!.psubscribe(`${CHANNEL_PREFIX}*`);
      subscriber!.on("pmessage", (_pattern, channel, message) => {
        const tenantId = Number(channel.slice(CHANNEL_PREFIX.length));
        if (!Number.isFinite(tenantId)) return;
        try {
          local.emit(channelFor(tenantId), JSON.parse(message) as StreamEvent);
        } catch {
          // A malformed message must not kill the subscriber loop.
        }
      });
      redisReady = true;
      logger.info("Event bus connected to Redis (cross-instance fan-out active)");
    })
    .catch((err) => {
      logger.warn(
        `Event bus falling back to single-process fan-out: ${(err as Error).message}`,
      );
    });
}

/**
 * Publishes an event to a tenant's subscribers.
 *
 * Local listeners are notified directly rather than waiting for the Redis
 * round trip, so a single-instance deployment has no added latency and a Redis
 * outage does not stop this instance's own dashboards updating.
 */
export function publishEvent(event: StreamEvent): void {
  const channel = channelFor(event.tenantId);
  local.emit(channel, event);

  if (publisher && redisReady) {
    publisher.publish(channel, JSON.stringify(event)).catch(() => {
      // Already delivered locally; cross-instance delivery is best effort.
    });
  }
}

export function subscribeTenant(
  tenantId: number,
  handler: (event: StreamEvent) => void,
): () => void {
  const channel = channelFor(tenantId);
  local.on(channel, handler);
  return () => {
    local.off(channel, handler);
  };
}

export function eventBusStatus(): { redis: boolean; listeners: number } {
  return {
    redis: redisReady,
    listeners: local.eventNames().reduce(
      (total, name) => total + local.listenerCount(name),
      0,
    ),
  };
}

export async function closeEventBus(): Promise<void> {
  redisReady = false;
  await Promise.allSettled([
    subscriber?.quit(),
    publisher?.quit(),
  ]);
  subscriber = null;
  publisher = null;
  local.removeAllListeners();
}
