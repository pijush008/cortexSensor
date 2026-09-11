import prisma from "../../config/prisma";
import { formatImageUrl } from "../../utils/helper";
import {
  DeviceAddInput,
  DeviceUpdateInput,
  AssignSensorInput,
  UnassignSensorInput,
  DeviceListQuery,
} from "./devices.types";
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

export async function addDevice(input: DeviceAddInput) {
  const existing = await prisma.device.findFirst({
    where: {
      deviceName: input.deviceName,
      isDelete: "false_" as never,
    },
  });

  if (existing) {
    throw new BadRequestError("Device already exists");
  }

  // A serial identifies one physical unit, and the database enforces that. The
  // check is repeated here so the answer is a sentence about serial numbers
  // rather than a unique-constraint violation surfacing as "Something Went
  // Wrong". The constraint remains the authority — this only phrases it.
  if (input.deviceId) {
    const sameSerial = await prisma.device.findUnique({
      where: { deviceId: input.deviceId },
      select: { id: true, deviceName: true },
    });
    if (sameSerial) {
      throw new BadRequestError(
        `Serial number ${input.deviceId} already belongs to "${sameSerial.deviceName}"`,
      );
    }
  }

  const channelCount = parseInt(input.channelCount, 10);

  const device = await prisma.device.create({
    data: {
      deviceName: input.deviceName,
      channelCount,
      addedBy: input.addedBy ? Number(input.addedBy) : undefined,
      deviceStatus: "inactive",
      deviceStartDate: input.deviceStartDate
        ? new Date(input.deviceStartDate)
        : new Date(),
      createdAt: new Date(),
      deviceId: input.deviceId || null,
      gatewayDeviceId: input.gatewayDeviceId || "0",
      deviceType: Number(input.deviceType),
      status: "one" as never,
      isDelete: "false_" as never,
      isOngoing: false,
    },
  });

  const channelPromises = [];
  for (let i = 1; i <= channelCount; i++) {
    channelPromises.push(
      prisma.deviceChannel.create({
        data: {
          deviceId: String(device.id),
          channelNumber: `CH ${i}`,
          channelName: `Channel ${i}`,
          activeStatus: "zero" as never,
        },
      }),
    );
  }
  await Promise.all(channelPromises);

  return { status_code: 200, message: "Device added successfully" };
}

export async function listDevices(query: DeviceListQuery, scopedAdminId?: number) {
  const {
    deviceStatus,
    searchTerm,
    deviceTypeList,
    availableForProject,
    tenantId,
    page,
    limit,
  } = query;

  const where: Record<string, unknown> = {
    status: "one" as never,
    isDelete: "false_" as never,
  };

  if (scopedAdminId !== undefined) {
    where.assignedAdmin = scopedAdminId;
  } else if (tenantId !== undefined) {
    // Only reachable for a platform operator: the controller passes a
    // scopedAdminId for everyone else, and that branch wins.
    where.tenantId = tenantId;
  }

  if (deviceStatus && deviceStatus !== "all") {
    where.deviceStatus = deviceStatus;
  }

  if (availableForProject === "1") {
    // Free, and able to produce readings. The second half matters as much as
    // the first: createProject refuses a device with no sensors, so offering
    // one would only turn a valid-looking choice into an error at submit time.
    where.isOngoing = false;
    where.assignSensor = { not: null };
    where.NOT = [{ assignSensor: "" }, { assignSensor: "[]" }];
  }

  const rows = await prisma.device.findMany({
    where: where as never,
    include: {
      deviceTypeRecord: true,
    },
    orderBy: { createdAt: "desc" },
  });

  let filteredRows = rows;

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredRows = rows.filter(
      (r) =>
        r.deviceName.toLowerCase().includes(term) ||
        r.deviceTypeRecord?.deviceType.toLowerCase().includes(term),
    );
  }

  if (deviceTypeList === "paired") {
    filteredRows = filteredRows.filter(
      (r) => r.assignedAdmin != null && r.assignedAdmin !== 0,
    );
  } else if (deviceTypeList === "unpaired") {
    filteredRows = filteredRows.filter(
      (r) => r.assignedAdmin === 0 || r.assignedAdmin == null,
    );
  }

  if (!filteredRows.length) {
    throw new NotFoundError("No Devices found");
  }

  const result = filteredRows.map((d) => ({
    ...d,
    deviceTypeName: d.deviceTypeRecord?.deviceType ?? null,
    deviceTypeImage: formatImageUrl(d.deviceTypeRecord?.deviceImage ?? ""),
  }));

  return paginate(result, page, limit);
}

