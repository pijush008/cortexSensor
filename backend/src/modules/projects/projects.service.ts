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

/**
 * The project's visible identifier, built server-side.
 *
 * This used to come from the CLIENT: projectAddSchema accepted
 * projectUniqueID, the create form had a free-text box for it, and the update
 * branch overwrote it with whatever was sent. So the identifier people quote
 * was neither guaranteed unique nor stable — two projects could carry the same
 * code, and a project's code could change under anyone already using it.
 *
 * The format is the established business one. Segments for a contractor or an
 * authority are OMITTED when that party is not assigned, rather than padded
 * with a placeholder, so a code never implies a party that does not exist.
 *
 * The loop is what makes it unique: a collision advances the sequence and tries
 * again, the same technique createProjectCode already used.
 */
async function buildProjectUniqueID(params: {
  projectId: number;
  adminName: string | null;
  contractorName: string | null;
  authorityName: string | null;
}): Promise<string> {
  const parts = [params.adminName, params.contractorName, params.authorityName]
    .filter((n): n is string => Boolean(n && n.trim()))
    .map(getFirstThreeLetters);

  let sequence = params.projectId;
  for (;;) {
    const code = [
      "CGSL",
      ...parts,
      getCurrentDateAndMonth(),
      getCurrentFinancialYear(),
      generateProjectCode(sequence),
    ].join("/");

    const clash = await prisma.project.count({
      where: { projectUniqueID: code },
    });
    if (clash === 0) return code;
    sequence += 1000;
  }
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
    // Unique WITHIN THE ORGANIZATION, not across the platform.
    //
    // This query had no tenantId, so a name taken by any customer anywhere
    // blocked it for everyone: one organization monitoring a bridge it calls
    // "Kolkata" stopped every other organization from using that name. It also
    // answered a question nobody should be able to ask — whether some other
    // company happens to use a given project name — which is the kind of
    // cross-tenant disclosure tenantId exists to prevent (§17).
    //
    // It went unnoticed because the check also required isRegistered: true,
    // and until projects began to be created registered it matched nothing at
    // all.
    const existing = await prisma.project.findFirst({
      where: {
        projectName,
        tenantId,
        isDelete: false,
        isRegistered: true,
      },
    });

    if (existing) {
      throw new BadRequestError("Project Name already exists");
    }

    // A device is one cabinet in one place, so it serves one live project at a
    // time. Both conditions are read here and the claim is written below in the
    // SAME transaction as the project insert: checking availability in one
    // statement and claiming in another lets two simultaneous creations both
    // pass the check and both take the same hardware.
    //
    // This check could not fire at all before. It asked whether the device was
    // isOngoing, and the only code that ever set that to true was
    // `projectSetup` — the legacy "now attach a device" step the current
    // frontend does not call — so the flag was released on project end and
    // never once claimed.
    let sensorIds: string | null = null;
    if (deviceId) {
      const device = await prisma.device.findUnique({
        where: { id: Number(deviceId) },
        select: { isOngoing: true, assignSensor: true },
      });

      if (!device) {
        throw new BadRequestError("Device not found");
      }

      if (device.isOngoing) {
        throw new BadRequestError("Device is already assigned to a project");
      }

      sensorIds = device.assignSensor ?? null;
      if (!sensorIds || sensorIds.length === 0) {
        throw new BadRequestError("No sensor IDs found for the specified device");
      }
    }

    let imagePath: string | null = null;
    if (projectLogo) {
      imagePath = await saveBase64Image(projectLogo, "project_logo", "uploads/project_logo");
    }

    const uniqueId = await generateUniqueId(10);

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
      data: {
        projectName,
        // Assigned immediately below, once the row has an id to sequence from.
        projectUniqueID: null,
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
        // A created project is a real project.
        //
        // This was false, and every read path — the list, the dashboard, the
        // scheduled status sweep, the duplicate-name and device-in-use checks —
        // requires it to be true. The only code that ever set it is
        // `projectSetup`, the legacy "now attach a device" step of a two-stage
        // wizard that the current frontend does not have and never calls. So a
        // project created from the UI was filed as a draft that no screen would
        // show and no second step would ever complete: created successfully,
        // invisible forever.
        //
        // There is no pending stage for a project created here to be waiting
        // on, so it is registered on creation. `projectSetup` still sets it and
        // remains harmless — setting true on a row that is already true.
        isRegistered: true,
        offset: 0,
        csvData: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      });

      // The claim, in the same transaction as the insert that depends on it.
      // Released again when the project ends or is deleted.
      if (deviceId) {
        await tx.device.update({
          where: { id: Number(deviceId) },
          data: { isOngoing: true },
        });
      }

      return created;
    });

    // Built after the insert because the sequence segment is the row's own id.
    // The parties are read back from the database rather than taken from the
    // request, so the code always describes who is actually on the project.
    const [creator, contractor, authority] = await Promise.all([
      project.createdBy
        ? prisma.user.findUnique({
            where: { id: project.createdBy },
            select: { firstName: true, lastName: true },
          })
        : null,
      project.contractorId
        ? prisma.user.findUnique({
            where: { id: project.contractorId },
            select: { firstName: true, lastName: true },
          })
        : null,
      project.authorityId
        ? prisma.user.findUnique({
            where: { id: project.authorityId },
            select: { firstName: true, lastName: true },
          })
        : null,
    ]);

    const fullName = (u: { firstName: string | null; lastName: string | null } | null) =>
      u ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || null : null;

    const generatedCode = await buildProjectUniqueID({
      projectId: project.id,
      adminName: fullName(creator),
      contractorName: fullName(contractor),
      authorityName: fullName(authority),
    });

    await prisma.project.update({
      where: { id: project.id },
      data: { projectUniqueID: generatedCode },
    });

    return {
      status_code: 200,
      message: "Project added successfully",
      projectId: project.id,
      uniqueId,
      projectUniqueID: generatedCode,
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
      // BY ROW ID, as the create branch does.
      //
      // This looked the device up with `where: { deviceId }`, which matches
      // Device.deviceId — the SERIAL NUMBER. The value passed is
      // Project.deviceId, which holds the device's row id as a string. So it
      // searched for a device whose serial equalled an id, found none, and
      // threw "No sensor IDs found" for every project that had a device.
      // Unreachable from the UI, which has no edit form, but wrong wherever it
      // is called from.
      const device = await prisma.device.findUnique({
        where: { id: Number(deviceId) },
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
        // NOT updatable. The project ID is quoted in reports, correspondence
        // and URLs; letting an edit change it would silently invalidate every
        // existing reference to the project.
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
      // undefined leaves it untouched; an empty string clears it, which is how
      // a feed is taken down without disturbing the project image.
      liveVideoUrl:
        input.liveVideoUrl === undefined || input.liveVideoUrl === null
          ? undefined
          : input.liveVideoUrl === ""
            ? null
            : input.liveVideoUrl,
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
        select: {
          firstName: true,
          lastName: true,
          profileImage: true,
          companyLogo: true,
        },
      },
      contractor: {
        select: {
          firstName: true,
          lastName: true,
          profileImage: true,
          companyLogo: true,
        },
      },
      authority: {
        select: {
          firstName: true,
          lastName: true,
          profileImage: true,
          companyLogo: true,
        },
      },
      tenant: { select: { logoPath: true } },
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
    contractorFirstName: project.contractor?.firstName ?? null,
    contractorLastName: project.contractor?.lastName ?? null,
    authorityFirstName: project.authority?.firstName ?? null,
    authorityLastName: project.authority?.lastName ?? null,
    adminFirstName: project.creator?.firstName ?? null,
    adminLastName: project.creator?.lastName ?? null,
    // The same rule the dashboard emblems use, and for the same reason: this
    // mapping existing in two places is how one of them goes stale.
    contractorImg: partyEmblem(project.contractor),
    authorityImg: partyEmblem(project.authority),
    adminImg:
      partyEmblem(project.creator) ?? formatImageUrl(project.tenant?.logoPath),
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
      case "viewer":
        // A self-service viewer browses the whole directory, so no ownership
        // filter is applied. Only the directory: the per-project endpoints that
        // return measurements refuse this session separately.
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
        // Location was missing here, so searching for a town or site name found
        // nothing even though every project carries one.
        (p.projectLocation && p.projectLocation.toLowerCase().includes(term)) ||
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
      contractorFirstName: p.contractor?.firstName ?? null,
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

/**
 * What a project may do next, given where it is.
 *
 * The server accepted any transition from any state, which let a project be
 * paused before it started, ended twice, or restarted after ending. The last
 * mattered most: ending RELEASES THE DEVICE and clears deviceId, so a restarted
 * project collects nothing and its hardware may already belong to another
 * project. Ending also emails the stakeholders, so an end/start/end cycle mails
 * them each time.
 *
 * "end -> pause" is the reopen path. It lands in PAUSED rather than running
 * precisely because the device is gone: the project must be given hardware
 * before it can collect again, and resuming straight to running would claim to
 * be monitoring a structure while attached to nothing.
 */
const ALLOWED_TRANSITIONS: Record<string, readonly ProjectStartQuery["statusType"][]> = {
  not_start: ["start"],
  start: ["pause", "end"],
  pause: ["start", "end"],
  end: ["pause"],
};

/** Why a particular move is refused, in words the person can act on. */
function transitionRefusal(from: string, to: string): string {
  if (from === "not_start") {
    return `This project has not started yet, so it cannot be ${to === "end" ? "ended" : "paused"}. Start it first.`;
  }
  if (from === "end") {
    return to === "end"
      ? "This project has already ended."
      : "This project has ended. Reopen it first, then attach a device before starting it again.";
  }
  if (from === "start" && to === "start") {
    return "This project is already running.";
  }
  if (from === "pause" && to === "pause") {
    return "This project is already paused.";
  }
  return `A ${from} project cannot be moved to ${to}.`;
}

export async function projectStart(projectId: string, query: ProjectStartQuery) {
  const project = await prisma.project.findUnique({
    where: { id: Number(projectId) },
  });

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  const { statusType } = query;

  // Checked BEFORE anything is written or emailed: a refused move must leave
  // the project exactly as it was, with no notification sent.
  const allowed = ALLOWED_TRANSITIONS[project.status] ?? [];
  if (!allowed.includes(statusType)) {
    throw new BadRequestError(transitionRefusal(project.status, statusType));
  }

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

/**
 * The logo shown for one party to a project.
 *
 * companyLogo is what the platform actually records: the invitation flow
 * collects it when an administrator sets up a contractor or authority, and the
 * profile page edits it. profileImage predates it and is a PERSONAL avatar, so
 * it is only a fallback for accounts that set one before company logos existed.
 *
 * Reading profileImage alone is what left every emblem on the dashboard showing
 * initials while a perfectly good logo sat one column over.
 */
function partyEmblem(
  party: { companyLogo?: string | null; profileImage?: string | null } | null | undefined,
): string | null {
  if (!party) return null;
  return formatImageUrl(party.companyLogo ?? party.profileImage);
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
        select: {
          firstName: true,
          lastName: true,
          profileImage: true,
          companyLogo: true,
        },
      },
      contractor: {
        select: {
          firstName: true,
          lastName: true,
          profileImage: true,
          companyLogo: true,
        },
      },
      authority: {
        select: {
          firstName: true,
          lastName: true,
          profileImage: true,
          companyLogo: true,
        },
      },
      // The admin's last resort: an organization supplies a logo at
      // registration, so an admin should not have to upload the same image
      // twice for it to appear beside their own project.
      tenant: { select: { logoPath: true } },
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
    select: { profileImage: true, companyLogo: true },
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
    liveVideoUrl: project.liveVideoUrl,
    contractorId: project.contractorId,
    // The emblem row at the top of the dashboard.
    //
    // companyLogo FIRST: that is the column the invitation flow writes and the
    // profile page edits, so it is where a real logo lives. profileImage is the
    // older personal avatar and is kept only as a fallback for accounts that
    // set one before company logos existed. Reading profileImage alone left
    // every emblem showing initials while a logo sat unused one column over.
    contractorImg: partyEmblem(project.contractor),
    authorityImg: partyEmblem(project.authority),
    // The admin additionally falls back to their organization's logo.
    adminImg:
      partyEmblem(project.creator) ?? formatImageUrl(project.tenant?.logoPath),
    superAdminImage: partyEmblem(superAdmin),
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
    const { channelId, sensorId, sensorName, triggeredValue, thresholdValue, isActive } =
      update;

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
        // Left untouched when the caller does not send it, so editing a
        // threshold cannot switch a channel off as a side effect.
        ...(isActive === undefined
          ? {}
          : { activeStatus: (isActive ? "one" : "zero") as never }),
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
  const incomingIds = emails
    .map((e) => e.emailId)
    .filter((id): id is number => typeof id === "number");

  const toDelete = existingIds.filter((id) => !incomingIds.includes(id));

  if (toDelete.length > 0) {
    await prisma.projectEmail.deleteMany({
      where: { id: { in: toDelete } },
    });
  }

  for (const entry of emails) {
    if (entry.emailId !== undefined && existingIds.includes(entry.emailId)) {
      await prisma.projectEmail.update({
        where: { id: entry.emailId },
        data: {
          isEnable: entry.isEnable,
          ...(entry.email ? { email: entry.email.trim() } : {}),
          ...(entry.name !== undefined ? { name: entry.name?.trim() || null } : {}),
        },
      });
      continue;
    }

    // A new recipient. Without an address there is nothing deliverable to
    // store, so the entry is skipped rather than written as a placeholder —
    // this is exactly where the id used to be stored as the email.
    const address = entry.email?.trim();
    if (!address) continue;

    // The same person twice would simply be mailed twice.
    const duplicate = await prisma.projectEmail.findFirst({
      where: { projectId, email: address },
      select: { id: true },
    });
    if (duplicate) {
      await prisma.projectEmail.update({
        where: { id: duplicate.id },
        data: {
          isEnable: entry.isEnable,
          ...(entry.name !== undefined ? { name: entry.name?.trim() || null } : {}),
        },
      });
      continue;
    }

    await prisma.projectEmail.create({
      data: {
        email: address,
        name: entry.name?.trim() || null,
        isEnable: entry.isEnable,
        projectId,
      },
    });
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

/**
 * The devices this project could be given.
 *
 * Scoped to the project's OWN organization, read from the project rather than
 * named by the caller: a device chooser must never be able to list hardware
 * belonging to a tenant the caller picked out of the air.
 *
 * Availability means the same thing it means on the create form — not already
 * claimed by a live project, and carrying sensors — so a device offered here is
 * one setProjectDevice will actually accept.
 */
export async function projectDeviceOptions(projectId: number) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, isDelete: false },
    select: { tenantId: true },
  });
  if (!project) throw new NotFoundError("Project not found");

  const devices = await prisma.device.findMany({
    where: {
      tenantId: project.tenantId,
      status: "one" as never,
      isDelete: "false_" as never,
      isOngoing: false,
      assignSensor: { not: null },
      NOT: [{ assignSensor: "" }, { assignSensor: "[]" }],
    } as never,
    select: { id: true, deviceName: true, deviceId: true },
    orderBy: { deviceName: "asc" },
  });

  return devices;
}

