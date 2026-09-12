import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { config } from "../src/config";
import {
  closeEngineClient,
  compareOverGrpc,
  healthOverGrpc,
  spectrumOverGrpc,
} from "../src/modules/analysis/engine.grpc";

/**
 * The two transports must agree exactly.
 *
 * The engine speaks JSON over HTTP and protobuf over gRPC, and the API tier
 * picks one with SHM_ENGINE_TRANSPORT. Both faces call the same mathematics,
 * so any disagreement is a fault in the wire mapping — and a wire mapping that
 * quietly rounds a frequency or turns an unknown damping ratio into zero would
 * change engineering results without changing a single number in the maths.
 *
 * That last case is the one worth naming: proto3 scalars have no null, so an
 * unresolved damping ratio must be an ABSENT optional field. If it arrived as
 * 0.0 the reader would see "no damping" where the engine meant "could not
 * measure it".
 */

const HTTP = config.shmEngineUrl;

interface Peak {
  frequency_hz: number;
  magnitude: number;
  prominence: number;
  bandwidth_hz?: number | null;
  damping_ratio?: number | null;
  resolution_hz: number;
}

interface Spectrum {
  engine_version: string;
  method: string;
  sample_rate_hz: number;
  segment_length: number;
  frequency_resolution_hz: number;
  sample_count: number;
  frequencies_hz: number[];
  psd: number[];
  peaks: Peak[];
  limitations: string[];
}

function sine(n: number, fs = 100): number[] {
  return Array.from(
    { length: n },
    (_, i) => Math.sin(2 * Math.PI * 3 * (i / fs)) + 0.3 * Math.sin(2 * Math.PI * 11 * (i / fs)),
  );
}

