import { z } from "zod";

export const projectAddSchema = z.object({
  projectId: z.string().optional(),
  projectName: z.string().min(1, "Project name is required"),
  projectUniqueID: z.string().optional().nullable(),
  projectLocation: z.string().min(1, "Project location is required"),
  startDate: z.string().optional().nullable(),
  actualStartDate: z.string().optional().nullable(),
  projectLogo: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  contractorId: z.string().optional().nullable(),
  authorityId: z.string().optional().nullable(),
  deviceId: z.string().optional().nullable(),
  sensorId: z.string().optional().nullable(),
  createdBy: z.string().optional().nullable(),
});

export type ProjectAddInput = z.infer<typeof projectAddSchema>;

export const projectUpdateSchema = z.object({
  projectId: z.string().min(1),
  projectName: z.string().min(1),
  projectLocation: z.string().min(1),
  contractorId: z.string().optional().nullable(),
  authorityId: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

export const projectDetailUpdateSchema = z.object({
  dashImage: z.string().optional().nullable(),
  dashImage2: z.string().optional().nullable(),
});

export type ProjectDetailUpdateInput = z.infer<typeof projectDetailUpdateSchema>;

export const projectCodeSchema = z.object({
  adminName: z.string().min(1),
  contractorName: z.string().min(1),
  authorityName: z.string().min(1),
});

export type ProjectCodeInput = z.infer<typeof projectCodeSchema>;

export const projectListQuerySchema = z.object({
  searchTerm: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
  filterType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;

export const projectStartQuerySchema = z.object({
  statusType: z.enum(["start", "pause", "end"]).default("start"),
});

export type ProjectStartQuery = z.infer<typeof projectStartQuerySchema>;

export const projectOffsetSchema = z.object({
  offset: z.coerce.number().int(),
});

export type ProjectOffsetInput = z.infer<typeof projectOffsetSchema>;

export const dashboardDataParamsSchema = z.object({
  uniqueId: z.string().min(1),
});

export const emailSettingSchema = z.object({
  uniqueId: z.string().min(1),
  emails: z.array(
    z.object({
      emailId: z.number(),
      isEnable: z.boolean(),
    }),
  ),
});

export type EmailSettingInput = z.infer<typeof emailSettingSchema>;

export const channelUpdateSchema = z.object({
  channelUpdate: z.array(
    z.object({
      channelId: z.string(),
      sensorId: z.string(),
      sensorName: z.string().optional(),
      triggeredValue: z.string().optional().nullable(),
      thresholdValue: z.string().optional().nullable(),
    }),
  ),
});

export type ChannelUpdateInput = z.infer<typeof channelUpdateSchema>;

export const projectSetupSchema = z.object({
  deviceId: z.string().optional(),
});

export type ProjectSetupInput = z.infer<typeof projectSetupSchema>;

export const projectAnalysisSchema = z.object({});

export type ProjectAnalysisInput = z.infer<typeof projectAnalysisSchema>;
