import { Response, Router } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth";
import prisma from "../../config/prisma";
import { z } from "zod";
import { toPublicImagePath } from "../../utils/helper";
import { saveImageUpload } from "../../utils/image-upload";

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

  // req.user carries only what the auth middleware needs. The profile page
  // edits more than that, and a field the client is never sent is a field it
  // cannot render, so the editable columns are read here.
  const profile = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { phoneNo: true, companyName: true, companyLogo: true },
  });

  const tenant = req.auth.tenantId
    ? await prisma.tenant.findUnique({
        where: { id: req.auth.tenantId },
        select: {
          id: true,
          publicId: true,
          name: true,
          slug: true,
          status: true,
          logoPath: true,
        },
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
        phoneNo: profile?.phoneNo ?? null,
        companyName: profile?.companyName ?? null,
        // The stored path is a filesystem detail; the client gets something it
        // can put straight in an <img src>.
        companyLogoUrl: toPublicImagePath(profile?.companyLogo ?? null),
        /** Deprecated; retained while the client migrates to permissions. */
        userType: req.user.userType,
      },
      // The stored path is a filesystem detail; the client gets something it
      // can put straight in an <img src>.
      tenant: tenant && {
        id: tenant.id,
        publicId: tenant.publicId,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        logoUrl: toPublicImagePath(tenant.logoPath),
      },
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

/**
 * Edit your own account.
 *
 * There is no id anywhere in this route — not in the path, not in the body.
 * The row written is the session's own, which is the whole reason the endpoint
 * exists separately from the admin-facing user routes: "your own" must be
 * decided by the session, and an endpoint that cannot name anybody else cannot
 * be tricked into editing them.
 *
 * Every field is optional: the page saves what changed, and omitting one leaves
 * it alone rather than clearing it.
 */
const updateMeSchema = z.object({
  firstName: z.string().trim().min(1).max(255).optional(),
  lastName: z.string().trim().min(1).max(255).optional(),
  phoneNo: z.string().trim().min(6).max(20).optional(),
  companyName: z.string().trim().max(255).optional().nullable(),
  /** A base64 data URI. Saved to disk and stored as a relative path. */
  companyLogo: z.string().optional().nullable(),
});

router.patch("/me", authenticate, async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ status_code: 401, message: "Unauthorized" });
  }

  const parsed = updateMeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      status_code: 400,
      message: parsed.error.errors[0].message.replace(/"/g, ""),
    });
  }

  const { companyLogo, ...fields } = parsed.data;

  try {
    // Written to disk BEFORE the update but after validation, and the update is
    // a single statement — so a rejected image cannot leave half the form
    // saved, which is what an upload done afterwards would risk.
    const logoPath =
      typeof companyLogo === "string" && companyLogo.length > 0
        ? await saveImageUpload(companyLogo, { dir: "uploads/users" })
        : undefined;

    const data: Record<string, unknown> = { ...fields, updatedAt: new Date() };
    if (logoPath !== undefined) data.companyLogo = logoPath;
    // An explicit null clears the logo; an omitted field leaves it as it was.
    if (companyLogo === null) data.companyLogo = null;

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        firstName: true,
        lastName: true,
        phoneNo: true,
        companyName: true,
        companyLogo: true,
      },
    });

    return res.status(200).json({
      status_code: 200,
      message: "Profile updated",
      data: {
        ...updated,
        companyLogoUrl: toPublicImagePath(updated.companyLogo),
      },
    });
  } catch (error) {
    const err = error as { statusCode?: number; message?: string };
    return res.status(err.statusCode ?? 400).json({
      status_code: err.statusCode ?? 400,
      message: err.message ?? "Could not update your profile",
    });
  }
});

export default router;
