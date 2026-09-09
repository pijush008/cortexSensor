import prisma from "../../config/prisma";
import { formatImageUrl } from "../../utils/helper";
import {
  UserListParams,
  UserListQuery,
  AssignedSensorQuery,
  AssignedDeviceQuery,
} from "./users.types";
import { NotFoundError } from "../../utils/AppError";

function paginate<T>(data: T[], page: number, limit: number) {
  const totalItems = data.length;
  const totalPages = Math.ceil(totalItems / limit);
  const safePage = Math.min(Math.max(1, page), totalPages || 1);
  const startIndex = (safePage - 1) * limit;
  const currentData = data.slice(startIndex, startIndex + limit);
  const hasNextPage = safePage < totalPages;
  const hasPrevPage = safePage > 1;

  return {
    totalItems,
    totalPages,
    currentPage: safePage,
    itemsPerPage: limit,
    currentData,
    hasNextPage,
    hasPrevPage,
    nextPage: hasNextPage ? safePage + 1 : null,
    prevPage: hasPrevPage ? safePage - 1 : null,
    currentItemCount: currentData.length,
  };
}

export async function adminList(
  params: UserListParams,
  query: UserListQuery,
) {
  const { userType, adminId } = params;
  const { verifyType, searchTerm, page, limit } = query;

  const where: Record<string, unknown> = {
    userType,
    isDelete: "false_" as never,
  };

  if (verifyType === "verified") {
    where.isUserVerified = "true_" as never;
  } else if (verifyType === "unverified") {
    where.isUserVerified = "false_" as never;
  }

  if (userType !== "admin" && adminId !== "0") {
    where.parentId = Number(adminId);
  }

  if (searchTerm) {
    where.OR = [
      { firstName: { contains: searchTerm, mode: "insensitive" } },
      { lastName: { contains: searchTerm, mode: "insensitive" } },
      { emailId: { contains: searchTerm, mode: "insensitive" } },
      { phoneNo: { contains: searchTerm, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.user.findMany({
    where: where as never,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      emailId: true,
      phoneNo: true,
      isUserVerified: true,
      profileImage: true,
      userType: true,
      csv: true,
      parentId: true,
    },
  });

  if (!rows.length) {
    throw new NotFoundError("No users found");
  }

  const formattedRows = await Promise.all(
    rows.map(async (row) => {
      let totalProjects = 0;
      let runningProjects = 0;

      const projectWhere: Record<string, unknown> = { isDelete: false, isRegistered: true };

      switch (row.userType) {
        case "admin":
          projectWhere.createdBy = row.id;
          break;
        case "contractor":
          projectWhere.contractorId = row.id;
          break;
        case "authority":
          projectWhere.authorityId = row.id;
          break;
      }

      totalProjects = await prisma.project.count({
        where: {
          ...projectWhere,
          status: { notIn: ["end", "not_start"] },
        } as never,
      });

      runningProjects = await prisma.project.count({
        where: projectWhere as never,
      });

      let parentName: string | null = null;
      if (row.parentId && row.parentId !== 0) {
        const parent = await prisma.user.findUnique({
          where: { id: row.parentId },
          select: { firstName: true, lastName: true },
        });
        if (parent) {
          parentName = `${parent.firstName} ${parent.lastName}`;
        }
      }

      return {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        emailId: row.emailId,
        phoneNo: row.phoneNo,
        isUserVerified: row.isUserVerified,
        profileImage: formatImageUrl(row.profileImage ?? ""),
        parentName,
        parentId: row.parentId,
        csv: row.csv,
        totalProjects,
        runningProjects,
      };
    }),
  );

  return paginate(formattedRows, page, limit);
}

export async function csvAccess(userId: string, csv: string) {
  await prisma.user.update({
    where: { id: Number(userId) },
    data: { csv: Number(csv) },
  });

  return { status_code: 200, message: "Update successfully" };
}

export async function assignedSensorList(
  adminId: string,
  query: AssignedSensorQuery,
) {
  const { searchTerm, sensorTypeList, page, limit } = query;

  const where: Record<string, unknown> = {
    status: "one" as never,
  };

  if (adminId !== "0") {
    where.assignedAdmin = Number(adminId);
  }

  if (sensorTypeList === "unpaired") {
    where.OR = [
      { assignedAdmin: null },
      { assignedAdmin: 0 },
    ];
  }

  const rows = await prisma.sensor.findMany({
    where: where as never,
    include: {
      sensorType: true,
      admin: {
        select: { firstName: true, lastName: true },
      },
    },
    orderBy: { id: "desc" },
  });

  let filteredRows = rows;

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredRows = rows.filter(
      (r) =>
        r.sensorName.toLowerCase().includes(term) ||
        r.sensorType.sensorType.toLowerCase().includes(term) ||
        `${r.admin?.firstName ?? ""} ${r.admin?.lastName ?? ""}`
          .toLowerCase()
          .includes(term),
    );
  }

  if (!filteredRows.length) {
    throw new NotFoundError("No sensors found");
  }

  const devices = await prisma.device.findMany({
    where: { status: "one" as never },
    select: { id: true, deviceName: true, assignSensor: true, isOngoing: true },
  });

  const result = filteredRows.map((sensor) => {
    const assignedDevice = devices.find((d) => {
      if (!d.assignSensor) return false;
      try {
        const sensorIds = JSON.parse(d.assignSensor);
        return Array.isArray(sensorIds) && sensorIds.includes(sensor.id);
      } catch {
        return false;
      }
    });

    return {
      sensorId: sensor.id,
      sensorName: sensor.sensorName,
      unit: sensor.unit,
      sensorTypeID: sensor.sensorTypeID,
      calibrationValue: sensor.calibrationValue,
      sensorType: sensor.sensorType.sensorType,
      sensorIcon: formatImageUrl(sensor.sensorType.sensorIcon ?? ""),
      deviceName: assignedDevice?.deviceName ?? null,
      adminFirstName: sensor.admin?.firstName ?? null,
      adminLastName: sensor.admin?.lastName ?? null,
      isOngoing: assignedDevice?.isOngoing ?? false,
    };
  });

  return paginate(result, page, limit);
}

export async function assignedDeviceList(
  adminId: string,
  query: AssignedDeviceQuery,
) {
  const { isNotOngoing, deviceStatus, searchTerm, deviceTypeList, page, limit } =
    query;

  const where: Record<string, unknown> = {
    status: "one" as never,
    isDelete: "false_" as never,
  };

  if (adminId && adminId !== "0") {
    where.assignedAdmin = Number(adminId);
  }

  if (deviceStatus && deviceStatus !== "all") {
    where.deviceStatus = deviceStatus;
  }

  if (isNotOngoing === "1") {
    where.isOngoing = false;
  }

  const rows = await prisma.device.findMany({
    where: where as never,
    include: {
      deviceTypeRecord: true,
      admin: {
        select: { firstName: true, lastName: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  let filteredRows = rows;

  if (deviceTypeList === "paired") {
    filteredRows = rows.filter(
      (r) => r.assignedAdmin != null && r.assignedAdmin !== 0,
    );
  } else if (deviceTypeList === "unpaired") {
    filteredRows = rows.filter(
      (r) => r.assignedAdmin === 0 || r.assignedAdmin == null,
    );
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredRows = filteredRows.filter(
      (r) =>
        r.deviceName.toLowerCase().includes(term) ||
        r.deviceTypeRecord?.deviceType.toLowerCase().includes(term) ||
        `${r.admin?.firstName ?? ""} ${r.admin?.lastName ?? ""}`
          .toLowerCase()
          .includes(term),
    );
  }

  if (!filteredRows.length) {
    throw new NotFoundError("No Devices found");
  }

  const projectWhereBase: Record<string, unknown> = {
    isDelete: false,
    csvData: false,
    status: { not: "end" },
    isRegistered: true,
  };

  const result = await Promise.all(
    filteredRows.map(async (device) => {
      const project = await prisma.project.findFirst({
        where: { ...projectWhereBase, deviceId: String(device.id) } as never,
        select: { projectName: true, contractorId: true, authorityId: true },
      });

      const channels = await prisma.deviceChannel.findMany({
        where: { deviceId: String(device.id) },
        orderBy: { id: "asc" },
      });

      let contractorFirstName: string | null = null;
      let contractorLastName: string | null = null;
      let authorityFirstName: string | null = null;
      let authorityLastName: string | null = null;

      if (project?.contractorId) {
        const c = await prisma.user.findUnique({
          where: { id: project.contractorId },
          select: { firstName: true, lastName: true },
        });
        contractorFirstName = c?.firstName ?? null;
        contractorLastName = c?.lastName ?? null;
      }

      if (project?.authorityId) {
        const a = await prisma.user.findUnique({
          where: { id: project.authorityId },
          select: { firstName: true, lastName: true },
        });
        authorityFirstName = a?.firstName ?? null;
        authorityLastName = a?.lastName ?? null;
      }

      return {
        ...device,
        projectName: project?.projectName ?? null,
        contractorFirstName,
        contractorLastName,
        authorityFirstName,
        authorityLastName,
        deviceTypeName: device.deviceTypeRecord?.deviceType ?? null,
        deviceTypeImage: formatImageUrl(device.deviceTypeRecord?.deviceImage ?? ""),
        adminFirstName: device.admin?.firstName ?? null,
        adminLastName: device.admin?.lastName ?? null,
        deviceChannel: channels,
        assignedDeviceStatus:
          device.assignedAdmin != null && device.assignedAdmin !== 0
            ? false
            : true,
      };
    }),
  );

  return paginate(result, page, limit);
}
