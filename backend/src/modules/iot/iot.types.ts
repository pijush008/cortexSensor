import { z } from "zod";

const telemetrySchema = z.object({
  Battery: z.number().optional(),
  Temperature: z.number().optional(),
  Humidity: z.number().optional(),
  Pressure: z.number().optional(),
  GatewayDeviceId: z.string(),
  DeviceId: z.string(),
  DeviceName: z.string().optional(),
  ProjectName: z.string().optional(),
  DeviceType: z.string().optional(),
  Timestamp: z.number(),
  Sensor: z
    .object({
      SensorType: z.string(),
      Channels: z.array(
        z.object({
          RawReading: z.number(),
        }),
      ),
    })
    .optional(),
});

export const beamDeviceDataSchema = z.object({
  Type: z.enum(["NodeData", "HeartbeatData", "SensorData", "NetworkData"]),
  Telemetries: z.array(telemetrySchema),
});

export type BeamDeviceDataInput = z.infer<typeof beamDeviceDataSchema>;
export type TelemetryInput = z.infer<typeof telemetrySchema>;

export const sensorDataQuerySchema = z.object({
  deviceId: z.string().min(1, "Device ID is required"),
  GatewayDeviceId: z.string().min(1, "Gateway Device ID is required"),
});

export type SensorDataQuery = z.infer<typeof sensorDataQuerySchema>;

export const deleteNodeDataSchema = z.object({
  idList: z.array(z.number().int().positive()),
});

export type DeleteNodeDataInput = z.infer<typeof deleteNodeDataSchema>;
