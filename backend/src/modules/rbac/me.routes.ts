import { Response, Router } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth";
import prisma from "../../config/prisma";

/**
 * The authenticated session's own identity and entitlements.
 *
 * This exists to stop the client guessing. The frontend previously carried a
 * hardcoded role → routes map that duplicated the server's permission model,
 * and the two drifted the moment granular permissions landed: an organization
 * admin who genuinely holds AUDIT_VIEW was still redirected away from the
 * audit page by a stale client-side list.
 *
 * The server is the only authority on what a session may do, so it says so
 * here and the client renders accordingly. This is presentation only —
 * every endpoint still enforces its own permission independently.
 */
const router = Router();

router.get("/me", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.auth || !req.user) {
    return res.status(401).json({ status_code: 401, message: "Unauthorized" });
  }

  // A user may hold memberships in several organizations. The session resolves
  // to one of them (the earliest), and until tenant switching exists that
  // choice is invisible to the user — they simply see one organization's data
  // with no indication another is there. Reporting the count makes the
  // limitation visible instead of silent.
  const memberships = await prisma.membership.count({
    where: { userId: req.user.id, status: "active" },
  });

  const tenant = req.auth.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: req.auth.tenantId },
        select: { id: true, publicId: true, name: true, slug: true, status: true },
      })
    : null;

  // Reported by the server, not inferred by the client. The view-as banner is
  // the only thing telling an operator that what they are looking at is someone
  // else's console, so its truth must come from the same place the request's
  // identity does — a client-side flag could go stale and leave an operator
  // believing they had exited when the session was still open.
  const impersonation = req.impersonation
    ? await prisma.user
        .findUnique({
          where: { id: req.impersonation.operatorId },
          select: { id: true, firstName: true, lastName: true, emailId: true },
        })
        .then((operator) => ({
          active: true as const,
          readOnly: true as const,
          operator: operator
            ? {
                id: operator.id,
                name: `${operator.firstName} ${operator.lastName}`.trim(),
                email: operator.emailId,
              }
            : null,
        }))
    : null;

  return res.status(200).json({
    status_code: 200,
    message: null,
    data: {
      user: {
        id: req.user.id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.emailId,
        /** Deprecated; retained while the client migrates to permissions. */
        userType: req.user.userType,
      },
      tenant,
      isPlatformAdmin: req.auth.isPlatformAdmin,
      /** >1 means the session silently resolved to one of several organizations. */
      membershipCount: memberships,
      role: req.auth.role,
      permissions: [...req.auth.permissions].sort(),
      /** Null in an ordinary session; set while a platform operator is viewing as this user. */
      impersonation,
    },
  });
});

export default router;
