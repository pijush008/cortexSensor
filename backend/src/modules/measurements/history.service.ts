import { Prisma } from "@prisma/client";
import prisma from "../../config/prisma";
import { BadRequestError, NotFoundError } from "../../utils/AppError";
import { tenantScope, type AuthContext } from "../rbac/rbac.service";
import { NON_NUMERIC_FLAGS, TRACEABILITY_FLAGS } from "./quality";

/**
 * Historical series, aggregated in the database.
 *
 * The browser must never download a million raw samples to draw a line that is
 * 900 pixels wide (§29). Aggregation happens in Postgres and only the buckets
 * cross the wire.
 *
 * What is returned per bucket is deliberately more than an average:
 * min and max preserve the peaks that an average erases — and in structural
 * monitoring the peak IS the event — while the counts make data quality
 * visible on the chart rather than hidden behind a smooth line.
 */

/** Chart resolution ceiling. More points than this cannot be distinguished. */
const MAX_BUCKETS = 2000;

export const BUCKET_SECONDS = {
  "1s": 1,
  "10s": 10,
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "6h": 21600,
  "1d": 86400,
} as const;

export type BucketKey = keyof typeof BUCKET_SECONDS;

/**
 * Chooses the finest bucket that keeps the series under MAX_BUCKETS.
 *
 * Picking this server-side means a client asking for "30 days" gets a sensible
 * resolution automatically instead of either a truncated window or a response
 * large enough to lock up the tab.
 */
export function chooseBucket(fromMs: number, toMs: number): BucketKey {
  const spanSeconds = Math.max(1, (toMs - fromMs) / 1000);
  const keys = Object.keys(BUCKET_SECONDS) as BucketKey[];
  for (const key of keys) {
    if (spanSeconds / BUCKET_SECONDS[key] <= MAX_BUCKETS) return key;
  }
  return "1d";
}

export interface SeriesPoint {
  bucket: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  /** Readings contributing to this bucket. 0 means a real gap, not a zero. */
  count: number;
  /** Readings in this bucket carrying at least one quality flag. */
  flagged: number;
  /**
   * Readings whose value is real but not traceable to a calibration
   * certificate. Counted separately so the UI can mark the series without
   * hiding it.
   */
  untraceable: number;
}

export interface SeriesResult {
  sensorId: number;
  unit: string | null;
  from: string;
  to: string;
  bucket: BucketKey;
  bucketSeconds: number;
  points: SeriesPoint[];
  /** True when Timescale's time_bucket was used rather than the fallback. */
  timescale: boolean;
}

/** Confirms the sensor is the caller's before any data is read. */
async function assertSensorInScope(ctx: AuthContext, sensorId: number) {
  const sensor = await prisma.sensor.findFirst({
    where: { id: sensorId, ...tenantScope(ctx) },
    select: { id: true, unit: true },
  });
  if (!sensor) throw new NotFoundError("Sensor not found");
  return sensor;
}

async function hasTimescale(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ present: boolean }[]>`
    SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') AS present
  `;
  return rows[0]?.present === true;
}

