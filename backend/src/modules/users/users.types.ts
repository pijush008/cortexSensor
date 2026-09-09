import { z } from "zod";

export const userListParamsSchema = z.object({
  userType: z.string(),
  adminId: z.string(),
});

export const userListQuerySchema = z.object({
  verifyType: z.string().optional(),
  searchTerm: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
});

export const csvAccessParamsSchema = z.object({
  userId: z.string(),
  csv: z.string(),
});

export const assignedSensorQuerySchema = z.object({
  searchTerm: z.string().optional(),
  sensorTypeList: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
});

export const assignedDeviceQuerySchema = z.object({
  isNotOngoing: z.string().optional(),
  deviceStatus: z.string().optional(),
  searchTerm: z.string().optional(),
  deviceTypeList: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
});

export type UserListParams = z.infer<typeof userListParamsSchema>;
export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type CsvAccessParams = z.infer<typeof csvAccessParamsSchema>;
export type AssignedSensorQuery = z.infer<typeof assignedSensorQuerySchema>;
export type AssignedDeviceQuery = z.infer<typeof assignedDeviceQuerySchema>;
