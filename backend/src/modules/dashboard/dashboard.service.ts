import prisma from "../../config/prisma";
import { BadRequestError } from "../../utils/AppError";
import { DashboardBodyInput, GraphBodyInput } from "./dashboard.types";

function getStartDateAndEndDate(type: string): { startDate: Date; endDate: Date } {
  const endDate = new Date();
  const startDate = new Date();

  switch (type) {
    case "week":
      startDate.setDate(endDate.getDate() - 7);
      break;
    case "month":
      startDate.setDate(endDate.getDate() - 30);
      break;
    case "year":
      startDate.setFullYear(endDate.getFullYear() - 1);
      break;
    default:
      throw new BadRequestError("Invalid graph type");
  }

  return { startDate, endDate };
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function convertToISTDisplay(date: Date): string {
  const options: Intl.DateTimeFormatOptions = { timeZone: "Asia/Kolkata" };
  const istDate = new Date(date.toLocaleString("en-US", options));
  const year = istDate.getFullYear();
  const month = String(istDate.getMonth() + 1).padStart(2, "0");
  const day = String(istDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function aggregateDataByType(
  normalizedData: { date: string; count: number }[],
  startDate: Date,
  endDate: Date,
  type: string,
): { label: string; count: number }[] {
  if (type === "week") {
    const result: { label: string; count: number }[] = [];
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = convertToISTDisplay(current);
      const found = normalizedData.find((d) => d.date === dateStr);
      result.push({
        label: dateStr,
        count: found ? found.count : 0,
      });
      current.setDate(current.getDate() + 1);
    }
    return result;
  }

  if (type === "month") {
    const totalDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const intervalSize = Math.ceil(totalDays / 6);
    const result: { label: string; count: number }[] = [];

    for (let i = 0; i < 6; i++) {
      const intervalStart = new Date(startDate);
      intervalStart.setDate(startDate.getDate() + i * intervalSize);
      const intervalEnd = new Date(intervalStart);
      intervalEnd.setDate(intervalStart.getDate() + intervalSize - 1);

      const label = `${convertToISTDisplay(intervalStart)} to ${convertToISTDisplay(intervalEnd)}`;
      let count = 0;

      for (const item of normalizedData) {
        const itemDate = new Date(item.date);
        if (itemDate >= intervalStart && itemDate <= intervalEnd) {
          count += item.count;
        }
      }

      result.push({ label, count });
    }

    return result;
  }

  if (type === "year") {
    const result: { label: string; count: number }[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = monthDate.toLocaleString("en-US", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "short",
      });

      let count = 0;
      for (const item of normalizedData) {
        const itemDate = new Date(item.date);
        if (
          itemDate.getFullYear() === monthDate.getFullYear() &&
          itemDate.getMonth() === monthDate.getMonth()
        ) {
          count += item.count;
        }
      }

      result.push({ label: monthLabel, count });
    }

    return result;
  }

  return normalizedData.map((d) => ({ label: d.date, count: d.count }));
}

function normalizeDates(
  rawData: { createdAt: Date | string | null }[],
): { date: string; count: number }[] {
  const dateMap = new Map<string, number>();

  for (const item of rawData) {
    if (!item.createdAt) continue;
    const dateStr = convertToISTDisplay(new Date(item.createdAt));
    dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
  }

  return Array.from(dateMap.entries()).map(([date, count]) => ({ date, count }));
}

function getProjectWhere(userId: string, userType: string) {
  const where: Record<string, unknown> = {
    isDelete: false,
    isRegistered: true,
  };

  switch (userType) {
    case "contractor":
      where.contractorId = Number(userId);
      break;
    case "authority":
      where.authorityId = Number(userId);
      break;
    case "admin":
      where.createdBy = Number(userId);
      break;
  }

  return where;
}

function getUserWhere(userId: string, userType: string) {
  const where: Record<string, unknown> = {
    isDelete: "false_" as never,
  };

  switch (userType) {
    case "admin":
      where.parentId = Number(userId);
      where.userType = "contractor" as never;
      break;
    case "contractor":
      where.parentId = Number(userId);
      where.userType = "authority" as never;
      break;
  }

  return where;
}

export async function getDashboard(userId: string, userType: string) {
  const projectWhere = getProjectWhere(userId, userType);

  const upcomingProjects = await prisma.project.count({
    where: { ...projectWhere, status: "not_start" } as never,
  });

  const runningProjects = await prisma.project.count({
    where: { ...projectWhere, status: "start" } as never,
  });

  const pausedProjects = await prisma.project.count({
    where: { ...projectWhere, status: "pause" } as never,
  });

  const response: Record<string, unknown> = {
    upcomingProjects,
    runningProjects,
    pausedProjects,
  };

  if (userType === "superadmin") {
    const adminCount = await prisma.user.count({
      where: {
        userType: "admin" as never,
        isDelete: "false_" as never,
      } as never,
    });

    const contractorCount = await prisma.user.count({
      where: {
        userType: "contractor" as never,
        isDelete: "false_" as never,
      } as never,
    });

    const authorityCount = await prisma.user.count({
      where: {
        userType: "authority" as never,
        isDelete: "false_" as never,
      } as never,
    });

    const totalDevices = await prisma.device.count({
      where: {
        isDelete: "false_" as never,
      } as never,
    });

    const ongoingDevices = await prisma.device.count({
      where: {
        isDelete: "false_" as never,
        isOngoing: true,
      } as never,
    });

    const adminGraph = await getUserGraphData("year", "admin");
    const deviceGraph = await getDeviceGraphData("year");
    const sensorGraph = await getSensorGraphData("year");

    response.adminCount = adminCount;
    response.contractorCount = contractorCount;
    response.authorityCount = authorityCount;
    response.totalDevices = totalDevices;
    response.ongoingDevices = ongoingDevices;
    response.adminGraph = adminGraph;
    response.deviceGraph = deviceGraph;
    response.sensorGraph = sensorGraph;
  }

  if (userType === "admin") {
    const contractorCount = await prisma.user.count({
      where: {
        parentId: Number(userId),
        userType: "contractor" as never,
        isDelete: "false_" as never,
      } as never,
    });

    const authorityCount = await prisma.user.count({
      where: {
        parentId: Number(userId),
        userType: "authority" as never,
        isDelete: "false_" as never,
      } as never,
    });

    const totalDevices = await prisma.device.count({
      where: {
        assignedAdmin: Number(userId),
        isDelete: "false_" as never,
      } as never,
    });

    const ongoingDevices = await prisma.device.count({
      where: {
        assignedAdmin: Number(userId),
        isDelete: "false_" as never,
        isOngoing: true,
      } as never,
    });

    const contractorGraph = await getUserGraph(userId, userType, "year", "contractor");
    const authorityGraph = await getUserGraph(userId, userType, "year", "authority");

    response.contractorCount = contractorCount;
    response.authorityCount = authorityCount;
    response.totalDevices = totalDevices;
    response.ongoingDevices = ongoingDevices;
    response.contractorGraph = contractorGraph;
    response.authorityGraph = authorityGraph;
  }

  const projectGraph = await getProjectGraph(userId, userType, "year");
  response.projectGraph = projectGraph;

  return {
    status_code: 200,
    message: "success",
    data: response,
  };
}

async function getUserGraphData(type: string, userTypeFilter?: string) {
  const { startDate, endDate } = getStartDateAndEndDate(type);

  const where: Record<string, unknown> = {
    isDelete: "false_" as never,
    createdAt: { gte: startDate, lte: endDate },
  };

  if (userTypeFilter) {
    where.userType = userTypeFilter as never;
  }

  const users = await prisma.user.findMany({
    where: where as never,
    select: { createdAt: true },
  });

  const normalizedData = normalizeDates(users);
  return aggregateDataByType(normalizedData, startDate, endDate, type);
}

async function getDeviceGraphData(type: string) {
  const { startDate, endDate } = getStartDateAndEndDate(type);

  const devices = await prisma.device.findMany({
    where: {
      isDelete: "false_" as never,
      createdAt: { gte: startDate, lte: endDate },
    } as never,
    select: { createdAt: true },
  });

  const normalizedData = normalizeDates(devices);
  return aggregateDataByType(normalizedData, startDate, endDate, type);
}

async function getSensorGraphData(type: string) {
  const { startDate, endDate } = getStartDateAndEndDate(type);

  const sensorData = await prisma.sensorData.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
    },
    select: { createdAt: true },
  });

  const normalizedData = normalizeDates(sensorData);
  return aggregateDataByType(normalizedData, startDate, endDate, type);
}

