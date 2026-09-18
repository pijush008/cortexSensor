import { Response, Router } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../../middleware/auth";
import { requirePermission, requirePlatformAdmin } from "../../middleware/authorize";
import { config } from "../../config";
import { listIngestionFiles, scanOnce } from "./ingestion.service";

const router = Router();

const listSchema = z.object({
  status: z.enum(["received", "processed", "failed", "unknown_gateway", "duplicate"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function fail(res: Response, error: unknown) {
  const err = error as { statusCode?: number; message: string };
  const statusCode = err.statusCode || 400;
  return res.status(statusCode).json({ status_code: statusCode, message: (err.message || "Something went wrong").replace(/"/g, "") });
}

/** The ingestion ledger: what the FTP drop received and what became of it. */
router.get(
  "/ingestion/files",
  authenticate,
  requirePermission("GATEWAY_VIEW"),
  async (req: AuthRequest, res: Response) => {
    try {
      const parsed = listSchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ status_code: 400, message: parsed.error.issues[0]?.message ?? "Invalid query" });
      }
      const data = await listIngestionFiles(req.auth!, parsed.data);
      return res.status(200).json({ status_code: 200, message: null, ...data });
    } catch (error) {
      return fail(res, error);
    }
  },
);

/**
 * Runs one scan now rather than waiting for the timer. For an operator
 * checking a fresh upload, and for verifying a deployment.
 */
router.post(
  "/ingestion/scan",
  authenticate,
  requirePlatformAdmin,
  async (_req: AuthRequest, res: Response) => {
    try {
      if (!config.ftpIngest.dir) {
        return res.status(400).json({ status_code: 400, message: "FTP_INGEST_DIR is not configured on this server" });
      }
      const results = await scanOnce(config.ftpIngest.dir, 0);
      return res.status(200).json({ status_code: 200, message: null, data: results });
    } catch (error) {
      return fail(res, error);
    }
  },
);

export default router;
