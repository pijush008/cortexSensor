import mqtt from "mqtt";
import prisma from "../../config/prisma";
import { config } from "../../config";
import { sendEmail } from "../../utils/email";
import { logger } from "../../utils/logger";
import { ForbiddenError } from "../../utils/AppError";
import { recordHeartbeat } from "../gateways/gateways.service";
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

let mqttPublisher: ReturnType<typeof mqtt.connect> | null = null;
let mqttPublisherStarted = false;

/**
 * Reuse a single long-lived MQTT client for outbound publishing
 * (calibrated sensor readings → dashboard topics). Falls back to a
 * per-message client only if the singleton is not yet connected.
 */
function getMqttPublisher(): ReturnType<typeof mqtt.connect> {
  if (!mqttPublisherStarted) {
    mqttPublisherStarted = true;
    if (!config.mqtt.brokerUrl) {
      logger.warn("MQTT publish skipped: MQTT_BROKER_URL is empty");
      return null as never;
    }
    mqttPublisher = mqtt.connect(config.mqtt.brokerUrl, {
      username: config.mqtt.username,
      password: config.mqtt.password,
      clientId: `${config.mqtt.ingestClientId}-pub`,
      protocolVersion: 5,
      keepalive: 30,
      clean: true,
    });
    mqttPublisher.on("error", (err) => {
      logger.error(`MQTT publisher error: ${err.message}`);
    });
    mqttPublisher.on("close", () => {
      logger.warn("MQTT publisher disconnected");
    });
  }
  return mqttPublisher as ReturnType<typeof mqtt.connect>;
}

function publishMqtt(topic: string, message: object): void {
  const brokerUrl = config.mqtt.brokerUrl;
  if (!brokerUrl) return;

  const publisher = getMqttPublisher();
  if (!publisher || publisher.connected) {
    if (publisher?.connected) {
      publisher.publish(topic, JSON.stringify(message), {}, (err) => {
        if (err) logger.error(`MQTT publish failed: ${err.message}`);
      });
      return;
    }
  }

  // Singleton not connected yet: fall back to a one-shot publish.
  const client = mqtt.connect(brokerUrl, {
    username: config.mqtt.username,
    password: config.mqtt.password,
  });

  client.on("connect", () => {
    client.publish(topic, JSON.stringify(message), {}, () => {
      client.end();
    });
  });

  client.on("error", (err) => {
    logger.error(`MQTT publish error: ${err.message}`);
    client.end();
  });
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

    const channels = await prisma.deviceChannel.findMany({
      where: { deviceId: String(device.id) },
    });

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

      const sensorDataRow = await prisma.sensorData.create({
        data: {
          projectId: projectData.projectId,
          deviceId: telemetry.DeviceId,
          sensorId: String(sensor.id),
          sensorData: actualReading,
          createdAt: new Date(telemetry.Timestamp * 1000),
        },
      });

      publishMqtt(`shm/feed/${telemetry.DeviceId}/${sensor.id}`, {
        sensorId: sensor.id,
        sensorName: sensor.sensorName,
        reading: actualReading,
        rawReading,
        calibrationValue,
        timestamp: telemetry.Timestamp,
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
    select: { email: true },
  });

  const emailList = projectEmails.map((e) => e.email.trim()).filter(Boolean);

  if (emailList.length === 0) return;

  const htmlMessage = `
    <html><body>
      <div style="color: red; font-weight: bold; font-size: 16px;">
        THRESHOLD ALERT: ${alertType}
      </div>
      <p><strong>Project Details:</strong></p>
      <ul>
        <li><strong>Project Name:</strong> ${projectData.projectName}</li>
        <li><strong>Project Unique ID:</strong> ${projectData.projectUniqueID || "N/A"}</li>
      </ul>
      <p><strong>Device Details:</strong></p>
      <ul>
        <li><strong>Device Table ID:</strong> ${projectData.deviceId || "N/A"}</li>
        <li><strong>Device Name:</strong> ${projectData.deviceName || "N/A"}</li>
        <li><strong>Device ID (Ackcio):</strong> ${deviceId}</li>
      </ul>
      <p><strong>Sensor Details:</strong></p>
      <ul>
        <li><strong>Sensor ID:</strong> ${sensorId}</li>
        <li><strong>Sensor Name:</strong> ${sensor?.sensorName || "N/A"}</li>
        <li><strong>Sensor Type:</strong> ${sensor?.sensorType?.sensorType || "N/A"}</li>
        <li><strong>Current Reading:</strong> ${currentReading}</li>
        <li><strong>Trigger Value:</strong> ${triggerValue || "N/A"}</li>
        <li><strong>Threshold Value:</strong> ${thresholdValue || "N/A"}</li>
        <li><strong>Last 5 Readings:</strong> ${readings.join(", ")}</li>
      </ul>
      <p><strong>Alert Status:</strong> ${alertType}</p>
      <p><strong>Alert Time:</strong> ${actualDateTime}</p>
      <p>Please review the sensor data and take appropriate action.</p>
      <p><em>This is a system-generated email. Please do not reply.</em></p>
    </body></html>
  `;

  await sendEmail({
    to: emailList[0],
    subject: `Threshold Alert: ${projectData.projectName} - ${alertType}`,
    html: htmlMessage,
    bcc: emailList.length > 1 ? emailList.slice(1).join(",") : undefined,
  });
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

  if (!isTodayBetweenOrEqualTo(project.startDate, project.endDate)) {
    return { status_code: 200, message: "Project is not currently running" };
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
