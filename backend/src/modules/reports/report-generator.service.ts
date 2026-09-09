import { randomBytes } from "crypto";
import { Prisma, ReportStatus } from "@prisma/client";
import prisma from "../../config/prisma";
import { BadRequestError, NotFoundError } from "../../utils/AppError";
import { logger } from "../../utils/logger";
import { tenantScope, type AuthContext } from "../rbac/rbac.service";
import { NON_NUMERIC_FLAGS, TRACEABILITY_FLAGS } from "../measurements/quality";

/**
 * Monitoring report generation (§52).
 *
 * What this produces is a record of what was MEASURED over a period, with the
 * data quality behind it and the limits of the methods used. What it never
 * produces is a verdict on whether a structure is safe.
 *
 * That restraint is the point. A report is a document someone may act on or
 * file with an authority. Asserting "structure is safe" from threshold
 * compliance and a spectral peak list would be an engineering conclusion this
 * platform has no basis to reach (§88), and putting it in a document makes it
 * far more consequential than putting it on a screen.
 *
 * A report is also immutable once ready. Regenerating in place as new data
 * arrives would silently change a document that has already been read, so a
 * fresh generation is a new version.
 */

export interface ReportContent {
  meta: {
    generatedAt: string;
    version: number;
    periodFrom: string;
    periodTo: string;
    /** Version of the generator, so an old report can be explained. */
    generatorVersion: string;
  };
  project: { id: number | null; name: string | null } | null;
  structure: {
    id: number;
    name: string;
    code: string;
    type: string;
    siteAddress: string | null;
  } | null;
  monitoring: {
    sensorCount: number;
    locationCount: number;
    measurementCount: number;
    firstReading: string | null;
    lastReading: string | null;
    /** Proportion of the period with no readings at all, 0..1. */
    coverageGapRatio: number | null;
  };
  dataQuality: {
    total: number;
    flagged: number;
    untrustworthy: number;
    untraceable: number;
    flagBreakdown: Record<string, number>;
  };
  sensors: {
    sensorId: number;
    name: string;
    unit: string | null;
    count: number;
    min: number | null;
    max: number | null;
    avg: number | null;
    flagged: number;
  }[];
  alerts: {
    total: number;
    bySeverity: Record<string, number>;
    unresolved: number;
    items: {
      publicId: string;
      severity: string;
      category: string;
      status: string;
      title: string;
      detectedAt: string;
      resolutionNote: string | null;
    }[];
  };
  analyses: {
    publicId: string;
    method: string | null;
    engineVersion: string | null;
    windowFrom: string;
    windowTo: string;
    peakCount: number;
  }[];
  inspections: {
    publicId: string;
    performedAt: string;
    inspectorName: string;
    outcome: string;
    observations: string;
  }[];
  limitations: string[];
}

export const GENERATOR_VERSION = "1.0.0";

function publicId(): string {
  return `rep_${randomBytes(12).toString("hex")}`;
}

export async function requestReport(
  ctx: AuthContext,
  input: {
    title: string;
    structureId?: number;
    projectId?: number;
    periodFrom: Date;
    periodTo: Date;
  },
) {
  if (ctx.tenantId === null) {
    throw new BadRequestError("An active organization is required");
  }
  if (input.periodTo.getTime() <= input.periodFrom.getTime()) {
    throw new BadRequestError("The end of the period must be after its start");
  }

  if (input.structureId) {
    const structure = await prisma.structure.findFirst({
      where: { id: input.structureId, ...tenantScope(ctx) },
      select: { id: true },
    });
    if (!structure) throw new NotFoundError("Structure not found");
  }

  // Versioned per structure and period, so regenerating never overwrites a
  // document somebody has already read or filed.
  const previous = await prisma.report.findFirst({
    where: {
      tenantId: ctx.tenantId,
      structureId: input.structureId ?? null,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
    },
    orderBy: { version: "desc" },
    select: { version: true },
  });

  return prisma.report.create({
    data: {
      publicId: publicId(),
      tenantId: ctx.tenantId,
      title: input.title,
      version: (previous?.version ?? 0) + 1,
      projectId: input.projectId ?? null,
      structureId: input.structureId ?? null,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      status: ReportStatus.queued,
      createdBy: ctx.userId,
    },
  });
}

/** Executes generation. Called by the worker, never inside a request (§57). */
export async function generateReport(reportId: number): Promise<void> {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report || report.status !== ReportStatus.queued) return;

  await prisma.report.update({
    where: { id: reportId },
    data: { status: ReportStatus.generating },
  });

  try {
    const content = await buildContent(report);
    await prisma.report.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.ready,
        content: content as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
      },
    });
  } catch (err) {
    const message = (err as Error).message ?? "Report generation failed";
    logger.error(`Report ${reportId} failed: ${message}`);
    await prisma.report.update({
      where: { id: reportId },
      data: { status: ReportStatus.failed, error: message.slice(0, 2000) },
    });
  }
}

