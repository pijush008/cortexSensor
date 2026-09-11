import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import * as projectsService from "./projects.service";
import * as invitationsService from "../invitations/invitations.service";
import { getOrCreateOperatorTenant } from "../rbac/tenant.provisioning";
import { assertProjectAccess } from "./projects.service";
import prisma from "../../config/prisma";
import { BadRequestError, ForbiddenError, UnauthorizedError } from "../../utils/AppError";
import { auditLogger } from "../../utils/audit";
import { assertWithinLimits, resolveSubscriptionAdminId } from "../subscription/subscription.service";
import { hasPermission } from "../../middleware/permissions";
import { UserRole } from "@prisma/client";
import {
  projectAddSchema,
  projectUpdateSchema,
  projectDetailUpdateSchema,
  projectCodeSchema,
  projectListQuerySchema,
  projectStartQuerySchema,
  projectOffsetSchema,
  dashboardDataParamsSchema,
  emailSettingSchema,
  channelUpdateSchema,
  projectSetupSchema,
  setProjectDeviceSchema,
} from "./projects.types";

function handleControllerError(res: Response, error: unknown) {
  const err = error as { statusCode?: number; message: string };
  const statusCode = err.statusCode || 400;
  const message = err.message || "Something Went Wrong";
  const errorMessage = message.replace(/"/g, "");
  return res.status(statusCode).json({
    status_code: statusCode,
    message: errorMessage,
    error: statusCode === 500 ? null : undefined,
  });
}

async function assertProjectAccessByUniqueId(
  uniqueId: string,
  user?: AuthRequest["user"],
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { uniqueId },
    select: { id: true },
  });
  if (!project) {
    throw new BadRequestError("Project not found");
  }
  await assertProjectAccess(project.id, user);
}

/**
 * Resolve the device that owns the given channel id, then verify the
 * requesting user may access that device (admin owner / superadmin).
 */
async function assertDeviceAccessByChannelId(
  channelId: number | string,
  user?: AuthRequest["user"],
): Promise<void> {
  if (!user) throw new BadRequestError("Unauthorized");
  if (user.userType === "superadmin") return;

  const channel = await prisma.deviceChannel.findUnique({
    where: { id: Number(channelId) },
    select: { deviceId: true },
  });
  if (!channel) throw new BadRequestError("Channel not found");

  const device = await prisma.device.findUnique({
    where: { id: Number(channel.deviceId) },
    select: { addedBy: true, assignedAdmin: true },
  });
  if (!device) throw new BadRequestError("Device not found");

  const allowed =
    device.addedBy === user.id || device.assignedAdmin === user.id;
  if (!allowed) {
    throw new BadRequestError("You do not have access to this device");
  }
}

/**
 * Which organization a newly created project belongs to.
 *
 * The creator's own, always. Nothing in the request body is consulted:
 * honouring a tenant id from a client would let anybody file a project inside
 * an organization they do not belong to (§17), which is why the form has no
 * such field and the endpoint would ignore one anyway.
 *
 * A PLATFORM OPERATOR has no organization of their own by design, so theirs is
 * the operator organization — see getOrCreateOperatorTenant.
 */
async function resolveCreateTenantId(req: AuthRequest): Promise<number | null> {
  if (req.auth?.isPlatformAdmin === true) {
    return getOrCreateOperatorTenant();
  }
  return req.auth?.tenantId ?? null;
}

/**
 * Turn the stakeholder emails on a project form into invitations.
 *
 * Deliberately non-fatal: the project has already been created and audited by
 * the time this runs, so a bad address or an unreachable mail server must not
 * turn a successful creation into an error the caller reads as "nothing
 * happened". Each outcome is reported back per role instead, and the
 * administrator can resend from the project page.
 */
