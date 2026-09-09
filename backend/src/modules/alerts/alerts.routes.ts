import { Response, Router } from "express";
import { AlertStatus } from "@prisma/client";
import { z } from "zod";
import { authenticate, AuthRequest } from "../../middleware/auth";
import { requirePermission, requireTenant } from "../../middleware/authorize";
import { UnauthorizedError } from "../../utils/AppError";
import { auditLogger } from "../../utils/audit";
import * as service from "./alerts.service";

const router = Router();

function fail(res: Response, error: unknown) {
  const err = error as { statusCode?: number; message: string };
  const statusCode = err.statusCode || 400;
  return res.status(statusCode).json({
    status_code: statusCode,
    message: (err.message || "Something went wrong").replace(/"/g, ""),
  });
}

function ctxOf(req: AuthRequest) {
  if (!req.auth) throw new UnauthorizedError("Unauthorized");
  return req.auth;
}

const noteSchema = z.object({ note: z.string().trim().max(4000).optional() });

router.get(
  "/alerts",
  authenticate,
  requireTenant,
  requirePermission("ALERT_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = await service.listAlerts(ctxOf(req), {
        status: req.query.status as AlertStatus | undefined,
        severity: req.query.severity as never,
        category: req.query.category as never,
        activeOnly: req.query.activeOnly === "true",
        structureId: req.query.structureId ? Number(req.query.structureId) : undefined,
      });
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.get(
  "/alerts/summary",
  authenticate,
  requireTenant,
  requirePermission("ALERT_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = await service.summarize(ctxOf(req));
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.get(
  "/alerts/:id",
  authenticate,
  requireTenant,
  requirePermission("ALERT_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = await service.getAlert(ctxOf(req), Number(req.params.id));
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

/** Claiming an alert for investigation. */
router.post(
  "/alerts/:id/acknowledge",
  authenticate,
  requireTenant,
  requirePermission("ALERT_ACKNOWLEDGE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = noteSchema.safeParse(req.body ?? {});
      const ctx = ctxOf(req);
      const data = await service.transition(
        ctx,
        Number(req.params.id),
        AlertStatus.acknowledged,
        { note: parsed.success ? parsed.data.note : undefined },
      );
      const { ipAddress, userAgent } = auditLogger.requestContext(req);
      await auditLogger.audit({
        userId: ctx.userId,
        action: "update",
        entity: "alert",
        entityId: data.id,
        newValue: { status: "acknowledged" },
        ipAddress,
        userAgent,
      });
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.post(
  "/alerts/:id/investigate",
  authenticate,
  requireTenant,
  requirePermission("ALERT_ACKNOWLEDGE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = noteSchema.safeParse(req.body ?? {});
      const data = await service.transition(
        ctxOf(req),
        Number(req.params.id),
        AlertStatus.investigating,
        { note: parsed.success ? parsed.data.note : undefined },
      );
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

// Resolving is an engineering judgement about a structural finding, so it
// needs ALERT_RESOLVE rather than the acknowledge permission a technician has.
router.post(
  "/alerts/:id/resolve",
  authenticate,
  requireTenant,
  requirePermission("ALERT_RESOLVE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = z
        .object({
          // required_error covers the field being ABSENT; min(1) covers it
          // being present but blank. Without the first, a missing field
          // returns Zod's bare "Required", which tells the user nothing.
          note: z
            .string({ required_error: "A resolution note is required" })
            .trim()
            .min(1, "A resolution note is required")
            .max(4000),
        })
        .safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          status_code: 400,
          message: parsed.error.issues[0]?.message ?? "A resolution note is required",
        });
      }
      const ctx = ctxOf(req);
      const data = await service.transition(
        ctx,
        Number(req.params.id),
        AlertStatus.resolved,
        { note: parsed.data.note },
      );
      const { ipAddress, userAgent } = auditLogger.requestContext(req);
      await auditLogger.audit({
        userId: ctx.userId,
        action: "update",
        entity: "alert",
        entityId: data.id,
        newValue: { status: "resolved" },
        ipAddress,
        userAgent,
      });
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.post(
  "/alerts/:id/close",
  authenticate,
  requireTenant,
  requirePermission("ALERT_RESOLVE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = await service.transition(
        ctxOf(req),
        Number(req.params.id),
        AlertStatus.closed,
      );
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.post(
  "/alerts/:id/assign",
  authenticate,
  requireTenant,
  requirePermission("ALERT_ASSIGN"),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = z
        .object({ assigneeId: z.coerce.number().int().positive() })
        .safeParse(req.body ?? {});
      if (!parsed.success) {
        return res
          .status(400)
          .json({ status_code: 400, message: "assigneeId is required" });
      }
      const data = await service.assign(
        ctxOf(req),
        Number(req.params.id),
        parsed.data.assigneeId,
      );
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

// ── Rules ────────────────────────────────────────────────────────────────────

router.get(
  "/alert-rules",
  authenticate,
  requireTenant,
  requirePermission("ALERT_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = await service.listRules(ctxOf(req));
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.post(
  "/alert-rules",
  authenticate,
  requireTenant,
  requirePermission("SENSOR_CONFIGURE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = z
        .object({
          name: z.string().trim().min(1).max(160),
          sensorId: z.coerce.number().int().positive().optional(),
          structureId: z.coerce.number().int().positive().optional(),
          category: z
            .enum(["structural", "sensor_health", "connectivity", "data_quality"])
            .optional(),
          minValue: z.coerce.number().optional(),
          maxValue: z.coerce.number().optional(),
          consecutiveSamples: z.coerce.number().int().min(1).max(1000).optional(),
        })
        .safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          status_code: 400,
          message: parsed.error.issues[0]?.message ?? "Invalid rule",
          fields: parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
      }
      const ctx = ctxOf(req);
      const data = await service.createRule(ctx, parsed.data as never);
      const { ipAddress, userAgent } = auditLogger.requestContext(req);
      await auditLogger.audit({
        userId: ctx.userId,
        action: "create",
        entity: "alert",
        entityId: data.id,
        newValue: { name: data.name, min: data.minValue, max: data.maxValue },
        ipAddress,
        userAgent,
      });
      return res.status(201).json({ status_code: 201, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

export default router;
