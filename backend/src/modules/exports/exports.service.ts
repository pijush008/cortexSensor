import prisma from "../../config/prisma";
import { ForbiddenError, NotFoundError } from "../../utils/AppError";
import { AuthenticatedRequestUser } from "../../types";
import { DownloadTelemetryBody } from "./exports.types";

/**
 * Resolve the tenant scope for a requesting user.
 * - superadmin: unlimited (empty scope object → no constraints).
 * - admin: their projects (createdBy) and devices (assignedAdmin/addedBy).
 * - contractor/authority: their projects (contractorId/authorityId) and the
 *   devices referenced by those projects.
 * A caller-supplied projectId/deviceId is verified inside that scope.
 */
async function resolveTenantScope(
  user: AuthenticatedRequestUser | undefined,
  requestedProjectId?: number,
  requestedDeviceId?: string,
): Promise<{
  projectIds?: number[];
  deviceIds?: string[];
  gatewayDeviceIds?: string[];
}> {
  if (!user || user.userType === "superadmin") {
    return {};
  }

  const isAdmin = user.userType === "admin";

  const projectWhere = {
    OR: [
      ...(isAdmin ? [{ createdBy: user.id }] : []),
      ...(user.userType === "contractor" ? [{ contractorId: user.id }] : []),
      ...(user.userType === "authority" ? [{ authorityId: user.id }] : []),
    ],
  };
  const projects = await prisma.project.findMany({
    where: projectWhere,
    select: { id: true, deviceId: true },
  });
  const projectIds = projects.map((p) => p.id);

  let deviceIds: string[] = [];
  let gatewayDeviceIds: string[] = [];

  if (isAdmin) {
    const devices = await prisma.device.findMany({
      where: { OR: [{ assignedAdmin: user.id }, { addedBy: user.id }] },
      select: { deviceId: true, gatewayDeviceId: true },
    });
    deviceIds = devices.map((d) => d.deviceId).filter((v): v is string => Boolean(v));
    gatewayDeviceIds = devices.map((d) => d.gatewayDeviceId);
  } else {
    const refIds = projects
      .map((p) => p.deviceId)
      .filter((v): v is string => Boolean(v))
      .map((v) => Number(v))
      .filter((n) => !Number.isNaN(n));
    if (refIds.length) {
      const devices = await prisma.device.findMany({
        where: { id: { in: refIds } },
        select: { deviceId: true, gatewayDeviceId: true },
      });
      deviceIds = devices.map((d) => d.deviceId).filter((v): v is string => Boolean(v));
      gatewayDeviceIds = devices.map((d) => d.gatewayDeviceId);
    }
  }

  if (requestedProjectId != null && !projectIds.includes(requestedProjectId)) {
    throw new ForbiddenError("You do not have permission to access this project");
  }

  if (requestedDeviceId != null) {
    const owns =
      deviceIds.includes(requestedDeviceId) ||
      gatewayDeviceIds.includes(requestedDeviceId);
    if (!owns) {
      throw new ForbiddenError("You do not have permission to access this device");
    }
  }

  return { projectIds, deviceIds, gatewayDeviceIds };
}

export async function downloadAdminList(
  userType: string,
  adminId: string,
  body: {
    searchTerm?: string;
    verifyType?: string;
    startDate?: string;
    endDate?: string;
  },
) {
  const { searchTerm, verifyType, startDate, endDate } = body;

  const where: Record<string, unknown> = {
    userType,
    isDelete: "false_" as never,
  };

  if (userType !== "admin" && adminId !== "0") {
    where.parentId = Number(adminId);
  }

  if (verifyType === "verified") {
    where.isUserVerified = "true_" as never;
  } else if (verifyType === "unverified") {
    where.isUserVerified = "false_" as never;
  }

  if (searchTerm) {
    where.OR = [
      { firstName: { contains: searchTerm, mode: "insensitive" } },
      { lastName: { contains: searchTerm, mode: "insensitive" } },
      { emailId: { contains: searchTerm, mode: "insensitive" } },
      { phoneNo: { contains: searchTerm, mode: "insensitive" } },
    ];
  }

  if (startDate || endDate) {
    const createdAtFilter: Record<string, Date> = {};
    if (startDate) createdAtFilter.gte = new Date(startDate);
    if (endDate) createdAtFilter.lte = new Date(endDate);
    where.createdAt = createdAtFilter;
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
      createdAt: true,
      isUserVerified: true,
    },
  });

  if (!rows.length) {
    throw new NotFoundError("No users found");
  }

  const headers = ["S.No", "Admin Name", "Email", "Phone", "Created At", "Verified"];

  const csvRows = rows.map((row, index) => [
    String(index + 1),
    `${row.firstName} ${row.lastName}`,
    row.emailId,
    row.phoneNo ?? "",
    row.createdAt ? new Date(row.createdAt).toISOString().split("T")[0] : "",
    row.isUserVerified === ("true_" as never) ? "Yes" : "No",
  ]);

  const csvContent = [
    headers.join(","),
    ...csvRows.map((row) => row.join(",")),
  ].join("\n");

  return { csvContent, filename: "admin_list" };
}