async function issueStakeholderInvitations(
  req: AuthRequest,
  projectId: number,
  input: { contractorEmail?: string | null; authorityEmail?: string | null },
): Promise<Array<{ role: string; emailId: string; sent: boolean; message: string }>> {
  const wanted: Array<{ role: "contractor" | "authority"; emailId: string }> = [];
  if (input.contractorEmail?.trim()) {
    wanted.push({ role: "contractor", emailId: input.contractorEmail.trim() });
  }
  if (input.authorityEmail?.trim()) {
    wanted.push({ role: "authority", emailId: input.authorityEmail.trim() });
  }
  if (wanted.length === 0 || !req.user) return [];

  const results = [];
  for (const item of wanted) {
    try {
      const invitation = await invitationsService.createInvitation({
        projectId,
        role: item.role,
        emailId: item.emailId,
        invitedBy: req.user.id,
      });
      results.push({
        role: item.role,
        emailId: invitation.emailId,
        sent: invitation.emailSent,
        message: invitation.emailSent
          ? `Invitation sent to ${invitation.emailId}`
          : `Invitation created for ${invitation.emailId}, but email is not configured`,
      });
    } catch (err) {
      results.push({
        role: item.role,
        emailId: item.emailId,
        sent: false,
        message: (err as Error).message,
      });
    }
  }
  return results;
}

export async function createNewProject(req: AuthRequest, res: Response) {
  try {
    const result = projectAddSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const tenantId = await resolveCreateTenantId(req);
    if (tenantId == null) {
      return res.status(403).json({
        status_code: 403,
        message: "Your account is not an active member of any organization",
      });
    }
    // Enforce the tenant's billing plan before provisioning a new structure.
    const billingAdminId = await resolveSubscriptionAdminId(req.user!);
    await assertWithinLimits(billingAdminId, { structures: 1 });
    // The creator is WHOEVER IS SIGNED IN, never whoever the body names.
    //
    // createdBy used to be read straight from the request and fell back to 0
    // when absent — and no user has id 0, so every creation from the UI (which
    // sends no such field) died on a foreign key violation. Taking it from the
    // session fixes that and closes the hole in the same move: a creator id
    // from a body would let anyone file a project under another person's name,
    // and createdBy is what assertProjectAccess uses to decide who administers
    // the project.
    const response = await projectsService.createProject(
      { ...result.data, createdBy: String(req.user!.id) },
      tenantId,
    );
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "create",
      entity: "project",
      entityId: response.projectId,
      newValue: { projectName: result.data.projectName },
      ipAddress,
      userAgent,
    });
    const invitations = await issueStakeholderInvitations(
      req,
      response.projectId,
      result.data,
    );
    return res.status(200).json({ ...response, invitations });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function updateProject(req: AuthRequest, res: Response) {
  try {
    const result = projectUpdateSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    if (result.data.projectId) {
      await assertProjectAccess(Number(result.data.projectId), req.user);
    }
    // Update path: the project is located by id and its tenant is not
    // reassigned, so the caller's tenant is passed only to satisfy the
    // create-branch signature.
    const response = await projectsService.createProject(
      { ...result.data, projectId: result.data.projectId } as never,
      req.auth?.tenantId ?? 0,
    );
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "update",
      entity: "project",
      entityId: Number(result.data.projectId) || response.projectId,
      newValue: { projectName: result.data.projectName },
      ipAddress,
      userAgent,
    });
    const invitations = await issueStakeholderInvitations(
      req,
      Number(result.data.projectId) || response.projectId,
      result.data,
    );
    return res.status(200).json({ ...response, invitations });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

/**
 * Who may change a project's dashboard media.
 *
 * The project image is the ASSIGNED CONTRACTOR's to upload, and "contractor" is
 * not an RBAC role — the roles are ORGANIZATION_ADMIN, SHM_ENGINEER, TECHNICIAN
 * and VIEWER. It is a per-project relationship, so a blanket
 * requirePermission() on the route cannot express it: the check has to see
 * which project is being changed.
 *
 * Admins keep access alongside the contractor, so a project is never stranded
 * when its contractor leaves.
 */
