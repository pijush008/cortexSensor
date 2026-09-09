import { z } from "zod";

export const dashboardBodySchema = z.object({
  userId: z.string(),
  userType: z.string(),
});

export const graphBodySchema = z.object({
  userId: z.string(),
  userType: z.string(),
  type: z.enum(["week", "month", "year"]),
  desireUserType: z.string().optional(),
});

export type DashboardBodyInput = z.infer<typeof dashboardBodySchema>;
export type GraphBodyInput = z.infer<typeof graphBodySchema>;
