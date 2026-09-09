import prisma from "../../config/prisma";
import { formatImageUrl, saveBase64Image } from "../../utils/helper";
import {
  ProjectAddInput,
  ProjectUpdateInput,
  ProjectDetailUpdateInput,
  ProjectCodeInput,
  ProjectListQuery,
  ProjectStartQuery,
  ProjectOffsetInput,
  EmailSettingInput,
  ChannelUpdateInput,
  ProjectSetupInput,
} from "./projects.types";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/AppError";
import { sendEmail } from "../../utils/email";
import { logger } from "../../utils/logger";
import { AuthenticatedRequestUser } from "../../types";

/**
 * Ensure the requesting user may access a given project.
 * superadmin: any project; admin: projects they created;
 * contractor: projects where they are contractorId; authority: authorityId.
 */
export async function assertProjectAccess(
  projectId: number,
  user?: AuthenticatedRequestUser,
): Promise<void> {
  if (!user) {
    throw new ForbiddenError("You do not have permission to access this project");
  }
  if (user.userType === "superadmin") return;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { createdBy: true, contractorId: true, authorityId: true },
  });

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  const allowed =
    user.userType === "admin" && project.createdBy === user.id ? true :
    user.userType === "contractor" && project.contractorId === user.id ? true :
    user.userType === "authority" && project.authorityId === user.id ? true :
    false;

  if (!allowed) {
    throw new ForbiddenError("You do not have permission to access this project");
  }
}

/**
 * Same as assertProjectAccess, but resolves the project by its uniqueId string.
 */
export async function assertProjectAccessByUniqueId(
  uniqueId: string,
  user?: AuthenticatedRequestUser,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { uniqueId },
    select: { id: true },
  });
  if (!project) {
    throw new NotFoundError("Project not found");
  }
  await assertProjectAccess(project.id, user);
}

function paginate<T>(data: T[], page: number, limit: number) {
  const totalItems = data.length;
  const totalPages = Math.ceil(totalItems / limit);
  const safePage = Math.min(Math.max(1, page), totalPages || 1);
  const startIndex = (safePage - 1) * limit;
  const currentData = data.slice(startIndex, startIndex + limit);
  return {
    totalItems,
    totalPages,
    currentPage: safePage,
    itemsPerPage: limit,
    currentData,
    hasNextPage: safePage < totalPages,
    hasPrevPage: safePage > 1,
    nextPage: safePage < totalPages ? safePage + 1 : null,
    prevPage: safePage > 1 ? safePage - 1 : null,
    currentItemCount: currentData.length,
  };
}

function isTodayBetweenDates(startDate: Date | null, endDate: Date | null): boolean {
  if (!startDate || !endDate) return false;
  const today = new Date();
  return today >= new Date(startDate) && today <= new Date(endDate);
}