async function assertMayEditProjectMedia(
  req: AuthRequest,
  projectId: number,
): Promise<void> {
  const userType = req.user?.userType as UserRole | undefined;
  const userId = req.user?.id ?? req.auth?.userId;
  if (!userType || userId === undefined) {
    throw new UnauthorizedError("Unauthorized");
  }
  if (hasPermission(userType, "MANAGE_PROJECTS")) return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { contractorId: true },
  });
  if (project && project.contractorId === userId) return;

  throw new ForbiddenError(
    "Only this project's contractor or an administrator can change its dashboard media",
  );
}

export async function updateProjectDetail(req: AuthRequest, res: Response) {
  try {
    const { projectId } = req.params;
    await assertProjectAccess(Number(projectId), req.user);
    await assertMayEditProjectMedia(req, Number(projectId));
    const result = projectDetailUpdateSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const response = await projectsService.updateProjectDetails(projectId, result.data);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function projectCodeCreation(req: AuthRequest, res: Response) {
  try {
    const { projectId } = req.params;
    await assertProjectAccess(Number(projectId), req.user);
    const result = projectCodeSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const response = await projectsService.createProjectCode(projectId, result.data);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function getProjectDetailHandler(req: AuthRequest, res: Response) {
  try {
    const { projectId } = req.params;
    await assertProjectAccess(Number(projectId), req.user);
    const response = await projectsService.getProjectDetail(projectId);
    return res.status(200).json({
      status_code: 200,
      message: "success",
      error: null,
      projectDetail: response,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function getProjectListHandler(req: AuthRequest, res: Response) {
  try {
    let adminId = req.params.adminId;
    const user = req.user;

    if (user) {
      if (user.userType === "superadmin") {
        // superadmin may browse any admin's projects; adminId 0 = all
        adminId = adminId ?? "0";
      } else {
        // any other role may only ever see their own scoped projects
        adminId = String(user.id);
      }
    }

    const query = projectListQuerySchema.parse(req.query);
    const data = await projectsService.getProjectList(adminId, query);
    return res.status(200).json({
      status_code: 200,
      message: "success",
      error: null,
      projectDetail: data,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function getProjectStatusHandler(req: AuthRequest, res: Response) {
  try {
    const { projectId } = req.params;
    await assertProjectAccess(Number(projectId), req.user);
    const response = await projectsService.getProjectStatus(projectId);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function projectStartHandler(req: AuthRequest, res: Response) {
  try {
    const { projectId } = req.params;
    await assertProjectAccess(Number(projectId), req.user);
    const query = projectStartQuerySchema.parse(req.query);
    const response = await projectsService.projectStart(projectId, query);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function deleteProjectByIdHandler(req: AuthRequest, res: Response) {
  try {
    const { projectId } = req.params;
    const user = req.user;
    if (!user || (user.userType !== "superadmin" && user.userType !== "admin")) {
      return res.status(403).json({
        status_code: 403,
        message: "You do not have permission to delete projects",
      });
    }
    await assertProjectAccess(Number(projectId), user);
    const response = await projectsService.deleteProjectById(projectId);
    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: user.id,
      action: "delete",
      entity: "project",
      entityId: Number(projectId),
      ipAddress,
      userAgent,
    });
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function projectOffsetByIdHandler(req: AuthRequest, res: Response) {
  try {
    const { projectId, offset } = req.params;
    await assertProjectAccess(Number(projectId), req.user);
    const result = projectOffsetSchema.safeParse({ offset });
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    const response = await projectsService.projectOffsetById(projectId, result.data);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function dashboardDataHandler(req: AuthRequest, res: Response) {
  try {
    const { uniqueId } = req.params;
    await assertProjectAccessByUniqueId(uniqueId, req.user);
    const response = await projectsService.dashboardData(uniqueId);
    return res.status(200).json({
      statusCode: 200,
      message: "Success",
      projectDetail: [response],
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

/**
 * Who may change a project's device.
 *
 * assertProjectAccess admits the project's contractor and authority too, which
 * is right for reading a project and wrong for reassigning its hardware.
 */
function assertMayManageDevice(req: AuthRequest): void {
  const type = req.user?.userType;
  if (type !== "superadmin" && type !== "admin") {
    const err = new Error(
      "Only an administrator can change a project's device",
    ) as Error & { statusCode: number };
    err.statusCode = 403;
    throw err;
  }
}

export async function projectDeviceOptionsHandler(
  req: AuthRequest,
  res: Response,
) {
  try {
    const projectId = Number(req.params.projectId);
    await assertProjectAccess(projectId, req.user);
    const data = await projectsService.projectDeviceOptions(projectId);
    return res.status(200).json({ status_code: 200, message: "Success", data });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function setProjectDeviceHandler(req: AuthRequest, res: Response) {
  try {
    assertMayManageDevice(req);
    const projectId = Number(req.params.projectId);
    await assertProjectAccess(projectId, req.user);

    const parsed = setProjectDeviceSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        status_code: 400,
        message: parsed.error.errors[0].message.replace(/"/g, ""),
      });
    }

    const before = await prisma.project.findUnique({
      where: { id: projectId },
      select: { deviceId: true },
    });

    const result = await projectsService.setProjectDevice(
      projectId,
      // The schema accepts a number too, because a <select> value and a JSON
      // number are both reasonable things for a client to send.
      parsed.data.deviceId == null ? null : String(parsed.data.deviceId),
    );

    const { ipAddress, userAgent } = auditLogger.requestContext(req);
    await auditLogger.audit({
      userId: req.user?.id,
      action: "update",
      entity: "project",
      entityId: projectId,
      oldValue: { deviceId: before?.deviceId ?? null },
      newValue: { deviceId: result.deviceId },
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      status_code: 200,
      message: result.deviceId
        ? "Device updated"
        : "Device removed from this project",
      data: result,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function projectSetupHandler(req: AuthRequest, res: Response) {
  try {
    const { projectId } = req.params;
    await assertProjectAccess(Number(projectId), req.user);
    const result = projectSetupSchema.parse(req.query);
    const response = await projectsService.projectSetup(projectId, result);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function channelListByDeviceIdHandler(req: AuthRequest, res: Response) {
  try {
    const { deviceId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const response = await projectsService.channelListByDeviceId(deviceId, page, limit);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function channelListUpdateHandler(req: AuthRequest, res: Response) {
  try {
    const result = channelUpdateSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    for (const update of result.data.channelUpdate) {
      await assertDeviceAccessByChannelId(update.channelId, req.user);
    }
    const response = await projectsService.channelListUpdate(result.data);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function channelSwapHandler(req: AuthRequest, res: Response) {
  try {
    const channelsId = req.query.channelsId as string;
    if (!channelsId) {
      return res.status(400).json({ status_code: 400, message: "channelsId required" });
    }
    const channelIds: number[] = JSON.parse(channelsId);
    for (const id of channelIds) {
      await assertDeviceAccessByChannelId(id, req.user);
    }
    const response = await projectsService.channelSwap(channelsId);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function removeSensorFromChannelHandler(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    await assertDeviceAccessByChannelId(id, req.user);
    const response = await projectsService.removeSensorFromChannel(id);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function updateEmailListHandler(req: AuthRequest, res: Response) {
  try {
    const result = emailSettingSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    await assertProjectAccessByUniqueId(result.data.uniqueId, req.user);
    const project = await prisma.project.findFirst({
      where: { uniqueId: result.data.uniqueId },
      select: { id: true },
    });
    if (!project) throw new BadRequestError("Project not found");
    await assertMayEditProjectMedia(req, project.id);
    const response = await projectsService.updateEmailList(result.data);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function getEmailListHandler(req: AuthRequest, res: Response) {
  try {
    const { uniqueId } = req.params;
    await assertProjectAccessByUniqueId(uniqueId, req.user);
    const response = await projectsService.getEmailList(uniqueId);
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function projectAnalysisHandler(req: AuthRequest, res: Response) {
  try {
    const response = await projectsService.projectAnalysis();
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}
