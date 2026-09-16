import prisma from "../../config/prisma";
import { config } from "../../config";
import { sendEmail } from "../../utils/email";
import { logger } from "../../utils/logger";
import { ForbiddenError } from "../../utils/AppError";
import { recordHeartbeat } from "../gateways/gateways.service";
import { ingestMeasurements, type RawReading } from "../measurements/ingest.service";
import { BeamDeviceDataInput, TelemetryInput } from "./iot.types";

function timestampToDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function isTodayBetweenOrEqualTo(
  startDate: Date | null,
  endDate: Date | null,
): boolean {
  if (!startDate || !endDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return today >= start && today <= end;
}

async function handleNodeData(telemetries: TelemetryInput[]): Promise<void> {
  if (telemetries.length === 0) return;

  const data = telemetries.map((t) => ({
    battery: t.Battery ?? 0,
    temperature: t.Temperature ?? 0,
    humidity: t.Humidity ?? 0,
    pressure: t.Pressure ?? 0,
    gatewayDeviceId: t.GatewayDeviceId,
    deviceId: t.DeviceId,
    deviceName: t.DeviceName ?? null,
    projectName: t.ProjectName ?? null,
    deviceType: t.DeviceType ?? null,
    deviceUpdatedAt: new Date(t.Timestamp * 1000),
  }));

  await prisma.nodeData.createMany({ data });
}

async function handleHeartbeatData(telemetries: TelemetryInput[]): Promise<void> {
  for (const telemetry of telemetries) {
    const device = await prisma.device.findFirst({
      where: {
        deviceId: telemetry.DeviceId,
        gatewayDeviceId: telemetry.GatewayDeviceId,
      } as never,
    });

    if (device) {
      await prisma.device.update({
        where: { id: device.id },
        data: {
          updateHeartBeat: new Date(telemetry.Timestamp * 1000),
        },
      });
    }
  }
}

async function handleSensorData(
  telemetries: TelemetryInput[],
  projectData: {
    projectId: number;
    projectName: string;
    projectUniqueID: string | null;
    deviceName: string | null;
    deviceId: number | null;
  },
): Promise<void> {
  for (const telemetry of telemetries) {
    if (!telemetry.Sensor) continue;

    const device = await prisma.device.findFirst({
      where: {
        deviceId: telemetry.DeviceId,
        gatewayDeviceId: telemetry.GatewayDeviceId,
      } as never,
    });

    if (!device) continue;

    // ORDERED BY CHANNEL NUMBER, because the payload's Channels array is
    // positional: the firmware's first reading is channel 1, the second is
    // channel 2, and so on.
    //
    // This query had no ordering at all, so the mapping depended on whatever
    // order Postgres happened to return rows in — which for this device was
    // 4, 1, 2, 3. Every reading was therefore attributed to the WRONG sensor,
    // silently and plausibly: the values looked reasonable, they were simply
    // recorded against the wrong instrument.
    //
    // Sorted numerically rather than by the VarChar column, or channel 10 would
    // sort before channel 2 once a device has more than nine.
    const channels = (
      await prisma.deviceChannel.findMany({
        where: { deviceId: String(device.id) },
      })
    ).sort((a, b) => Number(a.channelNumber) - Number(b.channelNumber));

    const pendingMeasurements: RawReading[] = [];

    let thresholdChannel: {
      assignSensor: string | null;
      triggerValue: string | null;
      thresholdValue: string | null;
      lastReading: number;
    } | null = null;

    for (let i = 0; i < telemetry.Sensor.Channels.length; i++) {
      const channelReading = telemetry.Sensor.Channels[i];
      const channel = channels[i];
      if (!channel || !channel.assignSensor) continue;

      // A channel the administrator has not selected is not in use.
      //
      // Nothing enforced this before: `activeStatus` was displayed in the
      // console and settable nowhere, so a channel shown as Inactive went on
      // storing readings and raising alerts exactly like an active one. Skipped
      // HERE, before storage and before the threshold comparison below, so
      // "not selected" means no history and no alerts rather than only one of
      // the two — a channel nobody is recording must not be emailing people
      // about a sensor that may not even be wired up.
      if (channel.activeStatus !== "one") continue;

      const sensor = await prisma.sensor.findUnique({
        where: { id: Number(channel.assignSensor) },
      });

      if (!sensor) continue;

      const sensorType = await prisma.sensorType.findUnique({
        where: { id: sensor.sensorTypeID },
      });

      if (!sensorType) continue;

      const sensorTypeMatch =
        sensorType.sensorType.toLowerCase().includes("strain") ||
        sensorType.sensorType.toLowerCase().includes("load cell") ||
        sensorType.sensorType.toLowerCase().includes("wheatstone") ||
        sensorType.sensorType.toLowerCase().includes("potentiometer") ||
        sensorType.sensorType.toLowerCase().includes("lvdt");

      if (!sensorTypeMatch) continue;

      const rawReading = Number(channelReading.RawReading);
      const calibrationValue = parseFloat(sensor.calibrationValue || "1");
      const actualReading = calibrationValue * rawReading;
      const measuredAt = new Date(telemetry.Timestamp * 1000);

      // Measurements v2: idempotent, quality-flagged, and placed at the
      // location that was in force at `measuredAt`. Collected here and written
      // as one batch after the channel loop.
      pendingMeasurements.push({
        sensorId: sensor.id,
        ts: measuredAt,
        rawValue: rawReading,
        sequenceNumber:
          channelReading.SequenceNumber !== undefined &&
          channelReading.SequenceNumber !== null
            ? BigInt(channelReading.SequenceNumber)
            : null,
        // Idempotency key. Preferred from the device; otherwise derived from
        // the identity of the reading itself, so a retried payload still
        // deduplicates instead of double-counting.
        eventId:
          channelReading.EventId ??
          `${telemetry.DeviceId}:${sensor.id}:${telemetry.Timestamp}:${i}`,
      });

      // Compatibility shim: reports, exports and the dashboard still read
      // sensor_data. Removed once those reads move to `measurements`.
      const sensorDataRow = await prisma.sensorData.create({
        data: {
          projectId: projectData.projectId,
          deviceId: telemetry.DeviceId,
          sensorId: String(sensor.id),
          sensorData: actualReading,
          createdAt: measuredAt,
        },
      });

      if (channel.triggerValue || channel.thresholdValue) {
        thresholdChannel = {
          assignSensor: channel.assignSensor,
          triggerValue: channel.triggerValue,
          thresholdValue: channel.thresholdValue,
          lastReading: actualReading,
        };
      }

      if (thresholdChannel) {
        const actualDateTime = timestampToDateTime(telemetry.Timestamp);
        await thresholdTriggeredAlert(
          Number(thresholdChannel.assignSensor),
          thresholdChannel.lastReading,
          sensorDataRow.id,
          actualDateTime,
          device.id,
          thresholdChannel.triggerValue,
          thresholdChannel.thresholdValue,
          projectData,
          device.deviceName,
        );
        thresholdChannel = null;
      }
    }

    if (pendingMeasurements.length > 0 && device.tenantId !== null) {
      await ingestMeasurements(pendingMeasurements, {
        tenantId: device.tenantId,
        deviceId: device.id,
        gatewayId: device.gatewayId,
      }).catch((err) => {
        // The compatibility write already succeeded; never lose a reading
        // because the new path had a problem.
        logger.error("Measurement ingest failed", err as Error);
      });
    }
  }
}

async function thresholdTriggeredAlert(
  sensorId: number,
  currentReading: number,
  sensorDataId: number,
  actualDateTime: string,
  deviceId: number,
  triggerValue: string | null,
  thresholdValue: string | null,
  projectData: {
    projectId: number;
    projectName: string;
    projectUniqueID: string | null;
    deviceName: string | null;
    deviceId: number | null;
  },
  deviceName: string | null,
): Promise<void> {
  if (!triggerValue && !thresholdValue) return;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // Dedup: only one notification per sensor per day (per project).
  const existingNotification = await prisma.notification.findFirst({
    where: {
      createdAt: { gte: todayStart, lte: todayEnd },
      sensorData: {
        sensorId: String(sensorId),
        projectId: projectData.projectId,
      },
    },
  });

  if (existingNotification) return;

  const lastFiveReadings = await prisma.sensorData.findMany({
    where: {
      sensorId: String(sensorId),
      createdAt: { gte: todayStart, lte: todayEnd },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (lastFiveReadings.length === 0) return;

  const readings = lastFiveReadings.map((r) => r.sensorData);
  const trigger = triggerValue ? parseFloat(triggerValue) : null;
  const threshold = thresholdValue ? parseFloat(thresholdValue) : null;

  let triggered = false;
  let alertType = "";

  if (trigger !== null && readings.every((r) => r < trigger)) {
    triggered = true;
    alertType = "Below Trigger Value";
  } else if (threshold !== null && readings.every((r) => r > threshold)) {
    triggered = true;
    alertType = "Above Threshold Value";
  }

  if (!triggered) return;

  await prisma.notification.create({
    data: {
      sensorDataId,
      min: triggerValue || null,
      max: thresholdValue || null,
      createdAt: new Date(),
    },
  });

  const sensor = await prisma.sensor.findUnique({
    where: { id: sensorId },
    include: { sensorType: true },
  });

  const projectEmails = await prisma.projectEmail.findMany({
    where: { projectId: projectData.projectId, isEnable: true },
    select: { email: true, name: true },
  });

  const recipients = projectEmails
    .map((e) => ({ email: e.email.trim(), name: e.name?.trim() || null }))
    .filter((e) => e.email.length > 0);

  if (recipients.length === 0) return;

  // Addressed to a person, not dumped at them. The reading that crossed its
  // limit is the first thing stated; the supporting detail follows for whoever
  // needs to act on it. Sent one message per recipient so each can be greeted
  // by name — the list is small (a project's contacts), and a shared BCC would
  // make every greeting wrong for everyone but the first.
  const structure = projectData.projectName;
  const sensorName = sensor?.sensorName || `sensor ${sensorId}`;
  const unit = sensor?.sensorType?.unit?.trim() || "";
  const isFailure = alertType === "Above Threshold Value";
  const limitName = isFailure ? "threshold" : "trigger";
  const headline = isFailure
    ? `Your structure has failed \u2014 ${structure}.`
    : `${structure} needs attention.`;
  const limitValue =
    alertType === "Above Threshold Value" ? thresholdValue : triggerValue;
  const direction = alertType === "Above Threshold Value" ? "above" : "below";

  for (const recipient of recipients) {
    const greeting = recipient.name ? `Hello ${recipient.name},` : "Hello,";

    const htmlMessage = `
    <html><body style="font-family:Arial,Helvetica,sans-serif;color:#1a1225;line-height:1.55">
      <p>${greeting}</p>

      <p style="font-size:17px;font-weight:700;color:${isFailure ? "#cc1c16" : "#1a1225"}">
        ${headline}
      </p>

      <p>
        The sensor <strong>${sensorName}</strong> has read
        <strong>${currentReading}${unit ? " " + unit : ""}</strong>, which is
        ${direction} its ${limitName} of
        <strong>${limitValue ?? "\u2014"}${unit ? " " + unit : ""}</strong>.
      </p>

      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px">
        <tr><td style="color:#5b5b5b">Structure</td><td><strong>${structure}</strong></td></tr>
        <tr><td style="color:#5b5b5b">Project ID</td><td>${projectData.projectUniqueID || "\u2014"}</td></tr>
        <tr><td style="color:#5b5b5b">Sensor</td><td>${sensorName}${sensor?.sensorType?.sensorType ? ` (${sensor.sensorType.sensorType})` : ""}</td></tr>
        <tr><td style="color:#5b5b5b">Device</td><td>${projectData.deviceName || "\u2014"}</td></tr>
        <tr><td style="color:#5b5b5b">Reading</td><td><strong>${currentReading}${unit ? " " + unit : ""}</strong></td></tr>
        <tr><td style="color:#5b5b5b">Trigger</td><td>${triggerValue ?? "\u2014"}${unit && triggerValue ? " " + unit : ""}</td></tr>
        <tr><td style="color:#5b5b5b">Threshold</td><td>${thresholdValue ?? "\u2014"}${unit && thresholdValue ? " " + unit : ""}</td></tr>
        <tr><td style="color:#5b5b5b">Recorded</td><td>${actualDateTime}</td></tr>
      </table>

      <p>Recent readings: ${readings.join(", ")}</p>

      <p>Please check the structure and the sensor before acting on this reading:
         a limit can be crossed by a fault in the instrument as well as by the
         structure itself.</p>

      <p style="color:#5b5b5b;font-size:13px">
        Sent automatically by the Cloudglance monitoring console. You are
        receiving this because you are on the contact list for ${structure}.
      </p>
    </body></html>
  `;

    await sendEmail({
      to: recipient.email,
      subject: isFailure
        ? `Structure failed: ${structure} \u2014 ${sensorName} past its threshold`
        : `${structure}: ${sensorName} is ${direction} its ${limitName}`,
      html: htmlMessage,
    });
  }
}

export async function getNodeData(userId: number, userType: string) {
  if (userType === "superadmin") {
    const data = await prisma.nodeData.findMany({
      orderBy: { id: "desc" },
    });
    return { status_code: 200, message: "success", data };
  }

  const devices = await prisma.device.findMany({
    where: {
      OR: [{ assignedAdmin: userId }, { addedBy: userId }],
      isDelete: "false_" as never,
    } as never,
    select: { deviceId: true, gatewayDeviceId: true },
  });

  const deviceIds = devices
    .map((d) => d.deviceId)
    .filter((v): v is string => Boolean(v));
  const gatewayDeviceIds = devices.map((d) => d.gatewayDeviceId);

  const data = await prisma.nodeData.findMany({
    where: {
      OR: [
        ...(deviceIds.length ? [{ deviceId: { in: deviceIds } }] : []),
        ...(gatewayDeviceIds.length
          ? [{ gatewayDeviceId: { in: gatewayDeviceIds } }]
          : []),
      ],
    },
    orderBy: { id: "desc" },
  });

  return { status_code: 200, message: "success", data };
}

export async function getSensorData(
  deviceId: string,
  gatewayDeviceId: string,
  userId: number,
  userType: string,
) {
  if (userType !== "superadmin") {
    const device = await prisma.device.findFirst({
      where: {
        deviceId,
        gatewayDeviceId,
        OR: [{ assignedAdmin: userId }, { addedBy: userId }],
        isDelete: "false_" as never,
      } as never,
      select: { id: true },
    });

    if (!device) {
      throw new ForbiddenError("You do not have access to this device");
    }
  }

  const sensorData = await prisma.sensorData.findMany({
    where: {
      deviceId,
    },
    orderBy: { createdAt: "desc" },
  });

  return { status_code: 200, message: "success", data: sensorData };
}

export async function deleteNodeData(idList: number[]) {
  await prisma.nodeData.deleteMany({
    where: {
      id: { in: idList },
    },
  });

  return { status_code: 200, message: "Node data deleted successfully" };
}

export async function createNetworkDataFromDevice(input: BeamDeviceDataInput) {
  const { Type, Telemetries } = input;

  if (!Telemetries || Telemetries.length === 0) {
    return { status_code: 200, message: "No telemetries to process" };
  }

  const gatewayDeviceId = Telemetries[0].GatewayDeviceId;

  // Gateway liveness is recorded FIRST, before the device and project lookups
  // below can reject the payload.
  //
  // A gateway must be able to prove it is alive before it carries any project:
  // that is exactly the moment an installer is standing at a roadside cabinet
  // asking whether the unit is reaching the cloud. Gating liveness behind "is
  // there a running project?" made a freshly commissioned gateway
  // indistinguishable from a dead one.
  if (gatewayDeviceId) {
    await recordHeartbeat({
      gatewayKey: gatewayDeviceId,
      seenAt: new Date(Telemetries[0].Timestamp * 1000),
    }).catch(() => {
      // Never let gateway bookkeeping reject field telemetry.
    });
  }

  const device = await prisma.device.findFirst({
    where: {
      gatewayDeviceId,
      isDelete: "false_" as never,
      status: "one" as never,
    } as never,
  });

  if (!device) {
    return { status_code: 200, message: "No device found for gateway" };
  }

  const project = await prisma.project.findFirst({
    where: {
      deviceId: String(device.id),
      isDelete: false,
      isRegistered: true,
    } as never,
  });

  if (!project) {
    return { status_code: 200, message: "No active project found for device" };
  }

  // The project's STATUS decides whether readings are kept — not the calendar.
  //
  // This was a date-window check, which made the dashboard controls misleading
  // in both directions: pausing a project went on collecting, because pause
  // touches no date, and a started project whose planned dates had passed
  // silently dropped everything with no visible reason. Ending only appeared to
  // work because it clears deviceId and the lookup above then finds no project
  // — an accident that stopped being enough once a project could be reopened,
  // since a reopened project sits paused with no device.
  //
  // Planned dates are now what they read like: a plan. Start collects, pause
  // suspends, end stops.
  //
  // Returned as 200 rather than an error, exactly as before: a rejected payload
  // makes a field gateway retry the same reading indefinitely, and a paused
  // project is a deliberate state, not a fault.
  if (project.status !== "start") {
    return {
      status_code: 200,
      message: `Project is ${project.status === "pause" ? "paused" : "not running"}; reading discarded`,
    };
  }

  const projectData = {
    projectId: project.id,
    projectName: project.projectName,
    projectUniqueID: project.projectUniqueID,
    deviceName: device.deviceName,
    deviceId: device.id,
  };

  switch (Type) {
    case "NodeData":
      await handleNodeData(Telemetries);
      break;

    case "HeartbeatData":
      await handleHeartbeatData(Telemetries);
      break;

    case "SensorData":
      await handleSensorData(Telemetries, projectData);
      break;

    case "NetworkData":
      break;

    default:
      break;
  }

  return { status_code: 200, message: "Data processed successfully" };
}
