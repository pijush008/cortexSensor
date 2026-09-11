import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import { auditLogger } from "../../utils/audit";
import { assertProjectAccess } from "../projects/projects.service";
import * as invitationsService from "./invitations.service";
import {
  completeInvitationSchema,
  createInvitationSchema,
  verifyInvitationSchema,
} from "./invitations.types";

function handleControllerError(res: Response, error: unknown) {
  const err = error as { statusCode?: number; message: string };
  const statusCode = err.statusCode || 400;
  return res.status(statusCode).json({
    status_code: statusCode,
    message: (err.message || "Something Went Wrong").replace(/"/g, ""),
  });
}

/**
 * Only an administrator invites.
 *
 * assertProjectAccess admits a project's own contractor and authority as well,
 * which is right for reading a project and wrong for handing out roles on it:
 * without this a contractor could invite an authority of their choosing to the
 * project they sit on.
 */
function assertMayManageInvitations(req: AuthRequest): void {
  const type = req.user?.userType;
  if (type !== "superadmin" && type !== "admin") {
    const err = new Error(
      "Only an administrator can assign a contractor or an authority",
    ) as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }
}

export async function createInvitationHandler(req: AuthRequest, res: Response) {
  try {
    assertMayManageInvitations(req);
    const projectId = Number(req.params.projectId);
    await assertProjectAccess(projectId, req.user);

    const parsed = createInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status_code: 400,
        message: parsed.error.errors[0].message.replace(/"/g, ""),
      });
    }

    const result = await invitationsService.createInvitation({
      projectId,
      role: parsed.data.role,
      emailId: parsed.data.emailId,
      invitedBy: req.user!.id,
    });

    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "create",
      entity: "projectInvitation",
      entityId: result.invitationId,
      newValue: { projectId, role: result.role, emailId: result.emailId },
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      status_code: 200,
      message: result.emailSent
        ? `Invitation sent to ${result.emailId}`
        : `Invitation created for ${result.emailId}, but email is not configured on this deployment`,
      data: result,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function listInvitationsHandler(req: AuthRequest, res: Response) {
  try {
    const projectId = Number(req.params.projectId);
    await assertProjectAccess(projectId, req.user);
    const data = await invitationsService.listInvitations(projectId);
    return res.status(200).json({ status_code: 200, message: "Success", data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function resendInvitationHandler(req: AuthRequest, res: Response) {
  try {
    assertMayManageInvitations(req);
    const projectId = Number(req.params.projectId);
    await assertProjectAccess(projectId, req.user);

    const result = await invitationsService.resendInvitation(
      Number(req.params.invitationId),
      projectId,
    );

    return res.status(200).json({
      status_code: 200,
      message: `Invitation resent to ${result.emailId}`,
      data: result,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function revokeInvitationHandler(req: AuthRequest, res: Response) {
  try {
    assertMayManageInvitations(req);
    const projectId = Number(req.params.projectId);
    await assertProjectAccess(projectId, req.user);

    const invitationId = Number(req.params.invitationId);
    await invitationsService.revokeInvitation(invitationId, projectId);

    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "delete",
      entity: "projectInvitation",
      entityId: invitationId,
      ipAddress,
      userAgent,
    });

    return res
      .status(200)
      .json({ status_code: 200, message: "Invitation revoked" });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function removeStakeholderHandler(req: AuthRequest, res: Response) {
  try {
    assertMayManageInvitations(req);
    const projectId = Number(req.params.projectId);
    await assertProjectAccess(projectId, req.user);

    const role = String(req.params.role);
    if (!invitationsService.isInvitableRole(role)) {
      return res.status(400).json({
        status_code: 400,
        message: "Role must be contractor or authority",
      });
    }

    const result = await invitationsService.removeStakeholder(projectId, role);

    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "update",
      entity: "project",
      entityId: projectId,
      oldValue: { [`${role}Id`]: result.removedUserId },
      newValue: { [`${role}Id`]: null, membershipRemoved: result.membershipRemoved },
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      status_code: 200,
      message: result.membershipRemoved
        ? `Removed from ${result.projectName}, and from the organization — they held no other project here`
        : `Removed from ${result.projectName}`,
      data: result,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

// ── Completing an invitation ────────────────────────────────────────────────
// Both steps are taken by the ADMINISTRATOR, from the project they are setting
// up. There is no invitee-facing page: the code travels from the invitee to the
// administrator by whatever means they are already in contact through, and the
// administrator enters it here.

export async function verifyInvitationHandler(req: AuthRequest, res: Response) {
  try {
    assertMayManageInvitations(req);
    const projectId = Number(req.params.projectId);
    await assertProjectAccess(projectId, req.user);

    const parsed = verifyInvitationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        status_code: 400,
        message: parsed.error.errors[0].message.replace(/"/g, ""),
      });
    }

    const data = await invitationsService.verifyInvitationOtp(
      Number(req.params.invitationId),
      projectId,
      parsed.data.otp,
    );
    return res
      .status(200)
      .json({ status_code: 200, message: "Code verified", data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function completeInvitationHandler(
  req: AuthRequest,
  res: Response,
) {
  try {
    assertMayManageInvitations(req);
    const projectId = Number(req.params.projectId);
    await assertProjectAccess(projectId, req.user);

    const parsed = completeInvitationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        status_code: 400,
        message: parsed.error.errors[0].message.replace(/"/g, ""),
      });
    }

    const result = await invitationsService.completeInvitation(
      Number(req.params.invitationId),
      projectId,
      parsed.data,
    );

    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "create",
      entity: "user",
      newValue: { emailId: result.emailId, role: result.role, projectId },
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      status_code: 200,
      message: result.accountCreated
        ? `${result.emailId} can now sign in with the password you set`
        : `${result.emailId} has been added to ${result.projectName}`,
      data: result,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
}
