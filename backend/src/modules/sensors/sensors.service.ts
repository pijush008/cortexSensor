import prisma from "../../config/prisma";
import { formatImageUrl, saveBase64Image } from "../../utils/helper";
import {
  SensorAddInput,
  SensorUpdateInput,
  SensorTypeAddInput,
  SensorTypeUpdateInput,
  AssignSensorAdminInput,
  SensorListQuery,
  SensorDataFromDeviceInput,
} from "./sensors.types";
import { BadRequestError, NotFoundError } from "../../utils/AppError";

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

export async function sensorList(query: SensorListQuery, scopedAdminId?: number) {
  const { searchTerm, page, limit } = query;

  const where: Record<string, unknown> = {
    status: "one" as never,
  };

  if (scopedAdminId !== undefined) {
    where.assignedAdmin = scopedAdminId;
  }

  if (searchTerm) {
    where.sensorName = { contains: searchTerm, mode: "insensitive" };
  }

  const rows = await prisma.sensor.findMany({
    where: where as never,
    include: {
      sensorType: true,
      admin: { select: { firstName: true, id: true } },
    },
    orderBy: { id: "desc" },
  });

  if (!rows.length) {
    throw new NotFoundError("No sensor found");
  }

  const result = rows.map((s) => ({
    sensorId: s.id,
    sensorName: s.sensorName,
    sensorTypeID: s.sensorTypeID,
    calibrationValue: s.calibrationValue,
    sensorType: s.sensorType.sensorType,
    sensorIcon: formatImageUrl(s.sensorType.sensorIcon ?? ""),
    projectName: null,
    deviceId: null,
    firstName: s.admin?.firstName ?? null,
    adminId: s.admin?.id ?? null,
  }));

  return paginate(result, page, limit);
}

export async function sensorListOnType(
  assignType: string,
  adminId: string,
  query: SensorListQuery,
) {
  const { searchTerm, page, limit } = query;

  let sensors;

  if (assignType === "unassign") {
    sensors = await prisma.sensor.findMany({
      where: {
        status: "one" as never,
        assignedAdmin: Number(adminId),
      },
      include: { sensorType: true },
      orderBy: { id: "desc" },
    });

    const assignedChannelSensorIds = await prisma.deviceChannel.findMany({
      where: { assignSensor: { not: null } },
      select: { assignSensor: true },
    });
    const assignedIds = new Set(
      assignedChannelSensorIds
        .map((c) => Number(c.assignSensor))
        .filter((n) => !isNaN(n)),
    );

    sensors = sensors.filter((s) => !assignedIds.has(s.id));
  } else if (assignType === "assign") {
    const assignedChannels = await prisma.deviceChannel.findMany({
      where: { assignSensor: { not: null } },
      select: { assignSensor: true },
    });
    const assignedIds = new Set(
      assignedChannels
        .map((c) => Number(c.assignSensor))
        .filter((n) => !isNaN(n)),
    );

    sensors = await prisma.sensor.findMany({
      where: {
        status: "one" as never,
        assignedAdmin: Number(adminId),
        id: { in: Array.from(assignedIds) },
      },
      include: { sensorType: true },
      orderBy: { id: "desc" },
    });
  } else {
    throw new BadRequestError("Invalid assignType");
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    sensors = sensors.filter((s) =>
      s.sensorName.toLowerCase().includes(term),
    );
  }

  if (!sensors.length) {
    throw new NotFoundError("No sensors found");
  }

  const result = sensors.map((s) => ({
    sensorId: s.id,
    sensorName: s.sensorName,
    sensorTypeID: s.sensorTypeID,
    calibrationValue: s.calibrationValue,
    sensorType: s.sensorType.sensorType,
    sensorIcon: formatImageUrl(s.sensorType.sensorIcon ?? ""),
  }));

  return paginate(result, page, limit);
}

export async function addSensor(input: SensorAddInput) {
  const existing = await prisma.sensor.findFirst({
    where: { sensorName: input.sensorName },
  });

  if (existing) {
    throw new BadRequestError("Sensor already exists");
  }

  await prisma.sensor.create({
    data: {
      sensorTypeID: Number(input.sensorTypeID),
      sensorName: input.sensorName,
      calibrationValue: input.calibrationValue,
      unit: input.unit,
      status: "one" as never,
    },
  });

  return { status_code: 200, message: "Sensor added successfully" };
}

export async function updateSensor(sensorId: string, input: SensorUpdateInput) {
  const existing = await prisma.sensor.findUnique({
    where: { id: Number(sensorId) },
  });

  if (!existing) {
    throw new NotFoundError("Sensor not found");
  }

  await prisma.sensor.update({
    where: { id: Number(sensorId) },
    data: {
      sensorName: input.sensorName || existing.sensorName,
      calibrationValue: input.calibrationValue || existing.calibrationValue,
      unit: input.unit || existing.unit,
    },
  });

  return { status_code: 200, message: "Sensor updated successfully" };
}

