import { Response, Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../../middleware/auth";
import { requirePermission, requireTenant } from "../../middleware/authorize";
import { UnauthorizedError } from "../../utils/AppError";
import { auditLogger } from "../../utils/audit";
import { enqueueRun } from "./analysis.queue";
import * as service from "./analysis.service";

const router = Router();

const requestSchema = z.object({
  sensorId: z.coerce.number().int().positive(),
  from: z.string(),
  to: z.string(),
  baselineId: z.coerce.number().int().positive().optional(),
  window: z.enum(["hann", "hamming", "blackman", "boxcar", "flattop"]).optional(),
  detrend: z.enum(["constant", "linear", "none"]).optional(),
  segmentLength: z.coerce.number().int().positive().optional(),
  overlap: z.coerce.number().min(0).max(0.95).optional(),
  maxPeaks: z.coerce.number().int().min(1).max(64).optional(),
});

const baselineSchema = z.object({
  label: z.string().trim().min(1, "A baseline needs a label").max(160),
  notes: z.string().trim().max(4000).optional(),
  environmentalContext: z.record(z.string(), z.unknown()).optional(),
});

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

router.post(
  "/analysis/spectrum",
  authenticate,
  requireTenant,
  requirePermission("SHM_ANALYZE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = requestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          status_code: 400,
          message: parsed.error.issues[0]?.message ?? "Invalid request",
          fields: parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const ctx = ctxOf(req);
      const from = new Date(parsed.data.from);
      const to = new Date(parsed.data.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return res
          .status(400)
          .json({ status_code: 400, message: "from/to must be valid dates" });
      }

      const run = await service.requestSpectrum(ctx, {
        sensorId: parsed.data.sensorId,
        from,
        to,
        baselineId: parsed.data.baselineId,
        parameters: {
          window: parsed.data.window,
          detrend: parsed.data.detrend,
          segmentLength: parsed.data.segmentLength,
          overlap: parsed.data.overlap,
          maxPeaks: parsed.data.maxPeaks,
        } as never,
      });

      const queued = await enqueueRun(run.id);

      const { ipAddress, userAgent } = auditLogger.requestContext(req);
      await auditLogger.audit({
        userId: ctx.userId,
        action: "create",
        entity: "analysis",
        entityId: run.id,
        newValue: { sensorId: run.sensorId, from: parsed.data.from, to: parsed.data.to },
        ipAddress,
        userAgent,
      });

      return res.status(202).json({
        status_code: 202,
        // Stated plainly rather than pretending the work is done: the client
        // polls the run, and a disabled queue must not look like success.
        message: queued
          ? "Analysis queued. Poll the run for its result."
          : "Analysis recorded but the job queue is unavailable; it will not run until the queue is restored.",
        queued,
        data: run,
      });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.get(
  "/analysis/runs",
  authenticate,
  requireTenant,
  requirePermission("SHM_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const sensorId = req.query.sensorId ? Number(req.query.sensorId) : undefined;
      const data = await service.listRuns(ctxOf(req), sensorId);
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.get(
  "/analysis/runs/:id",
  authenticate,
  requireTenant,
  requirePermission("SHM_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const data = await service.getRun(ctxOf(req), Number(req.params.id));
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.get(
  "/analysis/baselines",
  authenticate,
  requireTenant,
  requirePermission("SHM_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const sensorId = req.query.sensorId ? Number(req.query.sensorId) : undefined;
      const data = await service.listBaselines(ctxOf(req), sensorId);
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

// Capturing a reference state is an engineering judgement about which period
// represents the healthy structure, so it needs SHM_ANALYZE rather than a
// view permission.
router.post(
  "/analysis/runs/:id/baseline",
  authenticate,
  requireTenant,
  requirePermission("SHM_ANALYZE"),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = baselineSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({
          status_code: 400,
          message: parsed.error.issues[0]?.message ?? "Invalid request",
        });
      }
      const ctx = ctxOf(req);
      const data = await service.createBaselineFromRun(
        ctx,
        Number(req.params.id),
        parsed.data,
      );
      const { ipAddress, userAgent } = auditLogger.requestContext(req);
      await auditLogger.audit({
        userId: ctx.userId,
        action: "create",
        entity: "baseline",
        entityId: data.id,
        newValue: { sensorId: data.sensorId, version: data.version, label: data.label },
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
