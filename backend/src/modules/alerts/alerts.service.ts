import { randomBytes } from "crypto";
import {
  AlertCategory,
  AlertSeverity,
  AlertStatus,
  Prisma,
} from "@prisma/client";
import prisma from "../../config/prisma";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/AppError";
import { logger } from "../../utils/logger";
import { tenantScope, type AuthContext } from "../rbac/rbac.service";
import { publishEvent } from "../stream/event-bus";
import { NON_NUMERIC_FLAGS } from "../measurements/quality";
import {
  deriveSeverity,
  exceedanceRatio,
  isEscalation,
  type SeverityInputs,
} from "./severity";

/**
 * Alert detection and lifecycle.
 *
 * The dedup guarantee is the important one. A structural excursion lasts
 * minutes or hours and produces thousands of breaching readings; raising an
 * alert per reading would bury the engineer and train them to ignore the
 * inbox. So a CONDITION has a stable identity — the dedupe key — and while an
 * alert for that condition is open, further breaches update it rather than
 * creating new ones. Uniqueness is enforced by the database, not by
 * application logic that two ingest workers could race.
 */

/** Statuses that mean the condition is still being worked. */
const ACTIVE_STATUSES: AlertStatus[] = [
  AlertStatus.open,
  AlertStatus.acknowledged,
  AlertStatus.investigating,
];

function publicId(): string {
  return `al_${randomBytes(12).toString("hex")}`;
}

export interface BreachObservation {
  sensorId: number;
  sensorName?: string | null;
  value: number;
  ts: Date;
  qualityFlags: string[];
  locationId?: number | null;
  structureId?: number | null;
  deviceId?: number | null;
}

/**
 * Identity of a CONDITION, not of a reading.
 *
 * Deliberately excludes the timestamp and the value: including either would
 * make every reading a distinct condition and defeat deduplication entirely.
 */
export function buildDedupeKey(params: {
  tenantId: number;
  ruleId: number | null;
  sensorId: number | null;
  category: AlertCategory;
  bound: "min" | "max";
}): string {
  return [
    `t${params.tenantId}`,
    `r${params.ruleId ?? "none"}`,
    `s${params.sensorId ?? "none"}`,
    params.category,
    params.bound,
  ].join(":");
}

/**
 * Evaluates readings for a sensor against its rules and raises or updates
 * alerts. Called after measurements are stored, never before: an alert that
 * references a measurement which failed to persist is unverifiable.
 */
