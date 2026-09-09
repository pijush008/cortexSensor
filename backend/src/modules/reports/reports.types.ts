import { z } from "zod";

export const reportSensorListSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  offset: z.string(),
  frequency: z.string().optional(),
  sensorList: z.string().optional(),
});

export const reportSensorDataSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  offset: z.string(),
  frequency: z.string().optional(),
});

export const reportSensorListGraphSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  frequency: z.string().optional(),
});

export const reportSensorListMultipleGraphSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  frequency: z.string().optional(),
  sensorIds: z.string().optional(),
});

export type ReportSensorListInput = z.infer<typeof reportSensorListSchema>;
export type ReportSensorDataInput = z.infer<typeof reportSensorDataSchema>;
export type ReportSensorListGraphInput = z.infer<
  typeof reportSensorListGraphSchema
>;
export type ReportSensorListMultipleGraphInput = z.infer<
  typeof reportSensorListMultipleGraphSchema
>;
