import { z } from "zod";

export const deviceAddSchema = z.object({
  deviceName: z.string().min(1, "Device name is required"),
  channelCount: z.string().min(1, "Channel count is required"),
  deviceType: z.string().min(1, "Device type is required"),
  deviceId: z.string().nullable().optional(),
  gatewayDeviceId: z.string().nullable().optional(),
  addedBy: z.string().nullable().optional(),
  deviceStartDate: z.string().nullable().optional(),
});

export const deviceUpdateSchema = z.object({
  deviceName: z.string().min(1, "Device name is required"),
  deviceId: z.string().nullable().optional(),
  gatewayDeviceId: z.string().nullable().optional(),
  channelCount: z.string().min(1, "Channel count is required"),
  deviceStartDate: z.string().nullable().optional(),
  deviceType: z.string().nullable().optional(),
});

export const assignSensorSchema = z.object({
  deviceId: z.number(),
  userId: z.number(),
  sensorIds: z.array(
    z.object({
      sensorId: z.number(),
      channel: z.number(),
      isEnable: z.union([z.string(), z.number()]),
      triggerValue: z.string().nullable().optional(),
      thresholdValue: z.string().nullable().optional(),
    }),
  ),
});

export const unassignSensorSchema = z.object({
  deviceId: z.number(),
  sensorIds: z.array(
    z.object({
      sensorId: z.number(),
    }),
  ),
});

export const deviceListQuerySchema = z.object({
  deviceStatus: z.string().optional(),
  searchTerm: z.string().optional(),
  deviceTypeList: z.string().optional(),
  /**
   * "1" narrows the list to devices a project could actually be created with:
   * not already claimed by a live project, and with sensors assigned.
   *
   * A filter rather than a separate endpoint, because it answers the same
   * question as the devices screen — which devices are there — with one extra
   * condition, and the scoping rules that keep one organization's hardware out
   * of another's list must not be written twice.
   */
  availableForProject: z.string().optional(),
  /**
   * The organization whose devices to list. Honoured ONLY for a platform
   * operator, who belongs to none and must say which they are acting for;
   * everybody else stays scoped to their own, whatever they send.
   */
  tenantId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
});

export const assignDeviceQuerySchema = z.object({
  deviceId: z.string(),
  adminId: z.string().optional(),
});

export type DeviceAddInput = z.infer<typeof deviceAddSchema>;
export type DeviceUpdateInput = z.infer<typeof deviceUpdateSchema>;
export type AssignSensorInput = z.infer<typeof assignSensorSchema>;
export type UnassignSensorInput = z.infer<typeof unassignSensorSchema>;
export type DeviceListQuery = z.infer<typeof deviceListQuerySchema>;