export async function evaluateReadings(
  tenantId: number,
  observations: BreachObservation[],
): Promise<{ raised: number; updated: number }> {
  if (observations.length === 0) return { raised: 0, updated: 0 };

  const sensorIds = [...new Set(observations.map((o) => o.sensorId))];
  const rules = await prisma.alertRule.findMany({
    where: {
      tenantId,
      isEnabled: true,
      OR: [{ sensorId: { in: sensorIds } }, { sensorId: null }],
    },
  });
  if (rules.length === 0) return { raised: 0, updated: 0 };

  let raised = 0;
  let updated = 0;

  for (const rule of rules) {
    const applicable = observations.filter(
      (o) =>
        (rule.sensorId === null || rule.sensorId === o.sensorId) &&
        (rule.structureId === null || rule.structureId === o.structureId),
    );
    if (applicable.length === 0) continue;

    // Evaluate each bound separately: a sensor can legitimately breach a lower
    // limit and an upper limit at different times, and they are different
    // conditions with different meanings.
    for (const bound of ["min", "max"] as const) {
      const limit = bound === "min" ? rule.minValue : rule.maxValue;
      if (limit === null) continue;

      const breaching = applicable.filter((o) =>
        bound === "min" ? o.value < limit : o.value > limit,
      );
      if (breaching.length === 0) continue;

      // Consecutive run within this batch, measured from the end, so a batch
      // whose breach has already recovered does not raise.
      let consecutive = 0;
      for (let i = applicable.length - 1; i >= 0; i--) {
        const o = applicable[i];
        const breaks = bound === "min" ? o.value < limit : o.value > limit;
        if (!breaks) break;
        consecutive += 1;
      }
      if (consecutive === 0) continue;

      const worst = breaching.reduce((acc, o) =>
        Math.abs(o.value - limit) > Math.abs(acc.value - limit) ? o : acc,
      );
      const suspect = breaching.some((o) =>
        o.qualityFlags.some((f) => NON_NUMERIC_FLAGS.includes(f)),
      );

      const inputs: SeverityInputs = {
        category: rule.category,
        exceedanceRatio: exceedanceRatio(
          worst.value,
          bound === "min" ? limit : null,
          bound === "max" ? limit : null,
        ),
        consecutiveSamples: consecutive,
        requiredSamples: rule.consecutiveSamples,
        dataQualitySuspect: suspect,
      };

      // Below the persistence threshold this is a spike, not a condition.
      // Recording it as an alert would be the noise problem in another form.
      if (consecutive < rule.consecutiveSamples) continue;

      const verdict = deriveSeverity(inputs);
      const dedupeKey = buildDedupeKey({
        tenantId,
        ruleId: rule.id,
        sensorId: rule.sensorId ?? worst.sensorId,
        category: rule.category,
        bound,
      });

      const outcome = await upsertAlert({
        tenantId,
        rule,
        bound,
        limit,
        worst,
        consecutive,
        dedupeKey,
        verdict,
      });

      if (outcome === "raised") raised += 1;
      else if (outcome === "updated") updated += 1;
    }
  }

  return { raised, updated };
}

async function upsertAlert(params: {
  tenantId: number;
  rule: { id: number; name: string; category: AlertCategory; consecutiveSamples: number };
  bound: "min" | "max";
  limit: number;
  worst: BreachObservation;
  consecutive: number;
  dedupeKey: string;
  verdict: ReturnType<typeof deriveSeverity>;
}): Promise<"raised" | "updated" | "skipped"> {
  const { tenantId, rule, bound, limit, worst, consecutive, dedupeKey, verdict } =
    params;

  const existing = await prisma.alert.findFirst({
    where: { dedupeKey, status: { in: ACTIVE_STATUSES } },
  });

  const evidence = {
    rule: rule.name,
    bound,
    limit,
    observedValue: worst.value,
    observedAt: worst.ts.toISOString(),
    consecutiveSamples: consecutive,
    requiredSamples: rule.consecutiveSamples,
    exceedancePercent: Number(
      (
        exceedanceRatio(
          worst.value,
          bound === "min" ? limit : null,
          bound === "max" ? limit : null,
        ) * 100
      ).toFixed(2),
    ),
    qualityFlags: worst.qualityFlags,
    // The derivation is stored so a severity can be audited later rather than
    // taken on trust.
    severityRationale: verdict.rationale,
  } as unknown as Prisma.InputJsonValue;

  if (existing) {
    // Same condition, still open: fold the observation in.
    const escalated = isEscalation(existing.severity, verdict.severity);

    await prisma.alert.update({
      where: { id: existing.id },
      data: {
        lastObservedAt: worst.ts,
        occurrenceCount: { increment: 1 },
        evidence,
        // Severity only ever escalates while an alert is open. Quietly
        // downgrading an alert an engineer has already triaged as HIGH would
        // hide the worst of the event from them.
        severity: escalated ? verdict.severity : existing.severity,
        confidence: Math.max(existing.confidence ?? 0, verdict.confidence),
      },
    });

    if (escalated) {
      await prisma.alertEvent.create({
        data: {
          alertId: existing.id,
          fromStatus: existing.status,
          toStatus: existing.status,
          note: `Severity escalated to ${verdict.severity}: ${verdict.rationale}`,
          isAutomatic: true,
        },
      });
    }
    return "updated";
  }

  const title =
    `${worst.sensorName ?? `Sensor ${worst.sensorId}`} ` +
    `${bound === "max" ? "above" : "below"} ${bound === "max" ? "upper" : "lower"} limit`;

  try {
    const alert = await prisma.alert.create({
      data: {
        publicId: publicId(),
        tenantId,
        ruleId: rule.id,
        sensorId: worst.sensorId,
        deviceId: worst.deviceId ?? null,
        locationId: worst.locationId ?? null,
        structureId: worst.structureId ?? null,
        category: rule.category,
        severity: verdict.severity,
        status: AlertStatus.open,
        title,
        evidence,
        confidence: verdict.confidence,
        dedupeKey,
        detectedAt: worst.ts,
        lastObservedAt: worst.ts,
        occurrenceCount: 1,
      },
    });

    await prisma.alertEvent.create({
      data: {
        alertId: alert.id,
        toStatus: AlertStatus.open,
        note: verdict.rationale,
        isAutomatic: true,
      },
    });

    publishEvent({
      type: "gateway",
      tenantId,
      gatewayId: 0,
      gatewayKey: alert.publicId,
      status: `alert:${alert.severity}`,
      lastSeenAt: alert.detectedAt.toISOString(),
    });

    return "raised";
  } catch (err) {
    // Two ingest workers racing the same condition: the unique index rejects
    // the loser, which is the correct outcome — one alert exists.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      logger.info(`Alert dedupe race resolved for ${dedupeKey}`);
      return "skipped";
    }
    throw err;
  }
}

