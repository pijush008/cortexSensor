/**
 * `viewer` is a self-service (Google) sign-up: no organization, and the project
 * directory is the only thing they may open. Distinct from `authority`, which
 * is a project stakeholder.
 */
export type UserRole =
  | "superadmin"
  | "admin"
  | "contractor"
  | "authority"
  | "viewer";

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
  /** Null until someone edits the device; the API returns it either way. */
  updatedAt: string | null;
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
  /** Resolved from the device row by the list endpoint; absent on some shapes. */
  deviceName?: string | null;
  /** The Ackcio gateway this project owns, from the list endpoint. */
  gatewayId?: number | null;
  gatewayName?: string | null;
  gatewayKey?: string | null;
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
  /** Percent, from the ESP32 firmware. Null for an Ackcio node. */
  battery: number | null;
  /** Millivolts, from an Ackcio node. Null for the ESP32 firmware. */
  batteryMillivolts: number | null;
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
  /** The card's bullet list, worded by the server so every screen matches. */
  highlights: string[];
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
// ─── Structures & locations ──────────────────────────────────────────────────

export type StructureType =
  | "bridge"
  | "flyover"
  | "building"
  | "tower"
  | "dam"
  | "tunnel"
  | "railway"
  | "pier"
  | "industrial"
  | "other";

export type StructureStatus =
  | "planned"
  | "commissioning"
  | "monitoring"
  | "paused"
  | "decommissioned";