export async function deleteSensor(sensorId: string) {
  const existing = await prisma.sensor.findUnique({
    where: { id: Number(sensorId) },
  });

  if (!existing) {
    throw new NotFoundError("Sensor not found");
  }

  await prisma.sensor.delete({ where: { id: Number(sensorId) } });

  return { status_code: 200, message: "Sensor deleted successfully!" };
}

export async function assignSensorToAdmin(input: AssignSensorAdminInput) {
  const sensor = await prisma.sensor.findUnique({
    where: { id: Number(input.sensorId) },
  });

  if (!sensor) {
    throw new BadRequestError("Sensor not found");
  }

  const assignedAdmin =
    input.adminId && input.adminId !== "undefined"
      ? Number(input.adminId)
      : null;

  if (assignedAdmin && sensor.assignedAdmin != null) {
    throw new BadRequestError("Sensor already assigned to an admin");
  }

  await prisma.sensor.update({
    where: { id: Number(input.sensorId) },
    data: { assignedAdmin },
  });

  return { status_code: 200, message: "Sensor assigned successfully" };
}

export async function unassignSensorFromAdmin(input: AssignSensorAdminInput) {
  const sensor = await prisma.sensor.findUnique({
    where: { id: Number(input.sensorId) },
  });

  if (!sensor) {
    throw new BadRequestError("Sensor not found");
  }

  await prisma.sensor.update({
    where: { id: Number(input.sensorId) },
    data: { assignedAdmin: null },
  });

  return { status_code: 200, message: "Sensor unassigned successfully" };
}

export async function sensorTypeList(searchTerm?: string) {
  const where: Record<string, unknown> = {
    status: "one" as never,
  };

  if (searchTerm) {
    where.sensorType = { contains: searchTerm, mode: "insensitive" };
  }

  const rows = await prisma.sensorType.findMany({
    where: where as never,
    select: {
      id: true,
      sensorType: true,
      sensorIcon: true,
      calibrationValue: true,
      unit: true,
    },
  });

  if (!rows.length) {
    throw new NotFoundError("No sensor found");
  }

  return rows.map((r) => ({
    ...r,
    sensorIcon: formatImageUrl(r.sensorIcon ?? ""),
  }));
}

export async function addSensorType(input: SensorTypeAddInput) {
  const existing = await prisma.sensorType.findFirst({
    where: { sensorType: input.sensorType },
  });

  if (existing) {
    throw new BadRequestError("Sensor already exists");
  }

  let imagePath: string | null = null;
  if (input.sensorIcon) {
    imagePath = await saveBase64Image(
      input.sensorIcon,
      input.sensorType,
      "uploads/sensor_type",
    );
  }

  await prisma.sensorType.create({
    data: {
      sensorType: input.sensorType,
      sensorIcon: imagePath || "",
      calibrationValue: input.calibrationValue || "",
      status: "one" as never,
      unit: input.unit || null,
    },
  });

  return { status_code: 200, message: "Sensor Type added successfully" };
}

export async function updateSensorType(
  sensorTypeId: string,
  input: SensorTypeUpdateInput,
) {
  const existing = await prisma.sensorType.findUnique({
    where: { id: Number(sensorTypeId) },
  });

  if (!existing) {
    throw new NotFoundError("Sensor Type not found");
  }

  let imagePath = existing.sensorIcon;

  if (input.sensorIcon) {
    imagePath = await saveBase64Image(
      input.sensorIcon,
      input.sensorType || existing.sensorType,
      "uploads/sensor_type",
    );
  }

  await prisma.sensorType.update({
    where: { id: Number(sensorTypeId) },
    data: {
      sensorType: input.sensorType || existing.sensorType,
      sensorIcon: imagePath || existing.sensorIcon,
      calibrationValue: input.calibrationValue ?? existing.calibrationValue,
      unit: input.unit ?? existing.unit,
    },
  });

  return { status_code: 200, message: "Sensor Type updated successfully" };
}

export async function deleteSensorType(sensorTypeId: string) {
  const existing = await prisma.sensorType.findUnique({
    where: { id: Number(sensorTypeId) },
  });

  if (!existing) {
    throw new NotFoundError("Sensor Type not found");
  }

  await prisma.sensorType.delete({ where: { id: Number(sensorTypeId) } });

  return { status_code: 200, message: "Sensor Type deleted successfully!" };
}

export async function addSensorDataFromDevice(input: SensorDataFromDeviceInput) {
  const { device_id, sensor_id, sensor_calibration } = input;
  await prisma.sensorData.create({
    data: {
      deviceId: device_id,
      sensorId: sensor_id,
      sensorData: Number(sensor_calibration),
      createdAt: new Date(),
    },
  });
  return { status_code: 200, message: "Sensor Data successfully" };
}