// ─── Lifecycle transitions ───────────────────────────────────────────────────

/**
 * Which transitions are permitted.
 *
 * Encoded rather than left to the caller, so an alert cannot jump from open to
 * closed without someone having looked at it, and a closed alert cannot be
 * silently reopened to hide that it happened.
 */
const ALLOWED: Record<AlertStatus, AlertStatus[]> = {
  open: [AlertStatus.acknowledged, AlertStatus.investigating, AlertStatus.resolved],
  acknowledged: [AlertStatus.investigating, AlertStatus.resolved],
  investigating: [AlertStatus.resolved],
  resolved: [AlertStatus.closed, AlertStatus.investigating],
  closed: [],
};

async function loadAlert(ctx: AuthContext, id: number) {
  const alert = await prisma.alert.findFirst({
    where: { id, ...tenantScope(ctx) },
  });
  if (!alert) throw new NotFoundError("Alert not found");
  return alert;
}

export async function transition(
  ctx: AuthContext,
  id: number,
  to: AlertStatus,
  options: { note?: string; assignedToId?: number } = {},
) {
  const alert = await loadAlert(ctx, id);

  if (!ALLOWED[alert.status].includes(to)) {
    throw new BadRequestError(
      `An alert that is ${alert.status} cannot move to ${to}`,
    );
  }

  // Resolution must carry a reason. An alert closed with no explanation
  // teaches the next engineer nothing and makes the trail useless.
  if (to === AlertStatus.resolved && !options.note?.trim()) {
    throw new BadRequestError(
      "Resolving an alert requires a note explaining what was found",
    );
  }

  const now = new Date();
  const data: Prisma.AlertUpdateInput = { status: to };

  if (to === AlertStatus.acknowledged) {
    data.acknowledgedAt = now;
    data.acknowledgedById = ctx.userId;
  }
  if (to === AlertStatus.resolved) {
    data.resolvedAt = now;
    data.resolvedById = ctx.userId;
    data.resolutionNote = options.note!.trim();
  }
  if (to === AlertStatus.closed) data.closedAt = now;
  if (options.assignedToId !== undefined) {
    data.assignedToId = options.assignedToId;
  }

  const updated = await prisma.alert.update({ where: { id }, data });

  await prisma.alertEvent.create({
    data: {
      alertId: id,
      fromStatus: alert.status,
      toStatus: to,
      note: options.note?.trim() ?? null,
      actorId: ctx.userId,
    },
  });

  return updated;
}