async function overHttp(path: string, body: unknown): Promise<Spectrum> {
  const res = await fetch(`${HTTP}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`engine HTTP ${res.status}`);
  return (await res.json()) as Spectrum;
}

let engineUp = false;

beforeAll(async () => {
  try {
    const health = await healthOverGrpc();
    engineUp = health.status === "ok";
  } catch {
    engineUp = false;
  }
});

afterAll(() => closeEngineClient());

describe("the engine's two transports", () => {
  test("gRPC is reachable", () => {
    expect(
      engineUp,
      `SHM engine gRPC unreachable at ${config.shmEngineGrpcUrl}. ` +
        `Start it with: docker compose up -d python-shm`,
    ).toBe(true);
  });

  test("a spectrum is identical over gRPC and over HTTP", async () => {
    expect(engineUp).toBe(true);
    const samples = sine(2048);
    const body = { samples, sample_rate_hz: 100.0 };

    const [http, rpc] = await Promise.all([
      overHttp("/spectrum", body),
      spectrumOverGrpc<Spectrum>(body),
    ]);

    expect(rpc.engine_version).toBe(http.engine_version);
    expect(rpc.method).toBe(http.method);
    expect(rpc.sample_count).toBe(http.sample_count);
    expect(rpc.segment_length).toBe(http.segment_length);
    expect(rpc.frequency_resolution_hz).toBeCloseTo(http.frequency_resolution_hz, 12);

    // The arrays are the payload the whole change exists for; a length match
    // alone would pass while every value was wrong.
    expect(rpc.frequencies_hz).toHaveLength(http.frequencies_hz.length);
    expect(rpc.psd).toHaveLength(http.psd.length);
    for (let i = 0; i < http.psd.length; i += 1) {
      expect(rpc.psd[i]).toBeCloseTo(http.psd[i], 12);
      expect(rpc.frequencies_hz[i]).toBeCloseTo(http.frequencies_hz[i], 12);
    }

    expect(rpc.peaks).toHaveLength(http.peaks.length);
    http.peaks.forEach((peak, i) => {
      expect(rpc.peaks[i].frequency_hz).toBeCloseTo(peak.frequency_hz, 12);
      expect(rpc.peaks[i].magnitude).toBeCloseTo(peak.magnitude, 12);
      expect(rpc.peaks[i].resolution_hz).toBeCloseTo(peak.resolution_hz, 12);
    });

    // Carried with the result rather than documented elsewhere, so a stored
    // run always states its own limits — over either wire.
    expect(rpc.limitations).toEqual(http.limitations);
  });

  test("an unmeasurable damping ratio stays unknown rather than becoming zero", async () => {
    expect(engineUp).toBe(true);
    const rpc = await spectrumOverGrpc<Spectrum>({
      samples: sine(2048),
      sample_rate_hz: 100.0,
    });
    const http = await overHttp("/spectrum", {
      samples: sine(2048),
      sample_rate_hz: 100.0,
    });

    http.peaks.forEach((peak, i) => {
      const overWire = rpc.peaks[i].damping_ratio;
      if (peak.damping_ratio === null) {
        // Absent, not 0.0 — "could not measure" is not "no damping".
        expect(overWire == null).toBe(true);
      } else {
        expect(overWire).toBeCloseTo(peak.damping_ratio, 12);
      }
    });
  });

  test("data the method cannot be applied to is refused, not guessed", async () => {
    expect(engineUp).toBe(true);
    // Fewer than the 16 samples the engine requires.
    await expect(
      spectrumOverGrpc({ samples: [1, 2, 3], sample_rate_hz: 100.0 }),
    ).rejects.toThrow(/engine rejected/i);
  });

  test("a baseline comparison agrees across transports", async () => {
    expect(engineUp).toBe(true);
    const body = { samples: sine(2048), sample_rate_hz: 100.0 };
    const http = await overHttp("/spectrum", body);
    const rpc = await spectrumOverGrpc<Spectrum>(body);

    const [cHttp, cRpc] = await Promise.all([
      (async () => {
        const res = await fetch(`${HTTP}/baseline/compare`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_peaks: http.peaks, baseline_peaks: http.peaks }),
        });
        return (await res.json()) as { matched: unknown[]; interpretation: string };
      })(),
      compareOverGrpc<{ matched: unknown[]; interpretation: string }>({
        current_peaks: rpc.peaks,
        baseline_peaks: rpc.peaks,
      }),
    ]);

    expect(cRpc.matched).toHaveLength(cHttp.matched.length);
    // Shipped with every comparison on purpose: the numbers must never arrive
    // without the caveat that a shift is reported, not diagnosed.
    expect(cRpc.interpretation).toBe(cHttp.interpretation);
  });

  test("a false boolean survives the wire instead of vanishing", async () => {
    expect(engineUp).toBe(true);
    const body = { samples: sine(2048), sample_rate_hz: 100.0 };
    const spectrum = await spectrumOverGrpc<Spectrum>(body);

    const comparison = await compareOverGrpc<{
      matched: { exceeds_resolution: boolean; shift_hz: number }[];
    }>({ current_peaks: spectrum.peaks, baseline_peaks: spectrum.peaks });

    expect(comparison.matched.length).toBeGreaterThan(0);
    for (const match of comparison.matched) {
      // proto3 omits a false bool from the wire entirely. Without the client
      // restoring it, this arrived as undefined — which is falsy, so code kept
      // working, but the field disappeared from every persisted analysis run.
      expect(match.exceeds_resolution).toBe(false);
      expect(typeof match.exceeds_resolution).toBe("boolean");
    }
  });

  test("an absent optional is null, as the JSON face returned it", async () => {
    expect(engineUp).toBe(true);
    const spectrum = await spectrumOverGrpc<Spectrum>({
      samples: sine(2048),
      sample_rate_hz: 100.0,
    });
    for (const peak of spectrum.peaks) {
      // null, not undefined: undefined is dropped by JSON.stringify, so a
      // stored run would silently lose the key rather than record "unknown".
      expect(peak.damping_ratio === null || typeof peak.damping_ratio === "number").toBe(true);
      expect(peak.damping_ratio).not.toBeUndefined();
    }
  });
});