export async function getSeries(
  ctx: AuthContext,
  params: {
    sensorId: number;
    from: Date;
    to: Date;
    bucket?: BucketKey;
    includeFlagged?: boolean;
  },
): Promise<SeriesResult> {
  if (params.to.getTime() <= params.from.getTime()) {
    throw new BadRequestError("The end of the range must be after its start");
  }

  const sensor = await assertSensorInScope(ctx, params.sensorId);
  const bucket =
    params.bucket ?? chooseBucket(params.from.getTime(), params.to.getTime());
  const seconds = BUCKET_SECONDS[bucket];

  const timescale = await hasTimescale();

  // Bucket width is bound as a parameter, and `bucket` itself comes from a
  // fixed keyed table — never from raw client input interpolated into SQL.
  const bucketExpr = timescale
    ? Prisma.sql`time_bucket(make_interval(secs => ${seconds}), "ts")`
    : Prisma.sql`to_timestamp(floor(extract(epoch from "ts") / ${seconds}) * ${seconds})`;

  // Readings whose NUMBER cannot be trusted are excluded from the statistics
  // so a saturated or flatlined channel cannot quietly drag a trend line. The
  // exclusion is narrow on purpose: a value that is merely uncalibrated or was
  // delivered late is still a real measurement, and blanking it would hide
  // data the operator actually has. Counts keep both cases visible.
  const valueExpr = params.includeFlagged
    ? Prisma.sql`"value"`
    : Prisma.sql`CASE WHEN NOT ("qualityFlags" && ${NON_NUMERIC_FLAGS}::text[]) THEN "value" END`;

  const rows = await prisma.$queryRaw<
    {
      bucket: Date;
      avg: number | null;
      min: number | null;
      max: number | null;
      count: bigint;
      flagged: bigint;
      untraceable: bigint;
    }[]
  >(Prisma.sql`
    SELECT
      ${bucketExpr} AS "bucket",
      AVG(${valueExpr})::float8 AS "avg",
      MIN(${valueExpr})::float8 AS "min",
      MAX(${valueExpr})::float8 AS "max",
      COUNT(*) AS "count",
      COUNT(*) FILTER (WHERE cardinality("qualityFlags") > 0) AS "flagged",
      COUNT(*) FILTER (WHERE "qualityFlags" && ${TRACEABILITY_FLAGS}::text[]) AS "untraceable"
    FROM "measurements"
    WHERE "sensorId" = ${params.sensorId}
      AND "tenantId" = ${ctx.tenantId ?? -1}
      AND "ts" >= ${params.from}
      AND "ts" <= ${params.to}
    GROUP BY 1
    ORDER BY 1 ASC
  `);

  return {
    sensorId: params.sensorId,
    unit: sensor.unit ?? null,
    from: params.from.toISOString(),
    to: params.to.toISOString(),
    bucket,
    bucketSeconds: seconds,
    timescale,
    points: rows.map((r) => ({
      bucket: r.bucket.toISOString(),
      avg: r.avg,
      min: r.min,
      max: r.max,
      count: Number(r.count),
      flagged: Number(r.flagged),
      untraceable: Number(r.untraceable),
    })),
  };
}

export interface LatestReading {
  sensorId: number;
  sensorName: string;
  unit: string | null;
  ts: string | null;
  value: number | null;
  qualityFlags: string[];
  secondsSinceReading: number | null;
}

/**
 * Most recent reading per sensor, for a live table.
 *
 * A sensor with no measurements is returned with nulls rather than omitted:
 * "this sensor has never reported" is exactly what an operator needs to see,
 * and dropping the row would hide it (§86).
 */
export async function getLatestReadings(
  ctx: AuthContext,
  structureId?: number,
): Promise<LatestReading[]> {
  const sensors = await prisma.sensor.findMany({
    where: { ...tenantScope(ctx) },
    select: { id: true, sensorName: true, unit: true },
    orderBy: { sensorName: "asc" },
    take: 500,
  });
  if (sensors.length === 0) return [];

  const sensorIds = sensors.map((s) => s.id);

  // DISTINCT ON is the efficient "latest row per group" in Postgres; the
  // (sensorId, ts) index makes it an index scan rather than a sort of history.
  const latest = await prisma.$queryRaw<
    { sensorId: number; ts: Date; value: number | null; qualityFlags: string[] }[]
  >(Prisma.sql`
    SELECT DISTINCT ON ("sensorId")
      "sensorId", "ts", "value", "qualityFlags"
    FROM "measurements"
    WHERE "sensorId" IN (${Prisma.join(sensorIds)})
      AND "tenantId" = ${ctx.tenantId ?? -1}
      ${structureId ? Prisma.sql`AND "structureId" = ${structureId}` : Prisma.empty}
    ORDER BY "sensorId", "ts" DESC
  `);

  const byId = new Map(latest.map((r) => [r.sensorId, r]));
  const now = Date.now();

  return sensors.map((sensor) => {
    const row = byId.get(sensor.id);
    return {
      sensorId: sensor.id,
      sensorName: sensor.sensorName,
      unit: sensor.unit ?? null,
      ts: row ? row.ts.toISOString() : null,
      value: row?.value ?? null,
      qualityFlags: row?.qualityFlags ?? [],
      secondsSinceReading: row
        ? Math.max(0, Math.floor((now - row.ts.getTime()) / 1000))
        : null,
    };
  });
}
