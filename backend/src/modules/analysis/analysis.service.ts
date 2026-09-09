import { randomBytes } from "crypto";
import { AnalysisKind, AnalysisStatus, Prisma } from "@prisma/client";
import prisma from "../../config/prisma";
import { config } from "../../config";
import { BadRequestError, NotFoundError } from "../../utils/AppError";
import { logger } from "../../utils/logger";
import { tenantScope, type AuthContext } from "../rbac/rbac.service";
import { NON_NUMERIC_FLAGS } from "../measurements/quality";

/**
 * Spectral analysis orchestration.
 *
 * The numerical work happens in the Python engine (§74); this module decides
 * WHO may ask, WHAT window is analysed, and records the result so it can be
 * reproduced later (§103). Splitting it that way keeps tenant authorization and
 * signal processing in the places each belongs.
 */

export interface SpectrumParameters {
  window: "hann" | "hamming" | "blackman" | "boxcar" | "flattop";
  detrend: "constant" | "linear" | "none";
  segmentLength?: number;
  overlap: number;
  maxPeaks: number;
  minProminenceRatio: number;
}

export const DEFAULT_PARAMETERS: SpectrumParameters = {
  // Hann is the default because it has low spectral leakage and is the
  // conventional choice for ambient vibration; a boxcar would smear energy
  // from a strong peak across neighbouring bins.
  window: "hann",
  // Linear, because thermal drift puts a ramp on a strain record and an
  // untreated ramp dominates the low-frequency end of the spectrum.
  detrend: "linear",
  overlap: 0.5,
  maxPeaks: 8,
  minProminenceRatio: 0.05,
};

function publicId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

async function assertSensorInScope(ctx: AuthContext, sensorId: number) {
  const sensor = await prisma.sensor.findFirst({
    where: { id: sensorId, ...tenantScope(ctx) },
    select: { id: true, tenantId: true, sensorName: true, unit: true },
  });
  if (!sensor || sensor.tenantId === null) throw new NotFoundError("Sensor not found");
  return sensor;
}

/**
 * Loads the samples for a window, in time order.
 *
 * Readings whose value cannot be trusted numerically are excluded: feeding a
 * flatlined or out-of-range sample into a transform produces a spectrum of the
 * fault, not of the structure. The count of exclusions is returned so the
 * result can state how much data was actually used.
 */
export async function loadSamples(
  sensorId: number,
  tenantId: number,
  from: Date,
  to: Date,
  limit = 500_000,
): Promise<{ values: number[]; timestamps: Date[]; excluded: number }> {
  const rows = await prisma.$queryRaw<{ ts: Date; value: number | null; bad: boolean }[]>(
    Prisma.sql`
      SELECT "ts", "value",
             ("qualityFlags" && ${NON_NUMERIC_FLAGS}::text[]) AS "bad"
      FROM "measurements"
      WHERE "sensorId" = ${sensorId}
        AND "tenantId" = ${tenantId}
        AND "ts" >= ${from}
        AND "ts" <= ${to}
      ORDER BY "ts" ASC
      LIMIT ${limit}
    `,
  );

  const values: number[] = [];
  const timestamps: Date[] = [];
  let excluded = 0;

  for (const row of rows) {
    if (row.bad || row.value === null) {
      excluded += 1;
      continue;
    }
    values.push(row.value);
    timestamps.push(row.ts);
  }

  return { values, timestamps, excluded };
}

/**
 * Infers the sampling rate from the data rather than asking the user to assert
 * one, because a wrong rate silently relabels every frequency in the result.
 *
 * The median interval is used, not the mean: a single gap from a dropped
 * packet would drag a mean badly, while the median reflects the cadence the
 * device actually ran at. Irregular sampling is reported so the caller knows
 * the frequency axis is approximate.
 */
export function inferSampleRate(timestamps: Date[]): {
  sampleRateHz: number | null;
  jitterRatio: number | null;
} {
  if (timestamps.length < 3) return { sampleRateHz: null, jitterRatio: null };

  const deltas: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    const delta = timestamps[i].getTime() - timestamps[i - 1].getTime();
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length === 0) return { sampleRateHz: null, jitterRatio: null };

  const sorted = [...deltas].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median <= 0) return { sampleRateHz: null, jitterRatio: null };

  // Interquartile spread relative to the median: a compact way of saying "how
  // regular was this sampling?" without being thrown by a few outliers.
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const jitterRatio = (q3 - q1) / median;

  return { sampleRateHz: 1000 / median, jitterRatio };
}

