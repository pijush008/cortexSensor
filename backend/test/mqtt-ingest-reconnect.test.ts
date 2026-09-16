import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for the reconnect storm that took the whole API down.
 *
 * A broker that refused our credentials used to make `startMqttIngest` fan out
 * instead of retry: mqtt.js reconnected on its own AND every `close` scheduled
 * another `connect()`, so each attempt left an orphaned client still emitting
 * `close` and spawning successors. Measured against a live Mosquitto that
 * answered "Not authorized": ~84 reconnects per second and 1.5 GB resident in
 * under six minutes, until the event loop starved and Express stopped answering
 * — sign-in included, which is how the bug was found.
 *
 * The invariant these tests protect is therefore about COUNTS, not connectivity:
 * one pending attempt at a time, one client at a time, no matter how many
 * `close` events arrive.
 */

class FakeClient extends EventEmitter {
  ended = false;
  endedForcibly = false;
  subscribed: string[] = [];

  end(force?: boolean) {
    this.ended = true;
    this.endedForcibly = Boolean(force);
    return this;
  }

  subscribe(topic: string, cb: (err: Error | null) => void) {
    this.subscribed.push(topic);
    cb(null);
    return this;
  }
}

const created: FakeClient[] = [];
const connectOptions: Record<string, unknown>[] = [];

vi.mock("mqtt", () => ({
  default: {
    connect: (_url: string, opts: Record<string, unknown>) => {
      connectOptions.push(opts);
      const c = new FakeClient();
      created.push(c);
      return c;
    },
  },
}));

// Imported after the mock is registered so the module binds the fake.
const loadModule = async () => {
  vi.resetModules();
  return import("../src/modules/iot/mqtt-ingest");
};

describe("MQTT ingest reconnect", () => {
  beforeEach(() => {
    created.length = 0;
    connectOptions.length = 0;
    process.env.MQTT_BROKER_URL = "mqtt://broker.invalid:1883";
    process.env.MQTT_INGEST_ENABLED = "true";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("disables mqtt.js's own retry so the backoff is the only reconnect path", async () => {
    const mod = await loadModule();
    mod.startMqttIngest();

    expect(created).toHaveLength(1);
    // The heart of the fix: with a non-zero reconnectPeriod mqtt.js retries
    // underneath us and the two loops multiply.
    expect(connectOptions[0].reconnectPeriod).toBe(0);

    mod.stopMqttIngest();
  });

  it("schedules exactly one reconnect no matter how many closes arrive", async () => {
    const mod = await loadModule();
    mod.startMqttIngest();

    const first = created[0];
    // A refused connection in the wild emits error then close, repeatedly.
    first.emit("error", new Error("Connection refused: Not authorized"));
    first.emit("close");
    first.emit("close");
    first.emit("close");

    // Still one client: the extra closes must not each spawn a connect.
    expect(created).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5000);

    // Exactly one successor, not three.
    expect(created).toHaveLength(2);

    mod.stopMqttIngest();
  });

  it("tears down the previous client before replacing it", async () => {
    const mod = await loadModule();
    mod.startMqttIngest();

    const first = created[0];
    first.emit("close");
    await vi.advanceTimersByTimeAsync(5000);

    expect(created).toHaveLength(2);
    // Orphaned clients kept their listeners and kept emitting close; that is
    // what turned a linear retry into an exponential one.
    expect(first.ended).toBe(true);
    expect(first.endedForcibly).toBe(true);
    expect(first.listenerCount("close")).toBe(0);

    mod.stopMqttIngest();
  });

  it("backs off exponentially and caps, rather than hammering the broker", async () => {
    const mod = await loadModule();
    mod.startMqttIngest();

    const delays: number[] = [];
    // Drive several failed attempts, recording the gap each one waited.
    for (let i = 0; i < 6; i++) {
      created[created.length - 1].emit("close");
      let waited = 0;
      const before = created.length;
      // Step forward until the next client appears, so the delay is observed
      // rather than assumed.
      while (created.length === before && waited < 120_000) {
        await vi.advanceTimersByTimeAsync(1000);
        waited += 1000;
      }
      delays.push(waited);
    }

    expect(delays.slice(0, 4)).toEqual([5000, 10_000, 20_000, 40_000]);
    // Capped, so a long broker outage settles into a steady one-per-minute
    // retry instead of growing without bound.
    expect(delays.every((d) => d <= 60_000)).toBe(true);

    mod.stopMqttIngest();
  });

  it("stops retrying once shut down", async () => {
    const mod = await loadModule();
    mod.startMqttIngest();

    created[0].emit("close");
    mod.stopMqttIngest();

    const countAtStop = created.length;
    await vi.advanceTimersByTimeAsync(120_000);

    expect(created).toHaveLength(countAtStop);
  });
});
