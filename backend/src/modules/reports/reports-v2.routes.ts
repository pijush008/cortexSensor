import { Response, Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../../middleware/auth";
import { requirePermission, requireTenant } from "../../middleware/authorize";
import { UnauthorizedError } from "../../utils/AppError";
import { auditLogger } from "../../utils/audit";
import { enqueueReport } from "../analysis/analysis.queue";
import * as reports from "./report-generator.service";
import * as inspections from "../inspections/inspections.service";
import * as audit from "../audit/audit.service";

const router = Router();

function fail(res: Response, error: unknown) {
  const err = error as { statusCode?: number; message: string };
  const statusCode = err.statusCode || 400;
  return res.status(statusCode).json({
    status_code: statusCode,
    message: (err.message || "Something went wrong").replace(/"/g, ""),
  });
}

function invalid(
  res: Response,
  error: { issues: { path: (string | number)[]; message: string }[] },
) {
  return res.status(400).json({
    status_code: 400,
    message: error.issues[0]?.message ?? "Invalid request",
    fields: error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
  });
}

function ctxOf(req: AuthRequest) {
  if (!req.auth) throw new UnauthorizedError("Unauthorized");
  return req.auth;
}

// ── Reports (§52) ────────────────────────────────────────────────────────────

const reportSchema = z.object({
  title: z.string().trim().min(1, "A report needs a title").max(200),
  structureId: z.coerce.number().int().positive().optional(),
  projectId: z.coerce.number().int().positive().optional(),
  periodFrom: z.string(),
  periodTo: z.string(),
});

router.post(
  "/reports/generate",
  authenticate,
  requireTenant,
  requirePermission("REPORT_CREATE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = reportSchema.safeParse(req.body ?? {});
      if (!parsed.success) return invalid(res, parsed.error);

      const from = new Date(parsed.data.periodFrom);
      const to = new Date(parsed.data.periodTo);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return res
          .status(400)
          .json({ status_code: 400, message: "periodFrom/periodTo must be valid dates" });
      }

      const ctx = ctxOf(req);
      const report = await reports.requestReport(ctx, {
        title: parsed.data.title,
        structureId: parsed.data.structureId,
        projectId: parsed.data.projectId,
        periodFrom: from,
        periodTo: to,
      });

      const queued = await enqueueReport(report.id);

      const { ipAddress, userAgent } = auditLogger.requestContext(req);
      await auditLogger.audit({
        userId: ctx.userId,
        action: "create",
        entity: "report",
        entityId: report.id,
        newValue: { title: report.title, version: report.version },
        ipAddress,
        userAgent,
      });

      return res.status(202).json({
        status_code: 202,
        message: queued
          ? "Report queued. Poll it for the generated document."
          : "Report recorded but the job queue is unavailable; it will not generate until the queue is restored.",
        queued,
        data: report,
      });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.get(
  "/reports/generated",
  authenticate,
  requireTenant,
  requirePermission("REPORT_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = await reports.listReports(ctxOf(req));
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.get(
  "/reports/generated/:id",
  authenticate,
  requireTenant,
  requirePermission("REPORT_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = await reports.getReport(ctxOf(req), Number(req.params.id));
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

// ── Inspections (§53) ────────────────────────────────────────────────────────

const inspectionSchema = z.object({
  structureId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive().optional(),
  alertId: z.coerce.number().int().positive().optional(),
  type: z
    .enum(["routine", "triggered", "post_event", "commissioning", "decommissioning"])
    .optional(),
  outcome: z
    .enum([
      "no_action_required",
      "monitor",
      "repair_recommended",
      "urgent_action_required",
      "inconclusive",
    ])
    .optional(),
  performedAt: z.string().optional(),
  inspectorName: z.string().trim().min(1, "The inspector's name is required").max(160),
  inspectorOrg: z.string().trim().max(160).optional(),
  observations: z
    .string({ required_error: "Observations are required" })
    .trim()
    .min(1, "Observations are required")
    .max(8000),
  recommendation: z.string().trim().max(8000).optional(),
  environmentalContext: z.record(z.string(), z.unknown()).optional(),
});

router.get(
  "/inspections",
  authenticate,
  requireTenant,
  requirePermission("INSPECTION_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = await inspections.listInspections(ctxOf(req), {
        structureId: req.query.structureId ? Number(req.query.structureId) : undefined,
        alertId: req.query.alertId ? Number(req.query.alertId) : undefined,
      });
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.post(
  "/inspections",
  authenticate,
  requireTenant,
  requirePermission("INSPECTION_CREATE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = inspectionSchema.safeParse(req.body ?? {});
      if (!parsed.success) return invalid(res, parsed.error);
      const ctx = ctxOf(req);
      const data = await inspections.createInspection(ctx, parsed.data as never);
      const { ipAddress, userAgent } = auditLogger.requestContext(req);
      await auditLogger.audit({
        userId: ctx.userId,
        action: "create",
        entity: "inspection",
        entityId: data.id,
        newValue: { structureId: data.structureId, outcome: data.outcome },
        ipAddress,
        userAgent,
      });
      return res.status(201).json({ status_code: 201, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.get(
  "/inspections/:id",
  authenticate,
  requireTenant,
  requirePermission("INSPECTION_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = await inspections.getInspection(ctxOf(req), Number(req.params.id));
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

// ── Audit log (§60) ──────────────────────────────────────────────────────────

router.get(
  "/audit",
  authenticate,
  requireTenant,
  requirePermission("AUDIT_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const ctx = ctxOf(req);
      const data = await audit.listAuditLog(ctx, {
        entity: (req.query.entity as string) || undefined,
        action: (req.query.action as string) || undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        cursor: req.query.cursor ? Number(req.query.cursor) : undefined,
      });
      return res.status(200).json({ status_code: 200, message: null, ...data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.get(
  "/audit/facets",
  authenticate,
  requireTenant,
  requirePermission("AUDIT_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = await audit.auditFacets(ctxOf(req));
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

export default router;