export async function assign(ctx: AuthContext, id: number, assigneeId: number) {
  const alert = await loadAlert(ctx, id);

  // The assignee must be a member of the same tenant; assigning to an
  // arbitrary user id would leak the alert to someone outside the org.
  const membership = await prisma.membership.findFirst({
    where: { userId: assigneeId, tenantId: alert.tenantId, status: "active" },
    select: { id: true },
  });
  if (!membership) {
    throw new ForbiddenError("That user is not a member of this organization");
  }

  const updated = await prisma.alert.update({
    where: { id },
    data: { assignedToId: assigneeId },
  });

  await prisma.alertEvent.create({
    data: {
      alertId: id,
      fromStatus: alert.status,
      toStatus: alert.status,
      note: `Assigned to user ${assigneeId}`,
      actorId: ctx.userId,
    },
  });

  return updated;
}

export async function listAlerts(
  ctx: AuthContext,
  filters: {
    status?: AlertStatus;
    severity?: AlertSeverity;
    category?: AlertCategory;
    structureId?: number;
    activeOnly?: boolean;
  } = {},
) {
  const where: Prisma.AlertWhereInput = { ...tenantScope(ctx) };
  if (filters.status) where.status = filters.status;
  else if (filters.activeOnly) where.status = { in: ACTIVE_STATUSES };
  if (filters.severity) where.severity = filters.severity;
  if (filters.category) where.category = filters.category;
  if (filters.structureId) where.structureId = filters.structureId;

  return prisma.alert.findMany({
    where,
    orderBy: [{ severity: "desc" }, { detectedAt: "desc" }],
    take: 200,
  });
}

export async function getAlert(ctx: AuthContext, id: number) {
  const alert = await prisma.alert.findFirst({
    where: { id, ...tenantScope(ctx) },
    include: {
      rule: { select: { id: true, name: true } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!alert) throw new NotFoundError("Alert not found");
  return alert;
}

export async function summarize(ctx: AuthContext) {
  const rows = await prisma.alert.groupBy({
    by: ["severity", "status"],
    where: { ...tenantScope(ctx), status: { in: ACTIVE_STATUSES } },
    _count: { _all: true },
  });

  const bySeverity: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + row._count._all;
    total += row._count._all;
  }
  return { total, bySeverity };
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export async function createRule(
  ctx: AuthContext,
  input: {
    name: string;
    sensorId?: number;
    structureId?: number;
    category?: AlertCategory;
    minValue?: number;
    maxValue?: number;
    consecutiveSamples?: number;
  },
) {
  if (ctx.tenantId === null) {
    throw new BadRequestError("An active organization is required");
  }
  if (input.minValue === undefined && input.maxValue === undefined) {
    throw new BadRequestError("A rule needs at least one of minValue or maxValue");
  }
  if (
    input.minValue !== undefined &&
    input.maxValue !== undefined &&
    input.minValue >= input.maxValue
  ) {
    throw new BadRequestError("minValue must be below maxValue");
  }

  if (input.sensorId) {
    const sensor = await prisma.sensor.findFirst({
      where: { id: input.sensorId, ...tenantScope(ctx) },
      select: { id: true },
    });
    if (!sensor) throw new NotFoundError("Sensor not found");
  }

  return prisma.alertRule.create({
    data: {
      publicId: `ar_${randomBytes(12).toString("hex")}`,
      tenantId: ctx.tenantId,
      name: input.name,
      sensorId: input.sensorId ?? null,
      structureId: input.structureId ?? null,
      category: input.category ?? AlertCategory.structural,
      minValue: input.minValue ?? null,
      maxValue: input.maxValue ?? null,
      consecutiveSamples: input.consecutiveSamples ?? 3,
      createdBy: ctx.userId,
    },
  });
}

export async function listRules(ctx: AuthContext) {
  return prisma.alertRule.findMany({
    where: { ...tenantScope(ctx) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}