export async function getProjectGraph(userId: string, userType: string, type: string) {
  const { startDate, endDate } = getStartDateAndEndDate(type);

  const projectWhere = getProjectWhere(userId, userType);

  const projects = await prisma.project.findMany({
    where: {
      ...projectWhere,
      createdAt: { gte: startDate, lte: endDate },
    } as never,
    select: { createdAt: true },
  });

  const normalizedData = normalizeDates(projects);
  return aggregateDataByType(normalizedData, startDate, endDate, type);
}

export async function getDeviceGraph(userId: string, userType: string, type: string) {
  const { startDate, endDate } = getStartDateAndEndDate(type);

  const where: Record<string, unknown> = {
    isDelete: "false_" as never,
    createdAt: { gte: startDate, lte: endDate },
  };

  if (userType === "admin") {
    where.assignedAdmin = Number(userId);
  }

  const devices = await prisma.device.findMany({
    where: where as never,
    select: { createdAt: true },
  });

  const normalizedData = normalizeDates(devices);
  return aggregateDataByType(normalizedData, startDate, endDate, type);
}

export async function getSensorGraph(userId: string, userType: string, type: string) {
  const { startDate, endDate } = getStartDateAndEndDate(type);

  let sensorWhere: Record<string, unknown> = {
    createdAt: { gte: startDate, lte: endDate },
  };

  if (userType === "admin") {
    const devices = await prisma.device.findMany({
      where: { assignedAdmin: Number(userId), isDelete: "false_" as never } as never,
      select: { assignSensor: true },
    });

    const sensorIds: number[] = [];
    for (const device of devices) {
      if (device.assignSensor) {
        try {
          const ids = JSON.parse(device.assignSensor);
          if (Array.isArray(ids)) {
            sensorIds.push(...ids.map(Number));
          }
        } catch {
          // skip malformed JSON
        }
      }
    }

    if (sensorIds.length > 0) {
      sensorWhere.sensorId = { in: sensorIds };
    } else {
      return aggregateDataByType([], startDate, endDate, type);
    }
  }

  const sensorData = await prisma.sensorData.findMany({
    where: sensorWhere as never,
    select: { createdAt: true },
  });

  const normalizedData = normalizeDates(sensorData);
  return aggregateDataByType(normalizedData, startDate, endDate, type);
}

export async function getUserGraph(
  userId: string,
  userType: string,
  type: string,
  desireUserType?: string,
) {
  const { startDate, endDate } = getStartDateAndEndDate(type);

  const where: Record<string, unknown> = {
    isDelete: "false_" as never,
    createdAt: { gte: startDate, lte: endDate },
  };

  if (desireUserType) {
    where.userType = desireUserType as never;
  }

  if (userType === "admin") {
    where.parentId = Number(userId);
  }

  const users = await prisma.user.findMany({
    where: where as never,
    select: { createdAt: true },
  });

  const normalizedData = normalizeDates(users);
  return aggregateDataByType(normalizedData, startDate, endDate, type);
}