async function buildContent(report: {
  id: number;
  tenantId: number;
  version: number;
  projectId: number | null;
  structureId: number | null;
  periodFrom: Date;
  periodTo: Date;
}): Promise<ReportContent> {
  const { tenantId, structureId, periodFrom, periodTo } = report;

  const structure = structureId
    ? await prisma.structure.findFirst({
        where: { id: structureId, tenantId },
        include: { project: { select: { id: true, projectName: true } } },
      })
    : null;

  const sensorWhere: Prisma.SensorWhereInput = { tenantId };
  const sensors = await prisma.sensor.findMany({
    where: sensorWhere,
    select: { id: true, sensorName: true, unit: true },
  });
  const sensorIds = sensors.map((s) => s.id);

  const measurementWhere: Prisma.MeasurementWhereInput = {
    tenantId,
    ts: { gte: periodFrom, lte: periodTo },
    ...(structureId ? { structureId } : {}),
  };

  const [total, firstRow, lastRow] = await Promise.all([
    prisma.measurement.count({ where: measurementWhere }),
    prisma.measurement.findFirst({
      where: measurementWhere,
      orderBy: { ts: "asc" },
      select: { ts: true },
    }),
    prisma.measurement.findFirst({
      where: measurementWhere,
      orderBy: { ts: "desc" },
      select: { ts: true },
    }),
  ]);

  // Per-sensor statistics, computed in the database. Untrustworthy readings
  // are excluded from the figures but counted, so the report states how much
  // was set aside rather than quietly shrinking the sample.
  const perSensor =
    sensorIds.length > 0
      ? await prisma.$queryRaw<
          {
            sensorId: number;
            count: bigint;
            min: number | null;
            max: number | null;
            avg: number | null;
            flagged: bigint;
          }[]
        >(Prisma.sql`
          SELECT "sensorId",
                 COUNT(*) AS "count",
                 MIN(CASE WHEN NOT ("qualityFlags" && ${NON_NUMERIC_FLAGS}::text[]) THEN "value" END)::float8 AS "min",
                 MAX(CASE WHEN NOT ("qualityFlags" && ${NON_NUMERIC_FLAGS}::text[]) THEN "value" END)::float8 AS "max",
                 AVG(CASE WHEN NOT ("qualityFlags" && ${NON_NUMERIC_FLAGS}::text[]) THEN "value" END)::float8 AS "avg",
                 COUNT(*) FILTER (WHERE cardinality("qualityFlags") > 0) AS "flagged"
          FROM "measurements"
          WHERE "tenantId" = ${tenantId}
            AND "ts" >= ${periodFrom} AND "ts" <= ${periodTo}
            ${structureId ? Prisma.sql`AND "structureId" = ${structureId}` : Prisma.empty}
          GROUP BY "sensorId"
        `)
      : [];

  const qualityRows =
    total > 0
      ? await prisma.$queryRaw<{ flag: string; count: bigint }[]>(Prisma.sql`
          SELECT unnest("qualityFlags") AS "flag", COUNT(*) AS "count"
          FROM "measurements"
          WHERE "tenantId" = ${tenantId}
            AND "ts" >= ${periodFrom} AND "ts" <= ${periodTo}
            ${structureId ? Prisma.sql`AND "structureId" = ${structureId}` : Prisma.empty}
          GROUP BY 1
        `)
      : [];

  const flagBreakdown: Record<string, number> = {};
  for (const row of qualityRows) flagBreakdown[row.flag] = Number(row.count);

  const untrustworthy = NON_NUMERIC_FLAGS.reduce(
    (sum, f) => sum + (flagBreakdown[f] ?? 0),
    0,
  );
  const untraceable = TRACEABILITY_FLAGS.reduce(
    (sum, f) => sum + (flagBreakdown[f] ?? 0),
    0,
  );
  const flagged = Object.values(flagBreakdown).reduce((a, b) => a + b, 0);

  const alerts = await prisma.alert.findMany({
    where: {
      tenantId,
      detectedAt: { gte: periodFrom, lte: periodTo },
      ...(structureId ? { structureId } : {}),
    },
    orderBy: { detectedAt: "desc" },
    take: 200,
  });

  const bySeverity: Record<string, number> = {};
  for (const a of alerts) bySeverity[a.severity] = (bySeverity[a.severity] ?? 0) + 1;

  const analyses = await prisma.analysisRun.findMany({
    where: {
      tenantId,
      status: "succeeded",
      windowFrom: { gte: periodFrom },
      windowTo: { lte: periodTo },
    },
    orderBy: { queuedAt: "desc" },
    take: 50,
  });

  const inspections = await prisma.inspection.findMany({
    where: {
      tenantId,
      performedAt: { gte: periodFrom, lte: periodTo },
      ...(structureId ? { structureId } : {}),
    },
    orderBy: { performedAt: "desc" },
    take: 100,
  });

  const locationCount = structureId
    ? await prisma.location.count({ where: { structureId, tenantId } })
    : 0;

  // Coverage: how much of the requested period actually produced data. A
  // report over a month during which the gateway was down for three weeks
  // must say so, not present the surviving week as if it covered the month.
  let coverageGapRatio: number | null = null;
  if (firstRow && lastRow) {
    const covered = lastRow.ts.getTime() - firstRow.ts.getTime();
    const requested = periodTo.getTime() - periodFrom.getTime();
    coverageGapRatio =
      requested > 0 ? Math.max(0, 1 - covered / requested) : null;
  } else {
    coverageGapRatio = 1;
  }

  const limitations = [
    "This report states what was measured during the period. It does not " +
      "assess structural safety, adequacy or remaining life, and must not be " +
      "read as doing so.",
    "Figures exclude readings whose values failed data-quality checks; the " +
      "counts of excluded and untraceable readings are given so the reader can " +
      "judge how much of the record they rest on.",
    "Spectral results referenced here carry their own limitations, recorded " +
      "with each analysis run.",
    "Any interpretation of a change requires environmental context — " +
      "temperature, loading and operating conditions — and, where a change is " +
      "significant, physical inspection.",
  ];

  if (coverageGapRatio !== null && coverageGapRatio > 0.1) {
    limitations.unshift(
      `Measurements cover only part of the requested period (approximately ${(
        (1 - coverageGapRatio) * 100
      ).toFixed(0)}%). Conclusions drawn across the full period are not supported by this data.`,
    );
  }
  if (total === 0) {
    limitations.unshift(
      "No measurements were recorded in this period. This report documents " +
        "that absence and contains no measured findings.",
    );
  }

  const sensorById = new Map(sensors.map((s) => [s.id, s]));

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      version: report.version,
      periodFrom: periodFrom.toISOString(),
      periodTo: periodTo.toISOString(),
      generatorVersion: GENERATOR_VERSION,
    },
    project: structure?.project
      ? { id: structure.project.id, name: structure.project.projectName }
      : null,
    structure: structure
      ? {
          id: structure.id,
          name: structure.name,
          code: structure.code,
          type: structure.type,
          siteAddress: structure.siteAddress,
        }
      : null,
    monitoring: {
      sensorCount: perSensor.length,
      locationCount,
      measurementCount: total,
      firstReading: firstRow?.ts.toISOString() ?? null,
      lastReading: lastRow?.ts.toISOString() ?? null,
      coverageGapRatio,
    },
    dataQuality: {
      total,
      flagged,
      untrustworthy,
      untraceable,
      flagBreakdown,
    },
    sensors: perSensor.map((row) => ({
      sensorId: row.sensorId,
      name: sensorById.get(row.sensorId)?.sensorName ?? `Sensor ${row.sensorId}`,
      unit: sensorById.get(row.sensorId)?.unit ?? null,
      count: Number(row.count),
      min: row.min,
      max: row.max,
      avg: row.avg,
      flagged: Number(row.flagged),
    })),
    alerts: {
      total: alerts.length,
      bySeverity,
      unresolved: alerts.filter(
        (a) => a.status !== "resolved" && a.status !== "closed",
      ).length,
      items: alerts.slice(0, 50).map((a) => ({
        publicId: a.publicId,
        severity: a.severity,
        category: a.category,
        status: a.status,
        title: a.title,
        detectedAt: a.detectedAt.toISOString(),
        resolutionNote: a.resolutionNote,
      })),
    },
    analyses: analyses.map((r) => ({
      publicId: r.publicId,
      method: r.method,
      engineVersion: r.engineVersion,
      windowFrom: r.windowFrom.toISOString(),
      windowTo: r.windowTo.toISOString(),
      peakCount:
        ((r.result as unknown as { peaks?: unknown[] })?.peaks?.length as number) ?? 0,
    })),
    inspections: inspections.map((i) => ({
      publicId: i.publicId,
      performedAt: i.performedAt.toISOString(),
      inspectorName: i.inspectorName,
      outcome: i.outcome,
      observations: i.observations,
    })),
    limitations,
  };
}

export async function listReports(ctx: AuthContext) {
  return prisma.report.findMany({
    where: { ...tenantScope(ctx) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function getReport(ctx: AuthContext, id: number) {
  const report = await prisma.report.findFirst({
    where: { id, ...tenantScope(ctx) },
  });
  if (!report) throw new NotFoundError("Report not found");
  return report;
}
