import { Router, type Response } from "express";
import { authenticate, type AuthRequest } from "../../middleware/auth";
import { requirePlatformAdmin } from "../../middleware/authorize";
import { BadRequestError, UnauthorizedError } from "../../utils/AppError";
import { auditLogger } from "../../utils/audit";
import { getUserDetail } from "./platform-users.service";
import {
  clearImpersonationCookie,
  setImpersonationCookie,
  startImpersonation,
} from "./impersonation.service";

/**
 * Platform operator surfaces (§19). Every route here is gated on
 * `requirePlatformAdmin`, which reads the session's resolved context — never a
 * role name supplied by the client.
 */
const router = Router();

/** One user, as a platform operator sees them: access, sessions, action trail. */
router.get(
  "/admin/users/:id",
  authenticate,
  requirePlatformAdmin,
  async (req: AuthRequest, res: Response, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        throw new BadRequestError("Invalid user id");
      }

      const limit = req.query.activityLimit
        ? Number(req.query.activityLimit)
        : undefined;

      const detail = await getUserDetail(id, { activityLimit: limit });
      res.json({ status_code: 200, message: null, data: detail });
    } catch (err) {
      next(err);
    }
  },
);

/** Opens a read-only view-as session. */
router.post(
  "/admin/impersonation",
  authenticate,
  requirePlatformAdmin,
  async (req: AuthRequest, res: Response, next) => {
    try {
      if (!req.auth) throw new UnauthorizedError("Unauthorized");

      // Refused while already viewing as someone. Chaining sessions would make
      // the audit trail ambiguous about who is actually behind the request.
      if (req.impersonation) {
        throw new BadRequestError(
          "Already in a view-as session. Exit it before starting another.",
        );
      }

      const targetUserId = Number((req.body as { userId?: unknown })?.userId);
      if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
        throw new BadRequestError("A userId is required");
      }

      const result = await startImpersonation(req.auth, targetUserId);
      setImpersonationCookie(res, result.token);

      // Attributed to the operator. `entityId` is the person being viewed, so
      // the trail answers both "what did this operator do" and "who was viewed".
      await auditLogger.audit({
        userId: req.auth.userId,
        action: "impersonate-start",
        entity: "user",
        entityId: result.target.id,
        newValue: {
          targetEmail: result.target.emailId,
          expiresAt: result.expiresAt.toISOString(),
          readOnly: true,
        },
        ...auditLogger.requestContext(req),
      });

      res.json({
        status_code: 200,
        message: null,
        data: {
          target: result.target,
          expiresAt: result.expiresAt,
          readOnly: true,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Ends a view-as session.
 *
 * Note the absence of `requirePlatformAdmin`: during impersonation the session
 * resolves to the VIEWED user, who is not a platform admin, so requiring it
 * here would make the session impossible to leave. `req.impersonation` is set
 * only from a cryptographically verified token, and the exit is idempotent.
 */
router.delete(
  "/admin/impersonation",
  authenticate,
  async (req: AuthRequest, res: Response, next) => {
    try {
      const active = req.impersonation;
      clearImpersonationCookie(res);

      if (active) {
        await auditLogger.audit({
          userId: active.operatorId,
          action: "impersonate-end",
          entity: "user",
          entityId: active.targetUserId,
          ...auditLogger.requestContext(req),
        });
      }

      res.json({
        status_code: 200,
        message: null,
        data: { ended: Boolean(active) },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
