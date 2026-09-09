import { z } from "zod";

export const downloadListParamsSchema = z.object({
  userType: z.string(),
  adminId: z.string(),
});

export const downloadDeviceParamsSchema = z.object({
  adminId: z.string(),
});

export const downloadSensorParamsSchema = z.object({
  adminId: z.string(),
});

export const downloadProjectsParamsSchema = z.object({
  adminId: z.string(),
});

export const exportCsvParamsSchema = z.object({
  uniqueId: z.string(),
});

export const importCsvParamsSchema = z.object({
  uniqueId: z.string(),
});

/**
 * Filters for downloading raw telemetry (sensor readings / node health) that
 * was captured from ESP32 nodes & Raspberry Pi gateways (live MQTT or REST key).
 */
export const downloadTelemetryBodySchema = z.object({
  projectId: z.number().int().positive().optional(),
  deviceId: z.string().optional(),
  sensorId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type DownloadTelemetryBody = z.infer<typeof downloadTelemetryBodySchema>;

export type DownloadListParams = z.infer<typeof downloadListParamsSchema>;
export type DownloadDeviceParams = z.infer<typeof downloadDeviceParamsSchema>;
export type DownloadSensorParams = z.infer<typeof downloadSensorParamsSchema>;
export type DownloadProjectsParams = z.infer<typeof downloadProjectsParamsSchema>;
export type ExportCsvParams = z.infer<typeof exportCsvParamsSchema>;
export type ImportCsvParams = z.infer<typeof importCsvParamsSchema>;