export async function updateDevice(tableDeviceId: string, input: DeviceUpdateInput) {
  const existing = await prisma.device.findFirst({
    where: {
      id: Number(tableDeviceId),
      isDelete: "false_" as never,
    },
  });

  if (!existing) {
    throw new NotFoundError("device not found");
  }

  await prisma.device.update({
    where: { id: Number(tableDeviceId) },
    data: {
      deviceName: input.deviceName,
      channelCount: parseInt(input.channelCount, 10),
      deviceStartDate: input.deviceStartDate
        ? new Date(input.deviceStartDate)
        : existing.deviceStartDate,
      deviceType: input.deviceType ? Number(input.deviceType) : existing.deviceType,
      deviceId: input.deviceId || existing.deviceId,
      gatewayDeviceId: input.gatewayDeviceId || existing.gatewayDeviceId,
      updatedAt: new Date(),
    },
  });

  return { status_code: 200, message: "Device updated successfully" };
}

export async function deleteDevice(deviceId: string) {
  const existing = await prisma.device.findFirst({
    where: {
      id: Number(deviceId),
      isDelete: "false_" as never,
    },
  });

  if (!existing) {
    throw new NotFoundError("device not found");
  }

  await prisma.device.update({
    where: { id: Number(deviceId) },
    data: { isDelete: "true_" as never },
  });

  return { status_code: 200, message: "device deleted successfully!" };
}

export async function assignSensor(input: AssignSensorInput) {
  const { deviceId, userId, sensorIds } = input;

  if (!sensorIds || !Array.isArray(sensorIds) || sensorIds.length === 0) {
    throw new BadRequestError("Invalid sensor IDs");
  }

  const extractedSensorIds = sensorIds.map((s) => s.sensorId);

  const existingDevices = await prisma.device.findMany({
    where: {
      isDelete: "false_" as never,
      assignSensor: { not: null },
    },
  });

  for (const device of existingDevices) {
    if (device.id !== deviceId && device.assignSensor) {
      try {
        const sensorArr: number[] = JSON.parse(device.assignSensor);
        const toRemove = extractedSensorIds.filter((id) => sensorArr.includes(id));
        if (toRemove.length > 0) {
          const remaining = sensorArr.filter((id) => !toRemove.includes(id));
          await prisma.device.update({
            where: { id: device.id },
            data: { assignSensor: JSON.stringify(remaining) },
          });
        }
      } catch {
        // skip malformed JSON
      }
    }
  }

  for (const { sensorId, channel } of sensorIds) {
    const existingAssignment = await prisma.deviceChannel.findFirst({
      where: {
        assignSensor: String(sensorId),
        deviceId: String(deviceId),
        id: { not: channel },
      },
    });

    if (existingAssignment) {
      await prisma.deviceChannel.update({
        where: { id: existingAssignment.id },
        data: { assignSensor: null },
      });
    }
  }

  const filteredIds = extractedSensorIds.filter((id) => id !== null);
  await prisma.device.update({
    where: { id: deviceId },
    data: {
      assignSensor: JSON.stringify(filteredIds),
      updatedBy: userId,
      updatedAt: new Date(),
    },
  });

  await Promise.all(
    sensorIds.map(({ sensorId, triggerValue, thresholdValue, channel, isEnable }) =>
      prisma.deviceChannel.update({
        where: { id: channel },
        data: {
          assignSensor: String(sensorId),
          triggerValue: triggerValue ?? null,
          thresholdValue: thresholdValue ?? null,
          activeStatus: String(isEnable) === "1" ? "one" : "zero",
        },
      }),
    ),
  );

  return { status_code: 200, message: "Success" };
}

export async function unassignSensor(input: UnassignSensorInput) {
  const { deviceId, sensorIds } = input;

  if (!sensorIds || !Array.isArray(sensorIds) || sensorIds.length === 0) {
    throw new BadRequestError("Invalid sensor IDs");
  }

  const device = await prisma.device.findFirst({
    where: {
      id: deviceId,
      isDelete: "false_" as never,
    },
  });

  if (!device) {
    throw new BadRequestError("Device not found");
  }

  for (const sensor of sensorIds) {
    await prisma.deviceChannel.deleteMany({
      where: {
        deviceId: String(deviceId),
        assignSensor: String(sensor.sensorId),
      },
    });
  }

  return { status_code: 200, message: "Success" };
}

export async function assignDeviceToAdmin(
  assignType: string,
  deviceId: string,
  adminId: string | undefined,
) {
  const device = await prisma.device.findUnique({
    where: { id: Number(deviceId) },
  });

  if (!device) {
    throw new NotFoundError("device not found");
  }

  const assignedAdmin = assignType === "assign" ? Number(adminId) : null;

  await prisma.device.update({
    where: { id: Number(deviceId) },
    data: { assignedAdmin },
  });

  return { status_code: 200, message: `Device ${assignType} successfully` };
}