export interface Structure {
  id: number;
  /** Immutable external identifier; the name and code are editable. */
  publicId: string;
  projectId: number;
  projectName: string | null;
  projectUniqueId: string | null;
  name: string;
  code: string;
  type: StructureType;
  status: StructureStatus;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  siteAddress: string | null;
  constructionYear: number | null;
  spanCount: number | null;
  lengthMetres: number | null;
  material: string | null;
  designStandard: string | null;
  commissionedAt: string | null;
  locationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StructureListResponse {
  status_code: number;
  message: string | null;
  items: Structure[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Location {
  id: number;
  publicId: string;
  structureId: number;
  name: string;
  code: string;
  description: string | null;
  stationMetres: number | null;
  elevationMetres: number | null;
  offsetXMetres: number | null;
  offsetYMetres: number | null;
  offsetZMetres: number | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Gateways ────────────────────────────────────────────────────────────────

export type GatewayStatus =
  | "provisioning"
  | "active"
  | "degraded"
  | "offline"
  | "maintenance"
  | "decommissioned";

/** Derived from the last heartbeat — never a stored opinion. */
export type GatewayConnectivity =
  | "never_reported"
  | "online"
  | "stale"
  | "offline";

export interface Gateway {
  id: number;
  publicId: string;
  /** Identifier the hardware reports as GatewayDeviceId. */
  gatewayKey: string;
  name: string;
  description: string | null;
  status: GatewayStatus;
  firmwareVersion: string | null;
  hardwareModel: string | null;
  projectId: number | null;
  structureId: number | null;
  locationId: number | null;
  /** Null when the gateway has never reported. */
  lastSeenAt: string | null;
  /** Null when unknown — which is different from an empty buffer. */
  bufferedCount: number | null;
  deviceCount: number;
  connectivity: GatewayConnectivity;
  secondsSinceLastSeen: number | null;
  /** The project that owns this gateway, or null while it is available. */
  projectName: string | null;
  claimedAt: string | null;
  /** Derived from the claim: whether a project could take this gateway. */
  availability: "available" | "assigned" | "decommissioned";
  /** Whether a push URL has been issued. The token itself is never listed. */
  hasIngestToken: boolean;
  ingestTokenIssuedAt: string | null;
  ingestTokenLastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The push URL, returned exactly once when it is issued. */
export interface IssuedIngestToken {
  token: string;
  url: string;
  issuedAt: string;
}

/** One channel of one sensor on a node, as the gateway last reported it. */
export interface GatewayChannelSnapshot {
  sensorIndex: number;
  channelId: number;
  channelNumber: string;
  code: string | null;
  group: string | null;
  sensorType: string | null;
  channelType: string | null;
  address: string | null;
  sensorId: number | null;
  sensorName: string | null;
  platformType: string | null;
  reading: number | null;
  rawReading: number | null;
  unit: string | null;
  rawUnit: string | null;
  description: string | null;
  isError: boolean;
  ts: string;
}

export interface GatewayNodeSnapshot {
  device: {
    id: number;
    nodeKey: string | null;
    name: string;
    type: string | null;
    lifecycle: string;
    lastSeenAt: string | null;
  };
  /** Null until the node has sent a health report. */
  health: {
    ts: string;
    batteryMillivolts: number | null;
    batteryPercent: number | null;
    temperature: number;
    humidity: number;
    pressure: number;
  } | null;
  /** Null until the node has sent a link report. */
  link: {
    ts: string;
    parentKey: string | null;
    etx: number | null;
    rssi: number | null;
  } | null;
  channels: GatewayChannelSnapshot[];
}

export interface GatewayTelemetry {
  gateway: {
    id: number;
    name: string;
    gatewayKey: string;
    status: GatewayStatus;
    connectivity: GatewayConnectivity;
    secondsSinceLastSeen: number | null;
    lastSeenAt: string | null;
    hasIngestToken: boolean;
    ingestTokenIssuedAt: string | null;
    ingestTokenLastUsedAt: string | null;
  };
  /** Null until the gateway has sent a heartbeat. */
  heartbeat: {
    ts: string;
    disk: string | null;
    diskUsed: number | null;
    diskSpace: number | null;
    powerInVolts: number | null;
    powerInCurrent: number | null;
    temperature: number | null;
    humidity: number | null;
    pressure: number | null;
    dataUsage: number | null;
    internetMode: string | null;
  } | null;
  nodes: GatewayNodeSnapshot[];
}

export interface GatewayListResponse {
  status_code: number;
  message: string | null;
  items: Gateway[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

export type AnalysisStatus = "queued" | "running" | "succeeded" | "failed";

export interface SpectrumPeak {
  frequency_hz: number;
  magnitude: number;
  prominence: number;
  bandwidth_hz: number | null;
  /** Half-power estimate. Null when the peak is narrower than one bin. */
  damping_ratio: number | null;
  /** One FFT bin: no shift smaller than this is measurable. */
  resolution_hz: number;
}

export interface BaselineMatch {
  baseline_frequency_hz: number;
  current_frequency_hz: number;
  shift_hz: number;
  shift_percent: number | null;
  resolution_hz: number;
  exceeds_resolution: boolean;
}

export interface SpectrumResult {
  engine_version: string;
  method: string;
  sample_rate_hz: number;
  window: string;
  detrend: string;
  segment_length: number;
  frequency_resolution_hz: number;
  sample_count: number;
  duration_seconds: number;
  frequencies_hz: number[];
  psd: number[];
  peaks: SpectrumPeak[];
  limitations: string[];
  warnings: string[];
  excludedReadings?: number;
  samplingJitterRatio?: number | null;
  baselineComparison?: {
    matched: BaselineMatch[];
    unmatched_current_hz: number[];
    unmatched_baseline_hz: number[];
    interpretation: string;
  } | null;
}

export interface AnalysisRun {
  id: number;
  publicId: string;
  kind: string;
  status: AnalysisStatus;
  sensorId: number;
  windowFrom: string;
  windowTo: string;
  sampleRateHz: number | null;
  method: string | null;
  engineVersion: string | null;
  baselineId: number | null;
  result: SpectrumResult | null;
  error: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface BaselineRecord {
  id: number;
  publicId: string;
  sensorId: number;
  version: number;
  label: string;
  windowFrom: string;
  windowTo: string;
  method: string | null;
  engineVersion: string | null;
  isRetired: boolean;
  createdAt: string;
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export type AlertSeverity = "info" | "low" | "medium" | "high" | "critical";
export type AlertStatus =
  | "open"
  | "acknowledged"
  | "investigating"
  | "resolved"
  | "closed";
/** What KIND of problem this is — kept distinct from how urgent it is. */
export type AlertCategory =
  | "structural"
  | "sensor_health"
  | "connectivity"
  | "data_quality";

export interface AlertEvidence {
  rule?: string;
  bound?: "min" | "max";
  limit?: number;
  observedValue?: number;
  observedAt?: string;
  consecutiveSamples?: number;
  requiredSamples?: number;
  exceedancePercent?: number;
  qualityFlags?: string[];
  /** How the severity was derived, so it can be audited rather than trusted. */
  severityRationale?: string;
}

export interface AlertRecord {
  id: number;
  publicId: string;
  sensorId: number | null;
  structureId: number | null;
  locationId: number | null;
  category: AlertCategory;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  evidence: AlertEvidence;
  /** Confidence in the DETECTION, not in a structural conclusion. */
  confidence: number | null;
  detectedAt: string;
  lastObservedAt: string;
  occurrenceCount: number;
  assignedToId: number | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface AlertTimelineEvent {
  id: number;
  fromStatus: AlertStatus | null;
  toStatus: AlertStatus;
  note: string | null;
  actorId: number | null;
  isAutomatic: boolean;
  createdAt: string;
}

export interface AlertDetail extends AlertRecord {
  rule: { id: number; name: string } | null;
  events: AlertTimelineEvent[];
}

export interface AlertSummary {
  total: number;
  bySeverity: Partial<Record<AlertSeverity, number>>;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: number;
  action: string;
  entity: string;
  entityId: number | null;
  /** Null only for platform-level rows with no attributable actor. */
  actor: { id: number; name: string; email: string } | null;
  ipAddress: string | null;
  userAgent: string | null;
  newValue: unknown;
  createdAt: string;
}

export interface AuditPage {
  items: AuditEntry[];
  nextCursor: number | null;
}

/** One file the FTP drop received, and what became of it. */
export interface IngestionFile {
  id: number;
  tenantId: number | null;
  gatewayId: number | null;
  projectId: number | null;
  gatewayKey: string | null;
  nodeKey: string | null;
  fileType: string;
  fileName: string;
  filePath: string;
  sha256: string;
  sizeBytes: number;
  status: "received" | "processed" | "failed" | "unknown_gateway" | "duplicate";
  rowsTotal: number;
  rowsStored: number;
  rowsDuplicate: number;
  error: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export interface IngestionFileList {
  status_code: number;
  message: string | null;
  items: IngestionFile[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  /** Files from gateways nobody has registered. Platform operators only. */
  unknownGatewayFiles: number;
}