export interface EngineSpectrum {
  engine_version: string;
  method: string;
  sample_rate_hz: number;
  frequency_resolution_hz: number;
  sample_count: number;
  duration_seconds: number;
  frequencies_hz: number[];
  psd: number[];
  peaks: {
    frequency_hz: number;
    magnitude: number;
    prominence: number;
    bandwidth_hz: number | null;
    damping_ratio: number | null;
    resolution_hz: number;
  }[];
  limitations: string[];
  warnings: string[];
}

/** Calls the engine. Kept narrow so the transport is easy to swap or mock. */
export async function callEngine<T>(path: string, body: unknown): Promise<T> {
  const url = `${config.shmEngineUrl}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.shmEngineTimeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new BadRequestError(
        `Analysis engine rejected the request (${response.status}): ${detail.slice(0, 300)}`,
      );
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function requestSpectrum(
  ctx: AuthContext,
  input: {
    sensorId: number;
    from: Date;
    to: Date;
    parameters?: Partial<SpectrumParameters>;
    baselineId?: number;
  },
) {
  const sensor = await assertSensorInScope(ctx, input.sensorId);
  if (input.to.getTime() <= input.from.getTime()) {
    throw new BadRequestError("The end of the window must be after its start");
  }

  const run = await prisma.analysisRun.create({
    data: {
      publicId: publicId("run"),
      tenantId: sensor.tenantId!,
      kind: AnalysisKind.spectrum,
      status: AnalysisStatus.queued,
      sensorId: input.sensorId,
      windowFrom: input.from,
      windowTo: input.to,
      parameters: { ...DEFAULT_PARAMETERS, ...input.parameters } as Prisma.InputJsonValue,
      baselineId: input.baselineId ?? null,
      requestedBy: ctx.userId,
    },
  });

  return run;
}

/**
 * Executes a queued run. Called by the worker, never inside a request:
 * a spectrum over a long window is CPU and memory heavy, and running it in the
 * request path would tie up a connection and time out the client (§57).
 */
export async function executeRun(runId: number): Promise<void> {
  const run = await prisma.analysisRun.findUnique({ where: { id: runId } });
  if (!run) return;
  if (run.status !== AnalysisStatus.queued) return;

  await prisma.analysisRun.update({
    where: { id: runId },
    data: { status: AnalysisStatus.running, startedAt: new Date() },
  });

  try {
    const { values, timestamps, excluded } = await loadSamples(
      run.sensorId,
      run.tenantId,
      run.windowFrom,
      run.windowTo,
    );

    if (values.length < 16) {
      // Failing loudly beats returning a spectrum computed from nothing.
      throw new BadRequestError(
        `Not enough usable measurements in this window (${values.length} usable, ${excluded} excluded for data quality). At least 16 are required.`,
      );
    }

    const { sampleRateHz, jitterRatio } = inferSampleRate(timestamps);
    if (!sampleRateHz) {
      throw new BadRequestError(
        "Could not determine the sampling rate from the measurement timestamps",
      );
    }

    const params = (run.parameters as unknown as SpectrumParameters) ?? DEFAULT_PARAMETERS;

    const spectrum = await callEngine<EngineSpectrum>("/spectrum", {
      samples: values,
      sample_rate_hz: sampleRateHz,
      window: params.window,
      detrend: params.detrend,
      segment_length: params.segmentLength,
      overlap: params.overlap,
      max_peaks: params.maxPeaks,
      min_prominence_ratio: params.minProminenceRatio,
    });

    const warnings = [...spectrum.warnings];
    if (excluded > 0) {
      warnings.push(
        `${excluded} reading(s) were excluded from the transform because their values failed data-quality checks`,
      );
    }
    if (jitterRatio !== null && jitterRatio > 0.2) {
      // An irregular record breaks the even-sampling assumption every FFT
      // makes; the frequency axis is then approximate.
      warnings.push(
        `Sampling was irregular (interval spread ${(jitterRatio * 100).toFixed(0)}% of the median). Frequency estimates are approximate.`,
      );
    }

    let comparison: unknown = null;
    if (run.baselineId) {
      const baseline = await prisma.baseline.findFirst({
        where: { id: run.baselineId, tenantId: run.tenantId },
      });
      if (baseline) {
        comparison = await callEngine("/baseline/compare", {
          current_peaks: spectrum.peaks,
          baseline_peaks: baseline.peaks,
        });
      }
    }

    await prisma.analysisRun.update({
      where: { id: runId },
      data: {
        status: AnalysisStatus.succeeded,
        finishedAt: new Date(),
        sampleRateHz,
        method: spectrum.method,
        engineVersion: spectrum.engine_version,
        result: {
          ...spectrum,
          warnings,
          excludedReadings: excluded,
          samplingJitterRatio: jitterRatio,
          baselineComparison: comparison,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    const message = (err as Error).message ?? "Analysis failed";
    logger.error(`Analysis run ${runId} failed: ${message}`);
    await prisma.analysisRun.update({
      where: { id: runId },
      data: {
        status: AnalysisStatus.failed,
        finishedAt: new Date(),
        // Kept, not discarded: a recurring failure is diagnosable only if the
        // reason survives.
        error: message.slice(0, 2000),
      },
    });
  }
}

export async function listRuns(ctx: AuthContext, sensorId?: number) {
  return prisma.analysisRun.findMany({
    where: {
      ...tenantScope(ctx),
      ...(sensorId ? { sensorId } : {}),
    },
    orderBy: { queuedAt: "desc" },
    take: 50,
  });
}

export async function getRun(ctx: AuthContext, id: number) {
  const run = await prisma.analysisRun.findFirst({
    where: { id, ...tenantScope(ctx) },
    include: { baseline: { select: { id: true, label: true, version: true } } },
  });
  if (!run) throw new NotFoundError("Analysis run not found");
  return run;
}

/**
 * Captures a completed spectrum as the reference state for a sensor.
 *
 * A baseline is created FROM an analysis run rather than computed afresh, so
 * the reference and the comparisons against it were produced by the same
 * method, parameters and engine version. Comparing a Hann-windowed spectrum
 * against a boxcar baseline would produce shifts that are artefacts of the
 * method rather than of the structure.
 */
export async function createBaselineFromRun(
  ctx: AuthContext,
  runId: number,
  input: { label: string; notes?: string; environmentalContext?: unknown },
) {
  const run = await getRun(ctx, runId);
  if (run.status !== AnalysisStatus.succeeded || !run.result) {
    throw new BadRequestError(
      "A baseline can only be captured from a completed analysis",
    );
  }

  const result = run.result as unknown as EngineSpectrum;
  if (!result.peaks || result.peaks.length === 0) {
    throw new BadRequestError(
      "This analysis identified no peaks, so it cannot define a reference state",
    );
  }

  const previous = await prisma.baseline.findFirst({
    where: { sensorId: run.sensorId },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  return prisma.baseline.create({
    data: {
      publicId: publicId("bl"),
      tenantId: run.tenantId,
      sensorId: run.sensorId,
      version: (previous?.version ?? 0) + 1,
      label: input.label,
      notes: input.notes ?? null,
      windowFrom: run.windowFrom,
      windowTo: run.windowTo,
      sampleRateHz: run.sampleRateHz,
      method: run.method,
      parameters: run.parameters ?? Prisma.JsonNull,
      engineVersion: run.engineVersion,
      peaks: result.peaks as unknown as Prisma.InputJsonValue,
      environmentalContext:
        (input.environmentalContext as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      createdBy: ctx.userId,
    },
  });
}

export async function listBaselines(ctx: AuthContext, sensorId?: number) {
  return prisma.baseline.findMany({
    where: { ...tenantScope(ctx), ...(sensorId ? { sensorId } : {}) },
    orderBy: [{ sensorId: "asc" }, { version: "desc" }],
    take: 100,
  });
}