export async function downloadDeviceList(
  adminId: string,
  body: {
    searchTerm?: string;
    deviceStatus?: string;
  },
) {
  const { searchTerm, deviceStatus } = body;

  const where: Record<string, unknown> = {
    isDelete: "false_" as never,
  };

  if (adminId && adminId !== "0") {
    where.assignedAdmin = Number(adminId);
  }

  if (deviceStatus && deviceStatus !== "all") {
    where.deviceStatus = deviceStatus;
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
        (r.deviceId ?? "").toLowerCase().includes(term),
    );
  }

  if (!filteredRows.length) {
    throw new NotFoundError("No devices found");
  }

  const headers = [
    "S.No",
    "Device Name",
    "Device Type",
    "Device Id",
    "Gateway Device Id",
    "Channel Count",
    "Status",
    "Created At",
  ];

  const csvRows = filteredRows.map((row, index) => [
    String(index + 1),
    row.deviceName,
    row.deviceTypeRecord?.deviceType ?? String(row.deviceType),
    row.deviceId,
    row.gatewayDeviceId ?? "",
    String(row.channelCount),
    row.deviceStatus ?? "",
    row.createdAt ? new Date(row.createdAt).toISOString().split("T")[0] : "",
  ]);

  const csvContent = [
    headers.join(","),
    ...csvRows.map((row) => row.join(",")),
  ].join("\n");

  return { csvContent, filename: "device_list" };
}

