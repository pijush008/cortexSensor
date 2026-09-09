import { Response } from "express";
import { AuthRequest } from "../../middleware/auth";
import * as projectsService from "./projects.service";
import { assertProjectAccess } from "./projects.service";
import prisma from "../../config/prisma";
import { BadRequestError } from "../../utils/AppError";
import { auditLogger } from "../../utils/audit";
import { assertWithinLimits, resolveSubscriptionAdminId } from "../subscription/subscription.service";
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

export async function createNewProject(req: AuthRequest, res: Response) {
  try {
    const result = projectAddSchema.safeParse(req.body);
    if (!result.success) {
      const errorMessage = result.error.errors[0].message.replace(/"/g, "");
      return res.status(400).json({ status_code: 400, message: errorMessage });
    }
    // Enforce the tenant's billing plan before provisioning a new structure.
    const billingAdminId = await resolveSubscriptionAdminId(req.user!);
    await assertWithinLimits(billingAdminId, { structures: 1 });
    const response = await projectsService.createProject(result.data);
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
    return res.status(200).json(response);
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
    const response = await projectsService.createProject({
      ...result.data,
      projectId: result.data.projectId,
    } as never);
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
    return res.status(200).json(response);
  } catch (error) {
    return handleControllerError(res, error);
  }
}

export async function updateProjectDetail(req: AuthRequest, res: Response) {
  try {
    const { projectId } = req.params;
    await assertProjectAccess(Number(projectId), req.user);
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