function convertToISTDate(dateStr: Date | string): string {
  const date = new Date(dateStr);
  const options: Intl.DateTimeFormatOptions = { timeZone: "Asia/Kolkata" };
  const istDate = new Date(date.toLocaleString("en-US", options));
  const year = istDate.getFullYear();
  const month = String(istDate.getMonth() + 1).padStart(2, "0");
  const day = String(istDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentDateAndMonth(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${month}${day}`;
}

function getCurrentFinancialYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 4) {
    return `${year}-${String(year + 1).slice(-2)}`;
  }
  return `${year - 1}-${String(year).slice(-2)}`;
}

function generateProjectCode(projectId: number): string {
  return String(projectId).padStart(4, "0");
}

function getFirstThreeLetters(name: string): string {
  return name.replace(/\s+/g, "").substring(0, 3).toUpperCase();
}

async function generateUniqueId(length: number): Promise<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let uniqueId: string;
  let exists = true;

  while (exists) {
    uniqueId = Array.from({ length }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length)),
    ).join("");
    const count = await prisma.project.count({ where: { uniqueId } });
    exists = count > 0;
  }

  return uniqueId!;
}

function getDateGroupFormat(frequency: string | null | undefined): string | null {
  switch (frequency) {
    case "hour":
      return "YYYY-MM-DD HH24:00:00";
    case "day":
      return "YYYY-MM-DD";
    case "week":
      return "YYYY-IW";
    case "month":
      return "YYYY-MM";
    case "year":
      return "YYYY";
    default:
      return null;
  }
}

/**
 * Create or update a project.
 *
 * `tenantId` is a separate argument rather than a field on `input` on purpose:
 * `input` is parsed from the request body, and a tenant id must never come from
 * the client (§17). Making it a distinct parameter means the caller has to have
 * obtained it from the authenticated session.
 */
export async function createProject(input: ProjectAddInput, tenantId: number) {
  const {
    projectId,
    projectName,
    projectUniqueID,
    projectLocation,
    startDate,
    actualStartDate,
    projectLogo,
    endDate,
    contractorId,
    authorityId,
    deviceId,
    createdBy,
  } = input;

  if (!projectId) {
    const existing = await prisma.project.findFirst({
      where: {
        projectName,
        isDelete: false,
        isRegistered: true,
      },
    });

    if (existing) {
      throw new BadRequestError("Project Name already exists");
    }

    if (deviceId) {
      const ongoingProject = await prisma.project.findFirst({
        where: {
          deviceId,
          isDelete: false,
          isRegistered: true,
        } as never,
      });

      if (ongoingProject) {
        const device = await prisma.device.findUnique({
          where: { id: Number(deviceId) },
          select: { isOngoing: true },
        });

        if (device?.isOngoing) {
          throw new BadRequestError("Device is already assigned to a project");
        }
      }
    }

    let imagePath: string | null = null;
    if (projectLogo) {
      imagePath = await saveBase64Image(projectLogo, "project_logo", "uploads/project_logo");
    }

    let sensorIds: string | null = null;
    if (deviceId) {
      const device = await prisma.device.findUnique({
        where: { id: Number(deviceId) },
        select: { assignSensor: true },
      });
      sensorIds = device?.assignSensor ?? null;

      if (!sensorIds || sensorIds.length === 0) {
        throw new BadRequestError("No sensor IDs found for the specified device");
      }
    }

    const uniqueId = await generateUniqueId(10);

    const project = await prisma.project.create({
      data: {
        projectName,
        projectUniqueID: projectUniqueID || null,
        projectLocation,
        startDate: startDate ? new Date(startDate) : new Date(),
        actualStartDate: actualStartDate ? new Date(actualStartDate) : null,
        projectLogo: imagePath,
        endDate: endDate ? new Date(endDate) : null,
        contractorId: contractorId ? Number(contractorId) : null,
        authorityId: authorityId ? Number(authorityId) : null,
        deviceId: deviceId || null,
        sensorId: sensorIds,
        createdBy: createdBy ? Number(createdBy) : 0,
        tenantId,
        uniqueId,
        status: "not_start",
        isDelete: false,
        isRegistered: false,
        offset: 0,
        csvData: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return {
      status_code: 200,
      message: "Project added successfully",
      projectId: project.id,
      uniqueId,
    };
  } else {
    const existing = await prisma.project.findUnique({
      where: { id: Number(projectId) },
    });

    if (!existing) {
      throw new NotFoundError("Project not found");
    }

    let imagePath: string | null = existing.projectLogo;
    if (projectLogo) {
      imagePath = await saveBase64Image(projectLogo, "project_logo", "uploads/project_logo");
    }

    let sensorIds: string | null = existing.sensorId;
    if (deviceId) {
      const device = await prisma.device.findFirst({
        where: { deviceId } as never,
        select: { assignSensor: true },
      });
      sensorIds = device?.assignSensor ?? null;
    }

    if (!sensorIds || sensorIds.length === 0) {
      throw new BadRequestError("No sensor IDs found for the specified device");
    }

    await prisma.project.update({
      where: { id: Number(projectId) },
      data: {
        projectName,
        projectUniqueID: projectUniqueID || existing.projectUniqueID,
        projectLocation,
        startDate: startDate ? new Date(startDate) : existing.startDate,
        actualStartDate: actualStartDate ? new Date(actualStartDate) : existing.actualStartDate,
        projectLogo: imagePath,
        endDate: endDate ? new Date(endDate) : existing.endDate,
        contractorId: contractorId ? Number(contractorId) : existing.contractorId,
        authorityId: authorityId ? Number(authorityId) : existing.authorityId,
        deviceId: deviceId || existing.deviceId,
        sensorId: sensorIds,
        updatedAt: new Date(),
      },
    });

    return {
      status_code: 200,
      message: "Project updated successfully",
      projectId: Number(projectId),
    };
  }
}

export async function updateProjectDetails(projectId: string, input: ProjectDetailUpdateInput) {
  const existing = await prisma.project.findUnique({
    where: { id: Number(projectId) },
    select: { dashImage: true, dashImage2: true },
  });

  if (!existing) {
    throw new NotFoundError("Project not found");
  }

  let dashImagePath = existing.dashImage;
  let dashImage2Path = existing.dashImage2;

  if (input.dashImage) {
    dashImagePath = await saveBase64Image(input.dashImage, `${projectId}_image1`, "uploads/projectImage");
  }

  if (input.dashImage2) {
    dashImage2Path = await saveBase64Image(input.dashImage2, `${projectId}_image2`, "uploads/projectImage");
  }

  await prisma.project.update({
    where: { id: Number(projectId) },
    data: {
      dashImage: dashImagePath,
      dashImage2: dashImage2Path,
      updatedAt: new Date(),
    },
  });

  return { status_code: 200, message: "Project details updated successfully" };
}

export async function createProjectCode(projectId: string, input: ProjectCodeInput) {
  const { adminName, contractorName, authorityName } = input;
  const adminCode = getFirstThreeLetters(adminName);
  const contractorCode = getFirstThreeLetters(contractorName);
  const authorityCode = getFirstThreeLetters(authorityName);

  let newProjectId = Number(projectId);
  let existingCount: number;
  let projectCode: string;

  do {
    projectCode = `CGSL/${adminCode}/${contractorCode}/${authorityCode}/${getCurrentDateAndMonth()}/${getCurrentFinancialYear()}/${generateProjectCode(newProjectId)}`;

    existingCount = await prisma.project.count({
      where: { projectUniqueID: projectCode },
    });

    if (existingCount > 0) {
      newProjectId = newProjectId + 1000;
    }
  } while (existingCount > 0);

  return { status_code: 200, message: "success", projectCode };
}

export async function getProjectDetail(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: Number(projectId) },
    include: {
      creator: {
        select: { firstName: true, lastName: true, profileImage: true },
      },
      contractor: {
        select: { firstName: true, lastName: true },
      },
      authority: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  const device = project.deviceId
    ? await prisma.device.findUnique({
        where: { id: Number(project.deviceId) },
        select: {
          id: true,
          deviceName: true,
          channelCount: true,
          deviceId: true,
          gatewayDeviceId: true,
          updateHeartBeat: true,
          assignSensor: true,
        },
      })
    : null;

  let sensorDetails: unknown[] = [];
  if (project.sensorId) {
    try {
      const sensorIds = JSON.parse(project.sensorId);
      if (Array.isArray(sensorIds) && sensorIds.length > 0) {
        sensorDetails = await prisma.sensor.findMany({
          where: { id: { in: sensorIds.map(Number) } },
          include: { sensorType: true },
        });
      }
    } catch {
      // malformed JSON
    }
  }

  const response = {
    projectId: project.id,
    projectName: project.projectName,
    projectUniqueID: project.projectUniqueID,
    projectLocation: project.projectLocation,
    startDate: project.startDate,
    actualStartDate: project.actualStartDate,
    endDate: project.endDate,
    status: project.status,
    projectLogo: formatImageUrl(project.projectLogo),
    dashImage: formatImageUrl(project.dashImage),
    dashImage2: formatImageUrl(project.dashImage2),
    sensorId: project.sensorId,
    channelCount: device?.channelCount ?? null,
    deviceName: device?.deviceName ?? null,
    deviceId: device?.deviceId ?? null,
    gatewayDeviceId: device?.gatewayDeviceId ?? null,
    updateHeartBeat: device?.updateHeartBeat ?? null,
    sensorList: device?.assignSensor ?? null,
    contactorFirstName: project.contractor?.firstName ?? null,
    contractorLastName: project.contractor?.lastName ?? null,
    authorityFirstName: project.authority?.firstName ?? null,
    authorityLastName: project.authority?.lastName ?? null,
    adminFirstName: project.creator?.firstName ?? null,
    adminLastName: project.creator?.lastName ?? null,
    adminImg: formatImageUrl(project.creator?.profileImage),
    sensorDetails,
    offset: project.offset,
    csvData: project.csvData,
    projectDevice: project.projectDevice,
  };

  return response;
}

export async function getProjectList(adminId: string, query: ProjectListQuery) {
  const { searchTerm, status, page, limit, filterType, startDate, endDate } = query;

  let userType = "";
  if (adminId !== "0") {
    const user = await prisma.user.findUnique({
      where: { id: Number(adminId) },
      select: { userType: true },
    });
    userType = user?.userType ?? "";
  }

  const where: Record<string, unknown> = {
    isDelete: false,
    isRegistered: true,
  };

  if (adminId !== "0") {
    switch (userType) {
      case "contractor":
        where.contractorId = Number(adminId);
        break;
      case "authority":
        where.authorityId = Number(adminId);
        break;
      default:
        where.createdBy = Number(adminId);
        break;
    }
  }

  if (status) {
    where.status = status;
  }

  if (filterType === "created_at" && startDate && endDate) {
    where.createdAt = { gte: new Date(startDate), lte: new Date(endDate) };
  } else if (filterType === "start_date" && startDate && endDate) {
    where.startDate = { gte: new Date(startDate), lte: new Date(endDate) };
  } else if (filterType === "end_date" && startDate && endDate) {
    where.endDate = { gte: new Date(startDate), lte: new Date(endDate) };
  }

  let projects = await prisma.project.findMany({
    where: where as never,
    include: {
      creator: {
        select: { id: true, firstName: true, lastName: true },
      },
      contractor: {
        select: { id: true, firstName: true, lastName: true },
      },
      authority: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    projects = projects.filter(
      (p) =>
        (p.projectUniqueID && p.projectUniqueID.toLowerCase().includes(term)) ||
        p.projectName.toLowerCase().includes(term) ||
        (p.contractor &&
          `${p.contractor.firstName} ${p.contractor.lastName}`.toLowerCase().includes(term)) ||
        (p.authority &&
          `${p.authority.firstName} ${p.authority.lastName}`.toLowerCase().includes(term)) ||
        (p.creator &&
          `${p.creator.firstName} ${p.creator.lastName}`.toLowerCase().includes(term)),
    );
  }

  if (!projects.length) {
    throw new NotFoundError("Projects not found");
  }

  const devices = await prisma.device.findMany({
    where: { isDelete: "false_" as never },
    select: { id: true, deviceName: true, assignSensor: true },
  });

  const enriched = projects.map((p) => {
    const device = p.deviceId ? devices.find((d) => d.id === Number(p.deviceId)) : null;
    let deviceName = device?.deviceName ?? null;

    if (!deviceName && p.projectDevice) {
      try {
        const pd = JSON.parse(String(p.projectDevice));
        deviceName = pd?.deviceDetails?.deviceName ?? null;
      } catch {
        // ignore
      }
    }

    const isProjectRunning = isTodayBetweenDates(p.startDate, p.endDate);

    let sensorDetails: unknown[] = [];
    if (p.sensorId) {
      try {
        const ids = JSON.parse(p.sensorId);
        if (Array.isArray(ids)) {
          sensorDetails = ids.map((id: number) => ({ id }));
        }
      } catch {
        // ignore
      }
    }

    return {
      projectId: p.id,
      uniqueId: p.uniqueId,
      offset: p.offset,
      csvData: p.csvData,
      projectName: p.projectName,
      projectUniqueID: p.projectUniqueID,
      projectLocation: p.projectLocation,
      startDate: p.startDate,
      actualStartDate: p.actualStartDate,
      projectLogo: formatImageUrl(p.projectLogo),
      endDate: p.endDate,
      deviceId: p.deviceId,
      deviceName,
      dashImage: formatImageUrl(p.dashImage),
      dashImage2: formatImageUrl(p.dashImage2),
      status: p.status,
      createdAt: p.createdAt,
      contractorId: p.contractor?.id ?? null,
      contactorFirstName: p.contractor?.firstName ?? null,
      contractorLastName: p.contractor?.lastName ?? null,
      authorityId: p.authority?.id ?? null,
      authorityFirstName: p.authority?.firstName ?? null,
      authorityLastName: p.authority?.lastName ?? null,
      adminId: p.creator?.id ?? null,
      adminFirstName: p.creator?.firstName ?? null,
      adminLastName: p.creator?.lastName ?? null,
      channelCount: device ? null : null,
      sensorDetails,
      isProjectRunning,
    };
  });

  return paginate(enriched, page, limit);
}

export async function getProjectStatus(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: Number(projectId) },
    select: { status: true },
  });

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  return { status_code: 200, message: "success", projectStatus: project.status };
}

export async function projectStart(projectId: string, query: ProjectStartQuery) {
  const project = await prisma.project.findUnique({
    where: { id: Number(projectId) },
  });

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  const { statusType } = query;

  if (statusType === "pause") {
    await prisma.project.update({
      where: { id: Number(projectId) },
      data: { status: "pause", updatedAt: new Date() },
    });
    return { status_code: 200, message: "success", projectStatus: "1" };
  }

  await sendEmailStartEnd(projectId, statusType);

  if (statusType === "end" && project.deviceId) {
    const deviceData = await getDeviceData(project.deviceId);

    await prisma.device.update({
      where: { id: Number(project.deviceId) },
      data: { isOngoing: false },
    });

    await prisma.project.update({
      where: { id: Number(projectId) },
      data: {
        status: "end",
        projectDevice: deviceData as never,
        deviceId: null,
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.project.update({
      where: { id: Number(projectId) },
      data: { status: statusType, updatedAt: new Date() },
    });
  }

  return { status_code: 200, message: "success", projectStatus: "" };
}

export async function deleteProjectById(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: Number(projectId) },
    select: { status: true, deviceId: true },
  });

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  if (project.status !== "end" && project.deviceId) {
    await prisma.device.update({
      where: { id: Number(project.deviceId) },
      data: { isOngoing: false },
    });
  }

  await prisma.project.update({
    where: { id: Number(projectId) },
    data: {
      isDelete: true,
      deviceId: null,
      updatedAt: new Date(),
    },
  });

  return { status_code: 200, message: "Success" };
}

export async function projectOffsetById(projectId: string, input: ProjectOffsetInput) {
  await prisma.project.update({
    where: { id: Number(projectId) },
    data: {
      offset: input.offset,
      updatedAt: new Date(),
    },
  });

  return { status_code: 200, message: "Success" };
}

export async function dashboardData(uniqueId: string) {
  const project = await prisma.project.findFirst({
    where: {
      uniqueId,
      isRegistered: true,
      isDelete: false,
    },
    include: {
      creator: {
        select: { firstName: true, lastName: true, profileImage: true },
      },
      contractor: {
        select: { firstName: true, lastName: true, profileImage: true },
      },
      authority: {
        select: { firstName: true, lastName: true, profileImage: true },
      },
    },
  });

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  const device = project.deviceId
    ? await prisma.device.findUnique({
        where: { id: Number(project.deviceId) },
      })
    : null;

  const channels = device
    ? await prisma.deviceChannel.findMany({
        where: { deviceId: String(device.id) },
      })
    : [];

  const enrichedChannels = channels.map((ch) => ({
    ...ch,
    sensorIcon: ch.assignSensor ? undefined : undefined,
  }));

  const superAdmin = await prisma.user.findFirst({
    where: { userType: "superadmin" },
    select: { profileImage: true },
  });

  const projectData = {
    projectId: project.id,
    uniqueId: project.uniqueId,
    projectName: project.projectName,
    offset: project.offset,
    projectStatus: project.status,
    projectUniqueID: project.projectUniqueID,
    csvData: project.csvData,
    channelCount: device?.channelCount ?? 0,
    dashImage: formatImageUrl(project.dashImage),
    dashImage2: formatImageUrl(project.dashImage2),
    contractorImg: formatImageUrl(project.contractor?.profileImage),
    authorityImg: formatImageUrl(project.authority?.profileImage),
    adminImg: formatImageUrl(project.creator?.profileImage),
    superAdminImage: formatImageUrl(superAdmin?.profileImage),
    sensorList: device?.assignSensor ?? null,
    deviceId: project.deviceId,
    gatewayDeviceId: device?.gatewayDeviceId ?? null,
    dId: device?.deviceId ?? null,
    adminFirstName: project.creator?.firstName ?? null,
    adminLastName: project.creator?.lastName ?? null,
    contractorFirstName: project.contractor?.firstName ?? null,
    contractorLastName: project.contractor?.lastName ?? null,
    deviceName: device?.deviceName ?? null,
    authorityFirstName: project.authority?.firstName ?? null,
    authorityLastName: project.authority?.lastName ?? null,
    startDate: project.startDate,
    actualStartDate: project.actualStartDate,
    projectLocation: project.projectLocation,
    endDate: project.endDate,
    updateHeartBeat: device?.updateHeartBeat ?? null,
    deviceChannels: enrichedChannels,
  };

  return projectData;
}

export async function projectSetup(projectId: string, input: ProjectSetupInput) {
  await prisma.project.update({
    where: { id: Number(projectId) },
    data: { isRegistered: true },
  });

  if (input.deviceId) {
    await prisma.device.update({
      where: { id: Number(input.deviceId) },
      data: { isOngoing: true },
    });
  }

  return { status_code: 200, message: "success" };
}

export async function channelListByDeviceId(deviceId: string, page: number, limit: number) {
  const channels = await prisma.deviceChannel.findMany({
    where: { deviceId },
    orderBy: { id: "asc" },
  });

  const enriched = await Promise.all(
    channels.map(async (ch) => {
      let sensor: Record<string, unknown> | null = null;
      let sensorType: Record<string, unknown> | null = null;
      let updatedByUser: { firstName: string; lastName: string } | null = null;

      if (ch.assignSensor) {
        const s = await prisma.sensor.findUnique({
          where: { id: Number(ch.assignSensor) },
          include: { sensorType: true },
        });
        if (s) {
          sensor = s as unknown as Record<string, unknown>;
          sensorType = s.sensorType as unknown as Record<string, unknown>;
        }
      }

      const device = await prisma.device.findFirst({
        where: { id: Number(deviceId) },
        select: { updatedBy: true, updatedAt: true },
      });

      if (device?.updatedBy) {
        updatedByUser = await prisma.user.findUnique({
          where: { id: device.updatedBy },
          select: { firstName: true, lastName: true },
        });
      }

      return {
        channelId: ch.id,
        channelNumber: ch.channelNumber,
        channelName: ch.channelName,
        triggerValue: ch.triggerValue,
        thresholdValue: ch.thresholdValue,
        activeStatus: ch.activeStatus,
        assignSensor: ch.assignSensor,
        unit: sensor?.unit ?? null,
        sensorName: sensor?.sensorName ?? null,
        sensorCalibrationValue: sensor?.calibrationValue ?? null,
        sensorTypeName: sensorType?.sensorType ?? null,
        sensorIcon: formatImageUrl(sensorType?.sensorIcon as string),
        sensorTypeCalibrationValue: sensorType?.calibrationValue ?? null,
      };
    }),
  );

  const lastUpdateBy = enriched.length
    ? `${(await prisma.user.findUnique({ where: { id: (await prisma.device.findFirst({ where: { id: Number(deviceId) } }))?.updatedBy ?? 0 } }))?.firstName ?? ""} ${(await prisma.user.findUnique({ where: { id: (await prisma.device.findFirst({ where: { id: Number(deviceId) } }))?.updatedBy ?? 0 } }))?.lastName ?? ""}`
    : null;
  const lastUpdateAt = enriched.length
    ? (await prisma.device.findFirst({ where: { id: Number(deviceId) } }))?.updatedAt
    : null;

  const paginatedData = paginate(enriched, page, limit);

  return {
    status_code: 200,
    success: "success",
    error: null,
    lastUpdateBy,
    lastUpdateAt,
    projectDetail: paginatedData,
  };
}

export async function channelListUpdate(input: ChannelUpdateInput) {
  for (const update of input.channelUpdate) {
    const { channelId, sensorId, sensorName, triggeredValue, thresholdValue } = update;

    if (sensorName) {
      await prisma.sensor.update({
        where: { id: Number(sensorId) },
        data: { sensorName },
      });
    }

    await prisma.deviceChannel.update({
      where: { id: Number(channelId) },
      data: {
        triggerValue: triggeredValue ?? null,
        thresholdValue: thresholdValue ?? null,
      },
    });
  }

  return { status_code: 200, message: "success", projectDetail: "Update Successful" };
}

export async function channelSwap(channelsId: string) {
  const channelIds: string[] = JSON.parse(channelsId);

  if (!channelIds || channelIds.length !== 2) {
    throw new BadRequestError("Two sensor required");
  }

  const channelData = await prisma.deviceChannel.findMany({
    where: { id: { in: channelIds.map(Number) } },
  });

  if (channelData.length !== 2) {
    throw new BadRequestError("Both channels not found");
  }

  const [ch0, ch1] = channelData;

  await prisma.deviceChannel.update({
    where: { id: Number(channelIds[0]) },
    data: {
      assignSensor: ch1.assignSensor,
      triggerValue: ch1.triggerValue,
      thresholdValue: ch1.thresholdValue,
      activeStatus: ch1.activeStatus,
    },
  });

  await prisma.deviceChannel.update({
    where: { id: Number(channelIds[1]) },
    data: {
      assignSensor: ch0.assignSensor,
      triggerValue: ch0.triggerValue,
      thresholdValue: ch0.thresholdValue,
      activeStatus: ch0.activeStatus,
    },
  });

  return { status_code: 200, message: "success", projectDetail: "Update Successful" };
}

export async function removeSensorFromChannel(channelId: string) {
  const channel = await prisma.deviceChannel.findUnique({
    where: { id: Number(channelId) },
  });

  if (!channel) {
    throw new BadRequestError("Channel not found");
  }

  const deviceId = channel.deviceId;
  const sensorId = channel.assignSensor;

  if (!deviceId || !sensorId) {
    throw new BadRequestError("Device or sensor not found");
  }

  const device = await prisma.device.findUnique({
    where: { id: Number(deviceId) },
    select: { assignSensor: true },
  });

  if (!device?.assignSensor) {
    throw new BadRequestError("Sensor not found");
  }

  let sensorsId: number[] = JSON.parse(device.assignSensor);
  const sensorIdNum = Number(sensorId);

  if (sensorsId.includes(sensorIdNum)) {
    sensorsId = sensorsId.filter((id) => id !== sensorIdNum);
  }

  await prisma.device.update({
    where: { id: Number(deviceId) },
    data: { assignSensor: JSON.stringify(sensorsId) },
  });

  await prisma.deviceChannel.update({
    where: { id: Number(channelId) },
    data: {
      assignSensor: null,
      triggerValue: null,
      thresholdValue: null,
      activeStatus: "zero" as never,
    },
  });

  return { status_code: 200, message: "success", projectDetail: "Channel removed successfully" };
}

export async function updateEmailList(input: EmailSettingInput) {
  const { uniqueId, emails } = input;

  const project = await prisma.project.findFirst({
    where: { uniqueId },
    select: { id: true },
  });

  if (!project) {
    throw new BadRequestError("Project not found");
  }

  const projectId = project.id;

  const existingEmails = await prisma.projectEmail.findMany({
    where: { projectId },
    select: { id: true },
  });

  const existingIds = existingEmails.map((e) => e.id);
  const incomingIds = emails.map((e) => e.emailId);

  const toDelete = existingIds.filter((id) => !incomingIds.includes(id));

  if (toDelete.length > 0) {
    await prisma.projectEmail.deleteMany({
      where: { id: { in: toDelete } },
    });
  }

  for (const email of emails) {
    if (existingIds.includes(email.emailId)) {
      await prisma.projectEmail.update({
        where: { id: email.emailId },
        data: { isEnable: email.isEnable },
      });
    } else {
      await prisma.projectEmail.create({
        data: {
          email: String(email.emailId),
          isEnable: email.isEnable,
          projectId,
        },
      });
    }
  }

  return { status_code: 200, message: "success", error: "" };
}

export async function getEmailList(uniqueId: string) {
  const project = await prisma.project.findFirst({
    where: { uniqueId },
    select: { id: true },
  });

  if (!project) {
    throw new BadRequestError("Project not found");
  }

  const emails = await prisma.projectEmail.findMany({
    where: { projectId: project.id },
  });

  return { status_code: 200, message: "success", data: emails };
}

export async function projectAnalysis() {
  const currentDate = convertToISTDate(new Date());

  const projects = await prisma.project.findMany({
    where: {
      isDelete: false,
      isRegistered: true,
      status: { not: "end" },
    },
  });

  const toStartProjects: typeof projects = [];
  const toEndProjects: typeof projects = [];

  for (const project of projects) {
    const actualStartDate = project.actualStartDate ? convertToISTDate(project.actualStartDate) : null;
    const endDate = project.endDate ? convertToISTDate(project.endDate) : null;

    if (currentDate === actualStartDate && project.status === "not_start") {
      toStartProjects.push(project);
    } else if (currentDate === endDate && project.status !== "end") {
      toEndProjects.push(project);
    }
  }

  const emailPromises: Promise<boolean>[] = [];

  if (toStartProjects.length > 0) {
    const startIds = toStartProjects.map((p) => p.id);
    await prisma.project.updateMany({
      where: { id: { in: startIds } },
      data: { status: "start" },
    });

    for (const project of toStartProjects) {
      emailPromises.push(sendEmailStartEnd(project.id.toString(), "start"));
    }
  }

  if (toEndProjects.length > 0) {
    for (const project of toEndProjects) {
      if (project.deviceId) {
        const deviceData = await getDeviceData(project.deviceId);

        await prisma.device.update({
          where: { id: Number(project.deviceId) },
          data: { isOngoing: false },
        });

        await prisma.project.update({
          where: { id: project.id },
          data: {
            status: "end",
            projectDevice: deviceData as never,
            deviceId: null,
          },
        });
      }

      emailPromises.push(sendEmailStartEnd(project.id.toString(), "end"));
    }
  }

  await Promise.all(emailPromises);

  return { status_code: 200, message: "PROJECT ANALYSIS COMPLETED" };
}

async function getDeviceData(deviceId: string) {
  const device = await prisma.device.findUnique({
    where: { id: Number(deviceId) },
  });

  if (!device) {
    throw new Error("Device not found");
  }

  const channels = await prisma.deviceChannel.findMany({
    where: { deviceId },
    orderBy: { id: "asc" },
  });

  const enrichedChannels = await Promise.all(
    channels.map(async (ch) => {
      let sensor: Record<string, unknown> | null = null;
      let sensorType: Record<string, unknown> | null = null;

      if (ch.assignSensor) {
        const s = await prisma.sensor.findUnique({
          where: { id: Number(ch.assignSensor) },
          include: { sensorType: true },
        });
        if (s) {
          sensor = s as unknown as Record<string, unknown>;
          sensorType = s.sensorType as unknown as Record<string, unknown>;
        }
      }

      return {
        channelId: ch.id,
        channelNumber: ch.channelNumber,
        channelName: ch.channelName,
        triggerValue: ch.triggerValue,
        thresholdValue: ch.thresholdValue,
        activeStatus: ch.activeStatus,
        assignSensor: ch.assignSensor,
        sensorName: sensor?.sensorName ?? null,
        sensorCalibrationValue: sensor?.calibrationValue ?? null,
        sensorTypeName: sensorType?.sensorType ?? null,
        sensorIcon: formatImageUrl(sensorType?.sensorIcon as string),
        unit: sensorType?.unit ?? null,
        sensorTypeCalibrationValue: sensorType?.calibrationValue ?? null,
      };
    }),
  );

  const machineId = device.deviceId;

  return {
    machineDeviceId: machineId,
    deviceDetails: {
      deviceName: device.deviceName,
      deviceType: device.deviceType,
      channelCount: device.channelCount,
      deviceId: device.id,
      gatewayDeviceId: device.gatewayDeviceId,
      deviceStatus: device.deviceStatus,
      deviceStartDate: device.deviceStartDate,
      deviceAssignSensor: device.assignSensor,
      deviceCreatedAt: device.createdAt,
      updateHeartBeat: device.updateHeartBeat,
    },
    deviceChannels: enrichedChannels,
  };
}

async function sendEmailStartEnd(projectId: string, statusType: string): Promise<boolean> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: Number(projectId) },
      include: {
        creator: {
          select: { firstName: true, lastName: true },
        },
        contractor: {
          select: { firstName: true, lastName: true },
        },
        authority: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    if (!project) return false;

    const device = project.deviceId
      ? await prisma.device.findUnique({
          where: { id: Number(project.deviceId) },
        })
      : null;

    let sensorData: Record<string, unknown>[] = [];
    if (device?.assignSensor) {
      try {
        const sensorIds = JSON.parse(device.assignSensor);
        if (Array.isArray(sensorIds) && sensorIds.length > 0) {
          const channels = await prisma.deviceChannel.findMany({
            where: {
              assignSensor: { in: sensorIds.map(String) },
              activeStatus: "one" as never,
            },
          });
          sensorData = channels.map((ch) => ({
            sensorName: ch.channelName,
            channelNumber: ch.channelNumber,
            triggerValue: ch.triggerValue,
            thresholdValue: ch.thresholdValue,
          }));
        }
      } catch {
        // ignore
      }
    }

    const emails = await prisma.projectEmail.findMany({
      where: { projectId: Number(projectId), isEnable: true },
      select: { email: true },
    });

    const emailList = emails.map((e) => e.email).join(",");

    if (!emailList) return true;

    const statusMessage =
      statusType === "start"
        ? `<div style="color: green; font-weight: bold;">The project has been started.</div>`
        : `<div style="color: red; font-weight: bold;">The project has been ended.</div>`;

    const sensorDetails = sensorData
      .map(
        (s, i) => `
        (${i + 1}) ${s.channelNumber || "N/A"}
        <ul>
            <li><strong>Name:</strong> ${s.sensorName || "N/A"}</li>
            <li><strong>Triggered Value:</strong> ${s.triggerValue || "N/A"}</li>
            <li><strong>Threshold Value:</strong> ${s.thresholdValue || "N/A"}</li>
        </ul>`,
      )
      .join("");

    const htmlMessage = `
      <html><body>
        ${statusMessage}
        <p><strong>Project Details:</strong></p>
        <ul>
          <li><strong>Project Name:</strong> ${project.projectName}</li>
          <li><strong>Project Unique Id:</strong> ${project.projectUniqueID}</li>
          <li><strong>Admin Name:</strong> ${project.creator.firstName} ${project.creator.lastName}</li>
          <li><strong>Contractor Name:</strong> ${project.contractor?.firstName ?? ""} ${project.contractor?.lastName ?? ""}</li>
          <li><strong>Authority Name:</strong> ${project.authority?.firstName ?? ""} ${project.authority?.lastName ?? ""}</li>
        </ul>
        <p><strong>Device Details:</strong></p>
        <ul>
          <li><strong>Device Id:</strong> ${device?.id ?? "N/A"}</li>
          <li><strong>Name:</strong> ${device?.deviceName ?? "N/A"}</li>
          <li><strong>Channels:</strong> ${device?.channelCount ?? "N/A"}</li>
        </ul>
        <p><strong>Channel Details:</strong></p>
        ${sensorDetails}
        <p>Please review the sensor data and take appropriate action.</p>
        <p><em>This is a system-generated email. Please do not reply.</em></p>
      </body></html>
    `;

    const emailHeading = `Project: ${project.projectName} has been ${statusType === "start" ? "started" : "ended"}`;

    await sendEmail({
      to: "",
      subject: emailHeading,
      html: htmlMessage,
      bcc: emailList,
    });

    return true;
  } catch (err) {
    logger.error("Error sending project start/end email", err as Error);
    return false;
  }
}
