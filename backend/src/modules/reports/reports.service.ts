import prisma from "../../config/prisma";
import { Prisma } from "@prisma/client";
import {
  ReportSensorListInput,
  ReportSensorDataInput,
  ReportSensorListGraphInput,
  ReportSensorListMultipleGraphInput,
} from "./reports.types";
import { NotFoundError } from "../../utils/AppError";

export function getDateGroupFormat(
  frequency: string | null | undefined,
): string | null {
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

export function getStartOfWeekDate(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const weekStart = new Date(year, 0, 4 + (1 - dayOfWeek) + (week - 1) * 7);
  weekStart.setUTCHours(0, 0, 0, 0);
  return weekStart;
}

export function adjustDateWithOffset(
  date: string | undefined,
  offset: number,
): string | undefined {
  if (!date) return undefined;
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  d.setDate(d.getDate() + offset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatGraphDate(
  senDt: string,
  frequency: string | null | undefined,
): string {
  const date = new Date(senDt);
  if (isNaN(date.getTime())) return senDt;

  const istFormatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = istFormatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const iso = `${get("year")}-${get("month")}-${get("day")}T${get(
    "hour",
  )}:${get("minute")}:00`;

  const d = new Date(iso);

  switch (frequency) {
    case "hour":
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0",
      )}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(
        2,
        "0",
      )}:00`;
    case "day":
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0",
      )}-${String(d.getDate()).padStart(2, "0")}`;
    case "week": {
      const days = (d.getUTCDay() + 6) % 7;
      const weekStart = new Date(d);
      weekStart.setUTCDate(d.getUTCDate() - days);
      const yearOfWeek = weekStart.getUTCFullYear();
      const ms = Date.UTC(yearOfWeek, 0, 4);
      const firstDay = new Date(
        ms + (7 - ((ms / 86400000 + 3) % 7)) * 86400000,
      );
      const weekNumber =
        1 +
        Math.round(
          (Math.floor((weekStart.getTime() - firstDay.getTime()) / 86400000) +
            5) /
            7,
        );
      return `${yearOfWeek}-${String(weekNumber).padStart(2, "0")}`;
    }
    case "month":
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    case "year":
      return String(d.getFullYear());
    default:
      return senDt;
  }
}

function downSample<T>(data: T[], size = 200): T[] {
  if (data.length <= size) return data;
  const step = Math.ceil(data.length / size);
  const result: T[] = [];
  for (let i = 0; i < data.length; i += step) {
    const chunk = data.slice(i, i + step);
    const avg: number[] = [];
    for (const item of chunk) {
      const record = item as { sensorData?: number; crtAt?: number };
      if (record.sensorData !== undefined) avg.push(record.sensorData);
    }
    if (!avg.length) continue;
    const mean = avg.reduce((a, b) => a + b, 0) / avg.length;
    const window = chunk[0] as { senDt?: string };
    result.push({
      ...(chunk[0] as unknown as object),
      sensorData: mean,
      crtAt: window.senDt ?? (chunk[0] as unknown as { crtAt?: number }).crtAt,
    } as unknown as T);
  }
  return result;
}

function buildHistogram(values: number[]) {
  const dataCount = values.length;
  if (!dataCount) return [];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const classesCount = Math.ceil(3.3 * Math.log10(dataCount) + 1);
  const minMaxDifference = max - min;
  const rangeIncrement = minMaxDifference / classesCount;

  const ranges = Array.from({ length: classesCount }, (_, i) => {
    const rMin = min + i * rangeIncrement;
    const rMax = i === classesCount - 1 ? max : rMin + rangeIncrement;
    return { rMin, rMax, freq: 0 };
  });

  for (const value of values) {
    for (const range of ranges) {
      const lowerOk = value >= range.rMin;
      const upperOk =
        range.rMax === max ? value <= range.rMax : value < range.rMax;
      if (lowerOk && upperOk) {
        range.freq += 1;
        break;
      }
    }
  }

  return ranges;
}

