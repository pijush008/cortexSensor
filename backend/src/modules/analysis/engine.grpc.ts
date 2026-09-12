import path from "path";
import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { config } from "../../config";
import { BadRequestError } from "../../utils/AppError";

/**
 * The gRPC client for the spectral engine.
 *
 * Why this exists: the request is a raw array of doubles, and JSON measured
 * slower than the mathematics it carries. For a 60,000-sample window,
 * JSON.stringify here plus json.loads there cost about 62 ms against 22 ms of
 * actual spectral estimation, and the payload was 2.4x larger. Packed doubles
 * are a memcpy at both ends.
 *
 * The .proto is loaded at runtime rather than compiled to TypeScript ahead of
 * time. Both services mount the SAME file read-only, so there is one contract
 * and no generated copy that can drift from it — and the shapes are asserted
 * by a contract test rather than trusted.
 */

const PROTO_PATH =
  process.env.SHM_ENGINE_PROTO_PATH ?? "/proto/shm/engine/v1/engine.proto";

/** Matches the server's ceiling. Long windows are the whole point. */
const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;

/**
 * proto-loader builds the client dynamically, so its methods have no static
 * types. This is the shape they actually have: request, call options, callback.
 */
type UnaryCall = (
  request: unknown,
  options: grpc.CallOptions,
  callback: (err: grpc.ServiceError | null, response: unknown) => void,
) => grpc.ClientUnaryCall;

interface EngineClient extends grpc.Client {
  Health: UnaryCall;
  Spectrum: UnaryCall;
  CompareToBaseline: UnaryCall;
}

let client: EngineClient | null = null;

/**
 * One client for the process.
 *
 * gRPC multiplexes concurrent calls over a single HTTP/2 connection, so a
 * client per request would throw away the connection reuse that is half the
 * reason this is faster than HTTP/1.1 + JSON.
 */
function getClient(): EngineClient {
  if (client) return client;

  const definition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true, // the engine speaks snake_case; leave its names alone
    longs: Number,
    enums: String,
    defaults: false, // so an absent optional stays absent rather than becoming 0
    oneofs: true,
    arrays: true,
  });

  const proto = grpc.loadPackageDefinition(definition) as unknown as {
    shm: { engine: { v1: { Engine: new (...args: unknown[]) => EngineClient } } };
  };

  client = new proto.shm.engine.v1.Engine(
    config.shmEngineGrpcUrl,
    grpc.credentials.createInsecure(),
    {
      "grpc.max_receive_message_length": MAX_MESSAGE_BYTES,
      "grpc.max_send_message_length": MAX_MESSAGE_BYTES,
    },
  );

  return client;
}

/** Promisified unary call with the same deadline the HTTP client used. */
function call<T>(method: "Health" | "Spectrum" | "CompareToBaseline", request: unknown): Promise<T> {
  const deadline = new Date(Date.now() + config.shmEngineTimeoutMs);

  return new Promise<T>((resolve, reject) => {
    getClient()[method](request, { deadline }, (err: grpc.ServiceError | null, response: unknown) => {
      if (!err) return resolve(response as T);

      // INVALID_ARGUMENT is the engine saying the data cannot bear the method —
      // the caller's mistake, not a fault. Mapped to the same BadRequestError
      // the HTTP path raised on a 400, so callers above see no difference.
      if (err.code === grpc.status.INVALID_ARGUMENT) {
        return reject(new BadRequestError(`Analysis engine rejected the request: ${err.details}`));
      }
      reject(new Error(`Analysis engine call failed (${grpc.status[err.code]}): ${err.details}`));
    });
  });
}

/** Window and detrend travel as enums; the engine's own names map 1:1. */
const WINDOW_ENUM: Record<string, string> = {
  hann: "WINDOW_HANN",
  hamming: "WINDOW_HAMMING",
  blackman: "WINDOW_BLACKMAN",
  boxcar: "WINDOW_BOXCAR",
  flattop: "WINDOW_FLATTOP",
};

const DETREND_ENUM: Record<string, string> = {
  constant: "DETREND_CONSTANT",
  linear: "DETREND_LINEAR",
  none: "DETREND_NONE",
};

/**
 * proto3 has no way to distinguish "false" from "unset" for a plain bool, nor
 * "0" from "unset" for a number: both are omitted from the wire. proto-loader
 * is configured with defaults:false so that a genuinely OPTIONAL field (an
 * unresolved damping ratio) stays absent rather than arriving as 0 — but that
 * same setting drops legitimate false and 0 values from non-optional fields.
 *
 * So the shape is restored here, to exactly what the JSON face returned:
 *
 *   - non-optional scalars get their proto3 default (0, "", false)
 *   - optional scalars that are genuinely absent become null, which is what
 *     the HTTP path sent and what every consumer and stored run already expects
 *
 * Without this, `exceeds_resolution: false` arrived as undefined and vanished
 * from the persisted analysis result altogether.
 */
