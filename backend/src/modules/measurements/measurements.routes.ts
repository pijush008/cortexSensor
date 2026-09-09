import { Response, Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../../middleware/auth";
import { requirePermission, requireTenant } from "../../middleware/authorize";
import { UnauthorizedError } from "../../utils/AppError";
import { BUCKET_SECONDS, getLatestReadings, getSeries } from "./history.service";

const router = Router();

const seriesQuerySchema = z.object({
  sensorId: z.coerce.number().int().positive(),
  from: z.string(),
  to: z.string().optional(),
  bucket: z.enum(Object.keys(BUCKET_SECONDS) as [string, ...string[]]).optional(),
  includeFlagged: z.coerce.boolean().optional(),
});

function fail(res: Response, error: unknown) {
  const err = error as { statusCode?: number; message: string };
  const statusCode = err.statusCode || 400;
  return res.status(statusCode).json({
    status_code: statusCode,
    message: (err.message || "Something went wrong").replace(/"/g, ""),
  });
}

router.get(
  "/measurements/series",
  authenticate,
  requireTenant,
  requirePermission("SHM_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) throw new UnauthorizedError("Unauthorized");
      const parsed = seriesQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          status_code: 400,
          message: parsed.error.issues[0]?.message ?? "Invalid query",
          fields: parsed.error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
      }

      const from = new Date(parsed.data.from);
      const to = parsed.data.to ? new Date(parsed.data.to) : new Date();
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return res
          .status(400)
          .json({ status_code: 400, message: "from/to must be valid dates" });
      }

      const data = await getSeries(req.auth, {
        sensorId: parsed.data.sensorId,
        from,
        to,
        bucket: parsed.data.bucket as keyof typeof BUCKET_SECONDS | undefined,
        includeFlagged: parsed.data.includeFlagged,
      });
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

router.get(
  "/measurements/latest",
  authenticate,
  requireTenant,
  requirePermission("SHM_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) throw new UnauthorizedError("Unauthorized");
      const structureId = req.query.structureId
        ? Number(req.query.structureId)
        : undefined;
      const data = await getLatestReadings(req.auth, structureId);
      return res.status(200).json({ status_code: 200, message: null, data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

export default router;