function buildPieChart(
  ranges: { rMin: number; rMax: number; freq: number }[],
) {
  return ranges.map((range) => ({
    nm: `${range.rMin.toFixed(2)} - ${range.rMax.toFixed(2)}`,
    vl: range.freq,
  }));
}

async function buildSensorReport(
  projectId: number,
  sensorId: string,
  query: {
    startDate?: string;
    endDate?: string;
    offset?: string;
    frequency?: string;
  },
) {
  const offset = Number(query.offset) || 0;
  const startDate = adjustDateWithOffset(query.startDate, offset);
  const endDate = adjustDateWithOffset(query.endDate, offset);
  const frequency = query.frequency || null;
  const dateFormat = getDateGroupFormat(frequency);

  // Values are always bound as parameters; only the group expression is
  // inlined, and it comes from a fixed whitelist (see getDateGroupFormat).
  const conditions: Prisma.Sql[] = [
    Prisma.sql`"projectId" = ${projectId}`,
    Prisma.sql`"sensorId" = ${sensorId}`,
  ];
  if (startDate) {
    conditions.push(Prisma.sql`"createdAt" >= ${startDate}`);
  }
  if (endDate) {
    conditions.push(Prisma.sql`"createdAt" <= ${`${endDate} 23:59:59`}`);
  }

  const groupExpr = dateFormat
    ? `to_char("createdAt", '${dateFormat}')`
    : `to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS')`;

  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
    SELECT ${Prisma.raw(groupExpr)} AS "senDt", AVG("sensorData") AS "sensorData"
    FROM "sensor_data"
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY ${Prisma.raw(groupExpr)}
    ORDER BY ${Prisma.raw(groupExpr)} ASC
  `);

  let processed = rows.map((row) => ({
    senDt: row.senDt as string,
    sensorData: Number(row.sensorData),
    crtAt: row.senDt as string,
  }));

  if (processed.length > 200) {
    processed = downSample(processed, 200);
  }

  const values = processed.map((r) => r.sensorData);
  const ranges = buildHistogram(values);
  const pieChart = buildPieChart(ranges);

  return {
    graph: processed.map((r) => ({
      senDt: formatGraphDate(r.senDt, frequency),
      crtAt: r.crtAt,
      sensorData: r.sensorData,
    })),
    histogram: ranges,
    pieChart,
  };
}

export async function getReportSensorList(
  uniqueId: string,
  query: ReportSensorListInput,
) {
  const project = await prisma.project.findFirst({
    where: { uniqueId },
    select: { id: true, offset: true, sensorId: true, deviceId: true },
  });

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  const resolvedQuery: ReportSensorListInput = {
    ...query,
    offset: String(Number(query.offset) + Number(project.offset || 0)),
  };

  let sensorIds: string[] = [];
  if (query.sensorList) {
    sensorIds = query.sensorList
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (project.sensorId) {
    try {
      const parsed = JSON.parse(project.sensorId);
      if (Array.isArray(parsed)) {
        sensorIds = parsed.map(String);
      }
    } catch {
      sensorIds = [];
    }
  }

  if (!sensorIds.length) {
    return [];
  }

  const data = await Promise.all(
    sensorIds.map(async (sensorId) => {
      const report = await buildSensorReport(
        project.id,
        sensorId,
        resolvedQuery,
      );
      return { sensorId, data: report };
    }),
  );

  return data;
}

export async function getReportSensorData(
  sensorId: string,
  uniqueId: string,
  query: ReportSensorDataInput,
) {
  const project = await prisma.project.findFirst({
    where: { uniqueId },
    select: { id: true, offset: true },
  });

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  const resolvedQuery: ReportSensorDataInput = {
    ...query,
    offset: String(Number(query.offset) + Number(project.offset || 0)),
  };

  const report = await buildSensorReport(project.id, sensorId, resolvedQuery);
  return report;
}

export async function getReportSensorListGraph(
  uniqueId: string,
  query: ReportSensorListGraphInput,
) {
  const project = await prisma.project.findFirst({
    where: { uniqueId },
    select: {
      id: true,
      uniqueId: true,
      projectName: true,
      projectLocation: true,
      startDate: true,
      sensorId: true,
      deviceId: true,
    },
  });

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  const device = project.deviceId
    ? await prisma.device.findUnique({
        where: { id: Number(project.deviceId) },
        select: { id: true, assignSensor: true, deviceName: true },
      })
    : null;

  const channels = device
    ? await prisma.deviceChannel.findMany({
        where: { deviceId: String(device.id) },
        select: {
          channelNumber: true,
          channelName: true,
          assignSensor: true,
          activeStatus: true,
        },
      })
    : [];

  const sensorLookup = new Map<
    number,
    {
      sensorName: string;
      sensorTypeName: string;
      unit: string | null;
    }
  >();
  let sensorRows: Array<{
    id: number;
    sensorName: string;
    sensorTypeID: number;
    unit: string;
    sensorType: { sensorType: string };
  }> = [];
  if (project.sensorId) {
    try {
      const sensorIds = JSON.parse(project.sensorId);
      if (Array.isArray(sensorIds) && sensorIds.length) {
        sensorRows = await prisma.sensor.findMany({
          where: { id: { in: sensorIds.map(Number) } },
          include: { sensorType: true },
        });
      }
    } catch {
      sensorRows = [];
    }
  }
  for (const row of sensorRows) {
    sensorLookup.set(row.id, {
      sensorName: row.sensorName,
      sensorTypeName: row.sensorType.sensorType,
      unit: row.unit ?? null,
    });
  }

  const report = await getReportSensorList(uniqueId, {
    startDate: query.startDate,
    endDate: query.endDate,
    offset: "0",
    frequency: query.frequency,
    sensorList: sensorLookup.size
      ? Array.from(sensorLookup.keys()).join(",")
      : undefined,
  });

  const pdfData = {
    projectName: project.projectName,
    projectLocation: project.projectLocation,
    startDate: project.startDate
      ? project.startDate.toISOString().slice(0, 10)
      : null,
    deviceName: device?.deviceName ?? null,
    channels: channels
      .map((channel) => {
        const sensor = channel.assignSensor
          ? sensorLookup.get(Number(channel.assignSensor))
          : null;
        return {
          channelNumber: channel.channelNumber,
          channelName: channel.channelName,
          sensorName: sensor?.sensorName ?? null,
          sensorTypeName: sensor?.sensorTypeName ?? null,
          unit: sensor?.unit ?? null,
          activeStatus: channel.activeStatus,
        };
      })
      .filter((c) => c.sensorName),
    sensorReport: report,
  };

  return { pdfData, uniqueId: project.uniqueId };
}

export async function getReportSensorListMultipleGraph(
  uniqueId: string,
  query: ReportSensorListMultipleGraphInput,
) {
  const project = await prisma.project.findFirst({
    where: { uniqueId },
    select: { id: true, sensorId: true, deviceId: true },
  });

  if (!project) {
    throw new NotFoundError("Project not found");
  }

  let sensorIds: string[] = [];
  if (query.sensorIds) {
    try {
      const parsed = JSON.parse(query.sensorIds);
      if (Array.isArray(parsed)) {
        sensorIds = parsed.map(String);
      }
    } catch {
      sensorIds = query.sensorIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }

  const allReport = await getReportSensorList(uniqueId, {
    startDate: query.startDate,
    endDate: query.endDate,
    offset: "0",
    frequency: query.frequency,
    sensorList: sensorIds.length ? sensorIds.join(",") : undefined,
  });

  const filtered = sensorIds.length
    ? allReport.filter((r) => sensorIds.includes(r.sensorId))
    : allReport;

  return {
    pdfData: filtered.map((r) => ({
      sensorId: r.sensorId,
      data: r.data,
    })),
  };
}
