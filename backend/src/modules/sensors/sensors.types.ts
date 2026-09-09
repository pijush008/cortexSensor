import { z } from "zod";

export const sensorAddSchema = z.object({
  sensorTypeID: z.string().min(1, "Sensor type ID is required"),
  sensorName: z.string().min(1, "Sensor name is required"),
  calibrationValue: z.string().min(1, "Calibration value is required"),
  unit: z.string().min(1, "Unit is required"),
});

export const sensorUpdateSchema = z.object({
  sensorTypeID: z.string().optional(),
  sensorName: z.string().optional(),
  calibrationValue: z.string().optional(),
  unit: z.string().optional(),
});

export const sensorTypeAddSchema = z.object({
  sensorType: z.string().min(1, "Sensor type is required"),
  sensorIcon: z.string().min(1, "Sensor icon is required"),
  unit: z.string().optional(),
  calibrationValue: z.string().nullable().optional(),
});

export const sensorTypeUpdateSchema = z.object({
  sensorType: z.string().optional(),
  sensorIcon: z.string().optional(),
  unit: z.string().optional(),
  calibrationValue: z.string().nullable().optional(),
});

export const assignSensorAdminSchema = z.object({
  sensorId: z.string(),
  adminId: z.string().optional(),
});

export const sensorListQuerySchema = z.object({
  searchTerm: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
});

export const sensorListOnTypeParamsSchema = z.object({
  assignType: z.string(),
  adminId: z.string(),
});

export const sensorDataFromDeviceSchema = z.object({
  device_id: z.string().min(1, "device_id is required"),
  sensor_id: z.string().min(1, "sensor_id is required"),
  sensor_calibration: z.string().min(1, "sensor_calibration is required"),
});

export type SensorAddInput = z.infer<typeof sensorAddSchema>;
export type SensorUpdateInput = z.infer<typeof sensorUpdateSchema>;
export type SensorTypeAddInput = z.infer<typeof sensorTypeAddSchema>;
export type SensorTypeUpdateInput = z.infer<typeof sensorTypeUpdateSchema>;
export type AssignSensorAdminInput = z.infer<typeof assignSensorAdminSchema>;
export type SensorListQuery = z.infer<typeof sensorListQuerySchema>;
export type SensorDataFromDeviceInput = z.infer<typeof sensorDataFromDeviceSchema>;
