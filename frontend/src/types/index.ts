export type UserRole = "superadmin" | "admin" | "contractor" | "authority";

export interface LoginResponse {
  status_code: number;
  message: string | null;
  error: unknown;
  userID: number;
  type: UserRole;
}

export interface User {
  id: number;
  userType: UserRole;
  parentId: number;
  firstName: string;
  lastName: string;
  emailId: string;
  phoneNo: string;
  isMailVerified: string;
  isUserVerified: string;
  profileImage: string | null;
  status: string;
  csv: number | null;
}

export interface Device {
  id: number;
  deviceName: string;
  deviceType: number;
  channelCount: number;
  deviceId: string | null;
  gatewayDeviceId: string;
  deviceStatus: string;
  deviceStartDate: string;
  assignedAdmin: number | null;
  createdAt: string;
  deviceTypeName?: string;
}

export interface Sensor {
  sensorId: number;
  sensorName: string;
  sensorTypeID: number;
  calibrationValue: string | null;
  sensorType: string;
  sensorIcon: string | null;
  projectName: string | null;
  deviceId: string | null;
  firstName: string | null;
  adminId: number | null;
}

export interface SensorType {
  id: number;
  sensorType: string;
  sensorIcon: string;
  calibrationValue: string;
  unit: string | null;
}

export interface DeviceType {
  deviceTypeId: number;
  deviceType: string;
  deviceImage: string | null;
}

export interface Project {
  id: number;
  projectId?: number;
  projectName: string;
  projectUniqueID: string | null;
  uniqueId: string | null;
  projectLocation: string;
  startDate: string;
  actualStartDate: string | null;
  endDate: string | null;
  status: string;
  offset: number;
  createdBy: number;
  deviceId: string | null;
  sensorId: string | null;
  createdAt: string;
  contractorId: number | null;
  authorityId: number | null;
  adminFirstName?: string | null;
  adminLastName?: string | null;
  contractorFirstName?: string | null;
  contractorLastName?: string | null;
  authorityFirstName?: string | null;
  authorityLastName?: string | null;
}

export interface GraphPoint {
  label: string;
  count: number;
}

export interface DashboardStats {
  upcomingProjects: number;
  runningProjects: number;
  pausedProjects: number;
  adminCount?: number;
  contractorCount?: number;
  authorityCount?: number;
  totalDevices?: number;
  ongoingDevices?: number;
  adminGraph?: GraphPoint[];
  contractorGraph?: GraphPoint[];
  authorityGraph?: GraphPoint[];
  deviceGraph?: GraphPoint[];
  sensorGraph?: GraphPoint[];
  projectGraph?: GraphPoint[];
}

export interface ReportSensorData {
  sensorId: string;
  data: {
    sensorData: number | null;
    createdAt: string | null;
  }[];
}

export interface NodeData {
  id: number;
  battery: number | null;
  temperature: number;
  humidity: number;
  pressure: number;
  gatewayDeviceId: string | null;
  deviceId: string | null;
  deviceName: string | null;
  projectName: string | null;
  deviceType: string | null;
  createdAt: string;
  deviceUpdatedAt: string;
}

export interface ChannelListItem {
  channelId: number;
  channelNumber: string;
  channelName: string | null;
  triggerValue: string | null;
  thresholdValue: string | null;
  activeStatus: string;
  assignSensor: string | null;
  unit: string | null;
  sensorName: string | null;
  sensorCalibrationValue: string | null;
  sensorTypeName: string | null;
  sensorIcon: string | null;
  sensorTypeCalibrationValue: string | null;
}

export interface ChannelListResponse {
  status_code: number;
  success: string;
  error: unknown;
  lastUpdateBy: string | null;
  lastUpdateAt: string | null;
  projectDetail: { currentData: ChannelListItem[] };
}

export interface ChannelSensorUpdate {
  sensorId: number;
  channel: number;
  isEnable: number | string;
  triggerValue?: string | null;
  thresholdValue?: string | null;
}

export interface PlanLimits {
  structures: number | null;
  sensors: number | null;
  users: number | null;
  dataRetentionDays: number | null;
}

export interface PlanFeatures {
  apiAccess: boolean;
  smsAlerts: boolean;
  aiFeatures: boolean;
  advancedReports: boolean;
  femIntegration: boolean;
  sso: boolean;
}

export interface BillingPlanSummary {
  code: string;
  name: string;
  priceLabel: string;
  periodLabel?: string;
  description?: string;
  currency: string;
  limits: PlanLimits;
  features: PlanFeatures;
}

export interface SubscriptionUsage {
  structures: number;
  sensors: number;
  users: number;
}

export interface SubscriptionPlanView {
  scheme: "complimentary" | "subscription";
  plan: BillingPlanSummary;
  status: string;
  autoRenew: boolean;
  renewsOn: string | null;
  usage?: SubscriptionUsage;
  plans?: BillingPlanSummary[];
}

export interface InvoiceRecord {
  invoiceNo: string;
  periodStart: string;
  periodEnd: string;
  amountLabel: string;
  currency: string;
  status: string;
  createdAt: string;
}