function num(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Absent optional -> null, matching the JSON the HTTP face returned. */
function optionalNum(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

interface WirePeak {
  frequency_hz?: number;
  magnitude?: number;
  prominence?: number;
  bandwidth_hz?: number;
  damping_ratio?: number;
  resolution_hz?: number;
}

function normalisePeak(peak: WirePeak) {
  return {
    frequency_hz: num(peak.frequency_hz),
    magnitude: num(peak.magnitude),
    prominence: num(peak.prominence),
    bandwidth_hz: optionalNum(peak.bandwidth_hz),
    damping_ratio: optionalNum(peak.damping_ratio),
    resolution_hz: num(peak.resolution_hz),
  };
}

function normaliseSpectrum(raw: Record<string, unknown>) {
  return {
    engine_version: str(raw.engine_version),
    method: str(raw.method),
    sample_rate_hz: num(raw.sample_rate_hz),
    window: str(raw.window),
    detrend: str(raw.detrend),
    segment_length: num(raw.segment_length),
    overlap: num(raw.overlap),
    frequency_resolution_hz: num(raw.frequency_resolution_hz),
    sample_count: num(raw.sample_count),
    duration_seconds: num(raw.duration_seconds),
    frequencies_hz: (raw.frequencies_hz as number[]) ?? [],
    psd: (raw.psd as number[]) ?? [],
    peaks: ((raw.peaks as WirePeak[]) ?? []).map(normalisePeak),
    limitations: (raw.limitations as string[]) ?? [],
    warnings: (raw.warnings as string[]) ?? [],
  };
}

function normaliseComparison(raw: Record<string, unknown>) {
  const matched = (raw.matched as Record<string, unknown>[]) ?? [];
  return {
    engine_version: str(raw.engine_version),
    matched: matched.map((m) => ({
      baseline_frequency_hz: num(m.baseline_frequency_hz),
      current_frequency_hz: num(m.current_frequency_hz),
      shift_hz: num(m.shift_hz),
      shift_percent: num(m.shift_percent),
      resolution_hz: num(m.resolution_hz),
      // The field that exposed all of this: false is omitted on the wire.
      exceeds_resolution: m.exceeds_resolution === true,
    })),
    unmatched_current_hz: (raw.unmatched_current_hz as number[]) ?? [],
    unmatched_baseline_hz: (raw.unmatched_baseline_hz as number[]) ?? [],
    interpretation: str(raw.interpretation),
  };
}

export interface GrpcSpectrumInput {
  samples: number[];
  sample_rate_hz: number;
  window?: string;
  detrend?: string;
  segment_length?: number | null;
  overlap?: number;
  max_peaks?: number;
  min_prominence_ratio?: number;
}

export async function spectrumOverGrpc<T>(input: GrpcSpectrumInput): Promise<T> {
  const request: Record<string, unknown> = {
    samples: input.samples,
    sample_rate_hz: input.sample_rate_hz,
    window: WINDOW_ENUM[input.window ?? "hann"] ?? "WINDOW_HANN",
    detrend: DETREND_ENUM[input.detrend ?? "linear"] ?? "DETREND_LINEAR",
  };

  // Only send what was actually chosen. An omitted optional means "engine
  // default"; sending 0 would mean something different and invalid.
  if (input.segment_length != null) request.segment_length = input.segment_length;
  if (input.overlap != null) request.overlap = input.overlap;
  if (input.max_peaks != null) request.max_peaks = input.max_peaks;
  if (input.min_prominence_ratio != null) {
    request.min_prominence_ratio = input.min_prominence_ratio;
  }

  const raw = await call<Record<string, unknown>>("Spectrum", request);
  return normaliseSpectrum(raw) as T;
}

export async function compareOverGrpc<T>(input: {
  current_peaks: unknown[];
  baseline_peaks: unknown[];
  tolerance_hz?: number | null;
}): Promise<T> {
  const request: Record<string, unknown> = {
    current_peaks: input.current_peaks,
    baseline_peaks: input.baseline_peaks,
  };
  if (input.tolerance_hz != null) request.tolerance_hz = input.tolerance_hz;
  const raw = await call<Record<string, unknown>>("CompareToBaseline", request);
  return normaliseComparison(raw) as T;
}

export async function healthOverGrpc(): Promise<{ status: string; version: string }> {
  return call<{ status: string; version: string }>("Health", {});
}

/** Closes the shared connection. Tests use it so the process can exit. */
export function closeEngineClient(): void {
  client?.close();
  client = null;
}