export async function downloadSensorList(
  adminId: string,
  body: {
    searchTerm?: string;
  },
) {
  const { searchTerm } = body;

  const where: Record<string, unknown> = {};

  if (adminId && adminId !== "0") {
    where.assignedAdmin = Number(adminId);
  }

  const rows = await prisma.sensor.findMany({
    where: where as never,
    include: {
      sensorType: true,
      admin: {
        select: { firstName: true, lastName: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  let filteredRows = rows;

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredRows = rows.filter(
      (r) =>
        r.sensorName.toLowerCase().includes(term) ||
        r.sensorType.sensorType.toLowerCase().includes(term),
    );
  }

  if (!filteredRows.length) {
    throw new NotFoundError("No sensors found");
  }

  const headers = [
    "S.No",
    "Sensor Name",
    "Sensor Type",
    "Unit",
    "Calibration Value",
    "Assigned Admin",
    "Created At",
  ];

  const csvRows = filteredRows.map((row, index) => [
    String(index + 1),
    row.sensorName,
    row.sensorType.sensorType,
    row.unit ?? "",
    String(row.calibrationValue ?? row.sensorType.calibrationValue ?? ""),
    row.admin ? `${row.admin.firstName} ${row.admin.lastName}` : "",
    row.createdAt ? new Date(row.createdAt).toISOString().split("T")[0] : "",
  ]);

  const csvContent = [
    headers.join(","),
    ...csvRows.map((row) => row.join(",")),
  ].join("\n");

  return { csvContent, filename: "sensor_list" };
}

export async function downloadProjectTable(
  adminId: string,
  body: {
    searchTerm?: string;
    role?: string;
  },
) {
  const { searchTerm, role } = body;

  const where: Record<string, unknown> = {
    isDelete: false,
    isRegistered: true,
  };

  if (adminId && adminId !== "0") {
    const adminNum = Number(adminId);
    if (role === "contractor") {
      where.contractorId = adminNum;
    } else if (role === "authority") {
      where.authorityId = adminNum;
    } else {
      where.createdBy = adminNum;
    }
  }

  const rows = await prisma.project.findMany({
    where: where as never,
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
    orderBy: { createdAt: "desc" },
  });

  let filteredRows = rows;

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredRows = rows.filter(
      (r) =>
        r.projectName.toLowerCase().includes(term) ||
        (r.projectUniqueID ?? "").toLowerCase().includes(term),
    );
  }

  if (!filteredRows.length) {
    throw new NotFoundError("No projects found");
  }

  const headers = [
    "S.No",
    "Project Name",
    "Unique ID",
    "Location",
    "Status",
    "Start Date",
    "End Date",
    "Admin",
    "Contractor",
    "Authority",
  ];

  const csvRows = filteredRows.map((row, index) => [
    String(index + 1),
    row.projectName,
    row.projectUniqueID ?? "",
    row.projectLocation,
    row.status ?? "",
    row.startDate ? new Date(row.startDate).toISOString().split("T")[0] : "",
    row.endDate ? new Date(row.endDate).toISOString().split("T")[0] : "",
    row.creator ? `${row.creator.firstName} ${row.creator.lastName}` : "",
    row.contractor
      ? `${row.contractor.firstName} ${row.contractor.lastName}`
      : "",
    row.authority
      ? `${row.authority.firstName} ${row.authority.lastName}`
      : "",
  ]);

  const csvContent = [
    headers.join(","),
    ...csvRows.map((row) => row.join(",")),
  ].join("\n");

  return { csvContent, filename: "project_list" };
}

export async function exportCsv(uniqueId: string) {
  const project = await prisma.project.findFirst({
    where: { projectUniqueID: uniqueId } as never,
    select: { id: true },
  });

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  const sensorDataRows = await prisma.sensorData.findMany({
    where: { projectId: project.id } as never,
    orderBy: { createdAt: "asc" },
    select: {
      sensorId: true,
      sensorData: true,
      createdAt: true,
    },
  });

  if (!sensorDataRows.length) {
    throw new NotFoundError("No sensor data found for this project");
  }

  const grouped = new Map<
    string,
    Array<{ sensorData: number | null; createdAt: Date | null }>
  >();

  for (const row of sensorDataRows) {
    const key = String(row.sensorId);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push({
      sensorData: row.sensorData,
      createdAt: row.createdAt,
    });
  }

  const result = Array.from(grouped.entries()).map(([sensorId, data]) => ({
    sensorId,
    data: data.map((d) => ({
      sensorData: d.sensorData,
      createdAt: d.createdAt,
    })),
  }));

  return result;
}

export async function importCsv(
  uniqueId: string,
  files: { buffer: Buffer; originalname: string }[],
) {
  const project = await prisma.project.findFirst({
    where: { projectUniqueID: uniqueId } as never,
    select: { id: true },
  });

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  let totalInserted = 0;

  for (const file of files) {
    const content = file.buffer.toString("utf-8");
    const lines = content.split("\n").filter((line) => line.trim() !== "");

    if (lines.length < 2) continue;

    const headerLine = lines[0];
    const headers = headerLine.split(",").map((h) => h.trim().toLowerCase());

    const sensorIdIndex = headers.findIndex(
      (h) => h === "sensorid" || h === "sensor_id",
    );
    const sensorDataIndex = headers.findIndex(
      (h) => h === "sensordata" || h === "sensor_data",
    );
    const createdAtIndex = headers.findIndex(
      (h) => h === "createdat" || h === "created_at",
    );

    if (sensorIdIndex === -1 || sensorDataIndex === -1) {
      continue;
    }

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());

      const sensorId = values[sensorIdIndex];
      const sensorDataValue = parseFloat(values[sensorDataIndex]);
      const createdAtValue =
        createdAtIndex !== -1 && values[createdAtIndex]
          ? new Date(values[createdAtIndex])
          : new Date();

      if (!sensorId || isNaN(sensorDataValue)) continue;

      await prisma.sensorData.create({
        data: {
          projectId: project.id,
          sensorId: sensorId,
          sensorData: sensorDataValue,
          createdAt: createdAtValue,
        } as never,
      });

      totalInserted++;
    }
  }

  return { message: `Imported ${totalInserted} records successfully` };
}

// ─── Raw telemetry downloads (office view of field data) ─────────────────────

function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const TELEMETRY_ROW_LIMIT = Number(process.env.TELEMETRY_EXPORT_ROW_LIMIT) || 100000;

/**
 * Download raw sensor readings captured from field hardware
 * (ESP32 nodes / Raspberry Pi gateways → MQTT ingest or /beamDeviceData).
 *
 * sensor_data.sensorId is the numeric Sensor.id (as string) of the calibrated
 * sensor the reading was stored against after calibration.
 */
export async function downloadSensorData(
  body: DownloadTelemetryBody,
  user?: AuthenticatedRequestUser,
) {
  const scope = await resolveTenantScope(user, body.projectId, body.deviceId);

  const where: Record<string, unknown> = {};
  if (body.projectId) where.projectId = body.projectId;
  if (body.deviceId) where.deviceId = body.deviceId;
  if (body.sensorId) where.sensorId = body.sensorId;
  if (body.startDate || body.endDate) {
    const range: Record<string, Date> = {};
    if (body.startDate) range.gte = new Date(body.startDate);
    if (body.endDate) range.lte = new Date(body.endDate);
    where.createdAt = range;
  }

  // Non-superadmins with no explicit anchor must stay inside their scope.
  if (
    scope.projectIds &&
    !body.projectId &&
    !body.deviceId &&
    (scope.projectIds.length || (scope.deviceIds?.length ?? 0))
  ) {
    const filters: Record<string, unknown>[] = [];
    if (scope.projectIds.length) filters.push({ projectId: { in: scope.projectIds } });
    if (scope.deviceIds?.length) filters.push({ deviceId: { in: scope.deviceIds } });
    where.OR = filters;
  }

  const rows = await prisma.sensorData.findMany({
    where: where as never,
    orderBy: { createdAt: "desc" },
    take: TELEMETRY_ROW_LIMIT,
    include: {
      project: {
        select: { projectName: true, projectUniqueID: true },
      },
    },
  });

  if (!rows.length) {
    throw new NotFoundError(
      "No sensor data found for the selected filters. Data appears once a device is registered to a running project and readings arrive.",
    );
  }

  const sensorIds = Array.from(
    new Set(rows.map((r) => Number(r.sensorId)).filter((id) => !Number.isNaN(id))),
  );
  const sensors = sensorIds.length
    ? await prisma.sensor.findMany({
        where: { id: { in: sensorIds } },
        select: { id: true, sensorName: true, unit: true },
      })
    : [];
  const sensorMap = new Map(sensors.map((s) => [String(s.id), s]));

  const headers = [
    "S.No",
    "Project",
    "Project Unique ID",
    "Device ID",
    "Sensor ID",
    "Sensor Name",
    "Unit",
    "Reading",
    "Timestamp (UTC)",
  ];

  const csvRows = rows.map((row, index) => {
    const sensor = sensorMap.get(row.sensorId);
    return [
      String(index + 1),
      row.project?.projectName ?? "",
      row.project?.projectUniqueID ?? "",
      row.deviceId,
      row.sensorId,
      sensor?.sensorName ?? "",
      sensor?.unit ?? "",
      row.sensorData,
      row.createdAt.toISOString(),
    ];
  });

  const csvContent = [
    headers
      .map(csvEscape)
      .join(","),
    ...csvRows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");

  return { csvContent, filename: "sensor_data_export" };
}

/**
 * Download node/gateway health telemetry (battery, temperature, humidity,
 * pressure) captured from field hardware.
 */
export async function downloadNodeData(
  body: DownloadTelemetryBody,
  user?: AuthenticatedRequestUser,
) {
  const scope = await resolveTenantScope(user, body.projectId, body.deviceId);

  const where: Record<string, unknown> = {};
  if (body.deviceId) where.deviceId = body.deviceId;
  if (body.sensorId) where.sensorId = body.sensorId;
  if (body.startDate || body.endDate) {
    const range: Record<string, Date> = {};
    if (body.startDate) range.gte = new Date(body.startDate);
    if (body.endDate) range.lte = new Date(body.endDate);
    where.createdAt = range;
  }

  // Node telemetry has no project column: non-superadmins without an explicit
  // device anchor must remain restricted to their own devices.
  if (
    scope.deviceIds &&
    !body.deviceId &&
    (scope.deviceIds.length || (scope.gatewayDeviceIds?.length ?? 0))
  ) {
    const filters: Record<string, unknown>[] = [];
    if (scope.deviceIds.length) filters.push({ deviceId: { in: scope.deviceIds } });
    if (scope.gatewayDeviceIds?.length) {
      filters.push({ gatewayDeviceId: { in: scope.gatewayDeviceIds } });
    }
    where.OR = filters;
  }

  const rows = await prisma.nodeData.findMany({
    where: where as never,
    orderBy: { id: "desc" },
    take: TELEMETRY_ROW_LIMIT,
  });

  if (!rows.length) {
    throw new NotFoundError(
      "No node data found for the selected filters. Node health appears once gateway nodes start reporting.",
    );
  }

  const headers = [
    "S.No",
    "Device ID",
    "Gateway Device ID",
    "Device Name",
    "Project Name",
    "Device Type",
    "Battery",
    "Temperature",
    "Humidity",
    "Pressure",
    "Device Updated At (UTC)",
    "Received At (UTC)",
  ];

  const csvRows = rows.map((row, index) => [
    String(index + 1),
    row.deviceId ?? "",
    row.gatewayDeviceId ?? "",
    row.deviceName ?? "",
    row.projectName ?? "",
    row.deviceType ?? "",
    row.battery ?? "",
    row.temperature,
    row.humidity,
    row.pressure,
    row.deviceUpdatedAt.toISOString(),
    row.createdAt.toISOString(),
  ]);

  const csvContent = [
    headers
      .map(csvEscape)
      .join(","),
    ...csvRows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");

  return { csvContent, filename: "node_data_export" };
}