export interface SetProjectDeviceResult {
  projectId: number;
  deviceId: string | null;
  releasedDeviceId: number | null;
}

/**
 * Attach, swap or detach a project's device.
 *
 * Only while the project is NOT STARTED. Once readings are being collected the
 * device is the source of them, and swapping the hardware underneath a running
 * project would leave one project's series stitched together from two
 * instruments with no record of where one ended and the other began.
 *
 * Release and claim happen in one transaction. Doing them in sequence outside
 * one would leave a window where the old device is free and the new one is not
 * yet taken — and, if the claim then failed, a project pointing at hardware
 * nobody holds.
 */
export async function setProjectDevice(
  projectId: number,
  deviceId: string | null,
): Promise<SetProjectDeviceResult> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, isDelete: false },
    select: { id: true, status: true, deviceId: true, tenantId: true },
  });
  if (!project) throw new NotFoundError("Project not found");

  // While the project is not COLLECTING — which is "not started" or "paused".
  //
  // The rule began as "before the project starts", to stop a running project's
  // series being stitched together from two instruments with no record of where
  // one ended. A paused project is not collecting, so that reasoning does not
  // reach it — and an ENDED project reopens to paused with its device already
  // released, so refusing paused would leave it unable to take hardware again.
  if (project.status !== "not_start" && project.status !== "pause") {
    throw new BadRequestError(
      "A project's device can only be changed while it is not collecting — before it starts, or while paused",
    );
  }

  const current = project.deviceId ? Number(project.deviceId) : null;
  const next = deviceId ? Number(deviceId) : null;

  if (next !== null && Number.isNaN(next)) {
    throw new BadRequestError("Invalid device");
  }

  // Nothing to do, and doing it anyway would release and re-claim the same
  // device for no reason.
  if (current === next) {
    return { projectId, deviceId: project.deviceId, releasedDeviceId: null };
  }

  let sensorIds: string | null = null;

  if (next !== null) {
    const device = await prisma.device.findUnique({
      where: { id: next },
      select: { id: true, tenantId: true, isOngoing: true, assignSensor: true },
    });
    if (!device) throw new BadRequestError("Device not found");

    // The options endpoint already filters by organization; this is the rule
    // itself, enforced where it cannot be bypassed by posting an id directly.
    if (device.tenantId !== project.tenantId) {
      throw new BadRequestError("That device belongs to another organization");
    }
    if (device.isOngoing) {
      throw new BadRequestError("Device is already assigned to a project");
    }

    sensorIds = device.assignSensor ?? null;
    if (!sensorIds || sensorIds.length === 0) {
      throw new BadRequestError("No sensor IDs found for the specified device");
    }
  }

  await prisma.$transaction(async (tx) => {
    if (current !== null) {
      await tx.device.update({
        where: { id: current },
        data: { isOngoing: false },
      });
    }
    if (next !== null) {
      await tx.device.update({
        where: { id: next },
        data: { isOngoing: true },
      });
    }
    await tx.project.update({
      where: { id: project.id },
      data: {
        deviceId: next === null ? null : String(next),
        // The sensors belong to the device, so detaching one leaves the project
        // with none rather than with the departed device's list.
        sensorId: sensorIds,
        updatedAt: new Date(),
      },
    });
  });

  return {
    projectId,
    deviceId: next === null ? null : String(next),
    releasedDeviceId: current,
  };
}
