# SHM Flutter → Next.js + React + PostgreSQL — Migration Audit

> **Note:** Migration of all auditing requirements is complete (2026-09-05). This app is now React + Next.js + Node/Prisma only — the Flutter app and legacy backend have been removed from the repo. Legacy source is preserved in the backup archive (`/home/pijush/Downloads/SHM/legacy-backup-*.tar.gz`) and the MySQL dump in `database/structural_health_monitoring.sql`. This document is the historical audit of the work performed.

## SYSTEM OVERVIEW

**Application:** Structural Health Monitoring (SHM)
**Purpose:** IoT-based structural monitoring platform for civil engineering projects (bridges, buildings, etc.)
**Company:** Arctano Solutions

### Current Stack
- **Frontend:** Flutter Web (Dart, Provider state management, go_router)
- **Backend:** Node.js + Express (JavaScript, CommonJS)
- **Database:** MySQL 8.0 (phpMyAdmin)
- **Real-time:** MQTT (WebSocket protocol)
- **Auth:** JWT (bcrypt password hashing)
- **IoT:** Ackcio devices → MQTT broker → Backend → DB
- **Exports:** PDF (jsPDF + chart.js + canvas), CSV (ZIP), Excel

### Target Stack
- **Frontend:** Next.js 14+ (React, TypeScript)
- **Backend:** Node.js + TypeScript + Express (or Next.js API routes)
- **Database:** PostgreSQL 15+
- **Real-time:** MQTT + WebSockets (Socket.IO)
- **Auth:** NextAuth.js or custom JWT with HttpOnly cookies
- **ORM:** Prisma (best fit for this schema)

---

## 1. DATABASE SCHEMA MAP

### Current MySQL Tables → PostgreSQL Tables

| # | MySQL Table | PostgreSQL Table | Type Mapping | Row Count |
|---|-------------|------------------|--------------|-----------|
| 1 | `users` | `users` | `enum` → `TEXT CHECK`, `int` → `SERIAL` | 4 |
| 2 | `devices` | `devices` | `enum` → `TEXT CHECK`, `timestamp` → `TIMESTAMPTZ` | 2 |
| 3 | `device_channel` | `device_channels` | Same structure | 8 |
| 4 | `device_type` | `device_types` | Same structure | 3 |
| 5 | `sensor` | `sensors` | Same structure | 4 |
| 6 | `sensor_type` | `sensor_types` | Same structure | 9 |
| 7 | `sensor_data` | `sensor_data` | `float` → `DOUBLE PRECISION` | 953 |
| 8 | `project` | `projects` | JSON → `JSONB`, `enum` → `TEXT CHECK` | 2 |
| 9 | `nodeData` | `node_data` | Same structure | 36 |
| 10 | `notification` | `notifications` | Same structure | 12 |
| 11 | `email` | `project_emails` | Same structure | 17 |
| 12 | `firebasetoken` | `firebase_tokens` | Same structure | 15 |
| 13 | `temp_otp` | `temp_otps` | Same structure | 2 |

### Schema Relationships

```
users (superadmin)
  └─► users (admin) [parentId = superadmin.id]
        ├─► users (contractor) [parentId = admin.id]
        └─► users (authority) [parentId = admin.id]

admin
  ├─► devices [assignedAdmin = admin.id]
  ├─► sensors [assignedAdmin = admin.id]
  └─► projects [createdBy = admin.id]
        ├─► projects.contractorId → users (contractor)
        ├─► projects.authorityId → users (authority)
        ├─► project_emails [projectId = project.id]
        ├─► sensor_data [projectId = project.id]
        └─► notifications [sensor_data_id → sensor_data.id]

devices
  ├─► device_channels [deviceId = devices.id]
  └─► node_data [DeviceId = devices.deviceId]

sensors
  └─► sensor_type [sensorTypeID = sensor_type.id]

device_channels
  └─► device_channels.assignSensor → sensors.id
```

---

## 2. COMPLETE USER ROLES & PERMISSIONS MATRIX

### Roles
1. **SUPERADMIN** — System owner (Arctano). Manages admins. Sees all data.
2. **ADMIN** — Company admin. Manages contractors, authorities, projects, devices, sensors.
3. **CONTRACTOR** — Assigned by admin. Works on projects.
4. **AUTHORITY** — Assigned by admin. Views/audits projects.

### Permission Matrix

| Feature | SUPERADMIN | ADMIN | CONTRACTOR | AUTHORITY |
|---------|:----------:|:-----:|:----------:|:---------:|
| **Auth** |||||
| Login | ✅ | ✅ | ✅ | ✅ |
| Logout | ✅ | ✅ | ✅ | ✅ |
| Change Password | ✅ | ✅ | ✅ | ✅ |
| Forgot Password (OTP) | ✅ | ✅ | ✅ | ✅ |
| Email Verification | ✅ | ✅ | Auto | Auto |
| **User Management** |||||
| View Admin List | ✅ | ❌ | ❌ | ❌ |
| View Contractor List | ✅ | ✅ (own) | ❌ | ❌ |
| View Authority List | ✅ | ✅ (own) | ❌ | ❌ |
| Create Admin | ✅ | ❌ | ❌ | ❌ |
| Create Contractor | ❌ | ✅ | ❌ | ❌ |
| Create Authority | ❌ | ✅ | ❌ | ❌ |
| Verify/Approve User | ✅ | ❌ | ❌ | ❌ |
| Delete User | ✅ (cascade) | ❌ | ❌ | ❌ |
| Deactivate Admin | ✅ | ❌ | ❌ | ❌ |
| Update Profile | ✅ | ✅ | ✅ | ✅ |
| View Profile | ✅ | ✅ | ✅ | ✅ |
| Toggle CSV Access | ✅ | ❌ | ❌ | ❌ |
| **Device Management** |||||
| Create Device | ✅ | ✅ | ❌ | ❌ |
| View Devices | ✅ | ✅ (assigned) | ❌ | ❌ |
| Update Device | ✅ | ✅ (assigned) | ❌ | ❌ |
| Delete Device | ✅ | ❌ | ❌ | ❌ |
| Assign Device to Admin | ✅ | ❌ | ❌ | ❌ |
| Assign Sensor to Device | ✅ | ✅ (assigned) | ❌ | ❌ |
| View Device Channels | ✅ | ✅ | ❌ | ❌ |
| Update Channel Settings | ✅ | ✅ | ❌ | ❌ |
| Swap Channel Sensors | ✅ | ✅ | ❌ | ❌ |
| **Sensor Management** |||||
| Create Sensor | ✅ | ✅ | ❌ | ❌ |
| View Sensors | ✅ | ✅ (assigned) | ❌ | ❌ |
| Update Sensor | ✅ | ✅ | ❌ | ❌ |
| Delete Sensor | ✅ | ❌ | ❌ | ❌ |
| Assign Sensor to Admin | ✅ | ❌ | ❌ | ❌ |
| **Sensor Type Management** |||||
| View Sensor Types | ✅ | ✅ | ❌ | ❌ |
| Create Sensor Type | ✅ | ✅ | ❌ | ❌ |
| Update Sensor Type | ✅ | ✅ | ❌ | ❌ |
| Delete Sensor Type | ✅ | ✅ | ❌ | ❌ |
| **Device Type Management** |||||
| View Device Types | ✅ | ✅ | ❌ | ❌ |
| **Project Management** |||||
| Create Project | ❌ | ✅ | ❌ | ❌ |
| View Projects | ✅ (all) | ✅ (own) | ✅ (assigned) | ✅ (assigned) |
| Update Project | ❌ | ✅ (own) | ❌ | ❌ |
| Delete Project | ❌ | ✅ (own) | ❌ | ❌ |
| Start/Pause/End Project | ❌ | ✅ (own) | ❌ | ❌ |
| Generate Project Code | ❌ | ✅ | ❌ | ❌ |
| Register/Setup Project | ❌ | ✅ | ❌ | ❌ |
| Update Project Date Offset | ❌ | ✅ | ❌ | ❌ |
| Update Dashboard Images | ❌ | ✅ (own) | ❌ | ❌ |
| **Project Dashboard** |||||
| View Project Dashboard | ✅ | ✅ | ✅ (assigned) | ✅ (assigned) |
| View Sensor Data | ✅ | ✅ | ✅ (assigned) | ✅ (assigned) |
| **Reports** |||||
| View Sensor Report | ✅ | ✅ | ✅ (assigned) | ✅ (assigned) |
| Download Report PDF | ✅ | ✅ | ✅ (assigned) | ✅ (assigned) |
| Comparison Report | ✅ | ✅ | ✅ (assigned) | ✅ (assigned) |
| **Data Export/Import** |||||
| Export CSV (ZIP) | ✅ | ✅ (if csv access) | ❌ | ❌ |
| Export PDF | ✅ | ✅ | ✅ (assigned) | ✅ (assigned) |
| Import CSV | ✅ | ✅ | ❌ | ❌ |
| **Email Notifications** |||||
| Manage Project Email List | ❌ | ✅ (own) | ❌ | ❌ |
| Receive Threshold Alerts | — | — | ✅ (in email list) | ✅ (in email list) |
| **Admin Dashboard** |||||
| View Dashboard Stats | ✅ | ✅ | ❌ | ❌ |
| View Graphs (project/device/sensor/user) | ✅ | ✅ | ❌ | ❌ |
| Download List PDFs | ✅ | ❌ | ❌ | ❌ |
| **IoT Data** |||||
| Ingest Device Data | IoT device (no auth) | — | — | — |
| View Node Data | ✅ | ✅ | ❌ | ❌ |

---

## 3. COMPLETE API INVENTORY

### 3.1 Authentication (No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/commonLogin` | Login (email + password via query params) |
| POST | `/api/forgotPassword` | Send OTP to email |
| POST | `/api/validateOTP` | Validate OTP code |
| POST | `/api/changePassword` | Change password |
| POST | `/api/register/:userType` | Register user (admin/contractor/authority) |
| GET | `/api/verify/:email` | Resend verification email |
| GET | `/api/verifyUser/:id` | Email verification callback |
| POST | `/api/project_analysis` | Cron job (auto start/end projects) — **no auth!** → ✅ P1.10: locked to `superAdminOnly` (any-role trigger previously allowed cross-tenant project status transitions + emails) |
| POST | `/api/beamDeviceData` | IoT data ingestion — **no auth!** |

### 3.2 User Management (JWT Auth)

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/user/:userId` | ALL | Get user profile |
| PATCH | `/api/register/admin/:userId` | ALL | Update user profile |
| DELETE | `/api/user/:userId` | SUPERADMIN | Soft-delete user (cascade) |
| GET | `/api/delete/admin/:adminId` | SUPERADMIN | Soft-delete admin |
| GET | `/api/deactivate/admin/:adminId` | SUPERADMIN | Deactivate admin |
| GET | `/api/verify/user/:userId/:verifyType` | SUPERADMIN | Approve/reject user |
| GET | `/api/list/:userType/:adminId` | SUPERADMIN/ADMIN | List users with search/pagination |
| PUT | `/api/update/csvAccess/:userId/:csv` | SUPERADMIN | Toggle CSV access |

### 3.3 Device Management (JWT Auth)

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| POST | `/api/device` | SUPERADMIN/ADMIN | Create device + channels |
| GET | `/api/device` | SUPERADMIN/ADMIN | List devices with filters |
| PATCH | `/api/device/:deviceId` | SUPERADMIN/ADMIN | Update device |
| DELETE | `/api/device/:deviceId` | SUPERADMIN | Soft-delete device |
| POST | `/api/device/assignSensor` | SUPERADMIN/ADMIN | Assign sensor to channel |
| DELETE | `/api/device/assignSensor` | SUPERADMIN/ADMIN | Remove sensor from channel |
| POST | `/api/device/:assignType` | SUPERADMIN | Assign/unassign device to admin |
| GET | `/api/deviceType` | SUPERADMIN/ADMIN | List device types |

### 3.4 Sensor Management (JWT Auth)

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/sensor` | SUPERADMIN/ADMIN | List sensors |
| POST | `/api/sensor` | SUPERADMIN/ADMIN | Create sensor |
| PATCH | `/api/sensor/:sensorId` | SUPERADMIN/ADMIN | Update sensor |
| DELETE | `/api/sensor/:sensorId` | SUPERADMIN | **Hard delete** sensor |
| POST | `/api/sensor/:assignType` | SUPERADMIN | Assign/unassign sensor to admin |
| GET | `/api/sensor/:assignType/:adminId` | SUPERADMIN/ADMIN | Sensors by assign status |
| GET | `/api/sensorType` | SUPERADMIN/ADMIN | List sensor types |
| POST | `/api/sensorType` | SUPERADMIN/ADMIN | Create sensor type |
| PATCH | `/api/sensorType/:sensorTypeId` | SUPERADMIN/ADMIN | Update sensor type |
| DELETE | `/api/sensorType/:sensorTypeId` | SUPERADMIN/ADMIN | Delete sensor type |

### 3.5 Project Management (JWT Auth)

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| POST | `/api/project` | ADMIN | Create project |
| PUT | `/api/project` | ADMIN | Update project |
| GET | `/api/project/:projectId` | ALL | Get project detail |
| PATCH | `/api/project/:projectId` | ADMIN | Update dashboard images |
| DELETE | `/api/project/:projectId` | ADMIN | Soft-delete project |
| GET | `/api/projects/:adminId` | ALL | List projects (role-filtered) |
| GET | `/api/projectStart/:projectId` | ADMIN | Start/pause/end project |
| POST | `/api/projectCode/:projectId` | ADMIN | Generate project code |
| PUT | `/api/project/:projectId/:offset` | ADMIN | Update date offset |
| PUT | `/api/projectSetup/:projectId` | ADMIN | Register/activate project |
| GET | `/api/projectStatus/:projectId` | ALL | Get project status |

### 3.6 Dashboard & Reports (JWT Auth)

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| POST | `/api/dashboard` | SUPERADMIN/ADMIN | Dashboard stats |
| POST | `/api/dashboard/project_graph` | SUPERADMIN/ADMIN | Project graph |
| POST | `/api/dashboard/device_graph` | SUPERADMIN/ADMIN | Device graph |
| POST | `/api/dashboard/sensor_graph` | SUPERADMIN/ADMIN | Sensor graph |
| POST | `/api/dashboard/user_graph` | SUPERADMIN/ADMIN | User graph |
| GET | `/api/dashboard/:uniqueId` | ALL | Project dashboard data |
| POST | `/api/reportSensorList/:uniqueId` | ALL | Report sensor list |
| POST | `/api/reportSensorListGraph/:uniqueId` | ALL | Report PDF with graphs |
| POST | `/api/reportSensorListGraphComparison/:uniqueId` | ALL | Comparison report PDF |
| POST | `/api/reportSensorData/:sensorId/:uniqueId` | ALL | Single sensor report |

### 3.7 Channel Management (JWT Auth)

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/api/channelList/:deviceId` | SUPERADMIN/ADMIN | List channels |
| PATCH | `/api/channelList` | SUPERADMIN/ADMIN | Update channel settings |
| PUT | `/api/channelSwap` | SUPERADMIN/ADMIN | Swap channel sensors |
| DELETE | `/api/removeSensorFromChannel/:id` | SUPERADMIN/ADMIN | Remove sensor from channel |

### 3.8 Email Notifications (JWT Auth)

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| PATCH | `/api/emailSetting` | ADMIN | Update email list |
| GET | `/api/getEmailSetting/:uniqueId` | ALL | Get email list |

### 3.9 Export/Download (JWT Auth)

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| POST | `/api/download/list/:userType/:adminId` | SUPERADMIN | Download user list PDF |
| POST | `/api/download/device/:adminId` | SUPERADMIN | Download device list PDF |
| POST | `/api/download/sensor/:adminId` | SUPERADMIN | Download sensor list PDF |
| POST | `/api/download/projects/:adminId` | SUPERADMIN | Download project list PDF |
| POST | `/api/exportCsv/:uniqueId` | ADMIN (csv access) | Export CSV ZIP or PDF |
| POST | `/api/importCsv/:uniqueId` | ADMIN | Import CSV files |

### 3.10 IoT Data (Auth: key for ingest, session for reads)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/beamDeviceData` | Ingest Ackcio device data (4 types) — `requireApiKey` |
| POST | `/api/sensorDataFromDevice` | Sensor ingest — `requireApiKey` (was user-JWT) ✅ P1.8 |
| GET | `/api/beamNodeData` | Get node telemetry data — session-scoped to owned devices ✅ P1.7 |
| GET | `/api/beamGetSensorData` | Get Ackcio sensor data — session-scoped to owned devices ✅ P1.7 |

---

## 4. MIGRATION INVENTORY

### Feature: Authentication
| Aspect | Detail |
|--------|--------|
| **Flutter Files** | `auth/authentication.dart`, `auth/login_page.dart`, `auth/change_password.dart`, `auth/otp_fields.dart`, `auth/auth.dart` |
| **Backend Files** | `authController.js`, `jwt_token.js` |
| **Model** | LoginResponse, OtpResponse, ChangeOtpRequest, SignUpRequest |
| **Business Rules** | JWT 30-day expiry, bcrypt salt=10, 6-char OTP, email verification for admin, auto-verify contractor/authority |
| **Roles** | All users can login. SuperAdmin approves admins. Admin creates contractor/authority (auto-approved). |
| **Migration Status** | PENDING |

### Feature: User Management
| Aspect | Detail |
|--------|--------|
| **Flutter Files** | `screen/super_admin/super_admin.dart`, `screen/super_admin/admin_table.dart`, `screen/super_admin/bottom_user_list.dart`, `screen/add_user.dart`, `screen/Admin/contractor_table.dart`, `screen/Admin/authority_table.dart`, `screen/profile.dart` |
| **Backend Files** | `authController.js`, `adminController.js`, `superAdminController.js` |
| **Providers** | `AdminProvider`, `ContractorProvider`, `AuthorityProvider`, `ProfileProvider` |
| **Models** | UserListResponse, ProfileUpdateRequest/Response, SignUpRequest |
| **Business Rules** | Soft-delete with cascade (admin's sub-users), verify/reject with cascade, CSV access toggle, pagination with search |
| **Roles** | SUPERADMIN manages all. ADMIN manages own contractors/authorities. |
| **Migration Status** | PENDING |

### Feature: Device Management
| Aspect | Detail |
|--------|--------|
| **Flutter Files** | `screen/device_table.dart`, `screen/add_device_page.dart`, `screen/Admin/channel_view.dart`, `screen/select_device.dart`, `screen/select_sensor.dart` |
| **Backend Files** | `deviceController.js`, `deviceTypeController.js`, `superAdminController.js` |
| **Providers** | `DeviceProvider` |
| **Models** | DeviceAddRequest, DeviceUpdateRequest, DeviceListResponse, DeviceTypeResponse, SensorChannelResponse |
| **Business Rules** | Auto-create channels on device add, soft-delete, assign/unassign to admin, sensor assignment removes from other devices |
| **Roles** | SUPERADMIN/ADMIN create. SUPERADMIN assigns. ADMIN views assigned. |
| **Migration Status** | PENDING |

### Feature: Sensor Management
| Aspect | Detail |
|--------|--------|
| **Flutter Files** | `screen/sensor_table.dart`, `screen/add_sensor.dart` |
| **Backend Files** | `sensorController.js`, `sensorTypeController.js` |
| **Providers** | `SensorProvider`, `SensorTypeProvider` |
| **Models** | AddSensorRequest, SensorListResponse, SensorTypeResponse |
| **Business Rules** | Hard delete for sensors (!), duplicate name check on create, sensor types have icons (base64 upload) |
| **Roles** | SUPERADMIN/ADMIN manage sensors. SUPERADMIN assigns to admin. |
| **Migration Status** | PENDING |

### Feature: Project Management
| Aspect | Detail |
|--------|--------|
| **Flutter Files** | `screen/Admin/project_table.dart`, `screen/add_project.dart`, `screen/project_drawer.dart`, `screen/add_email_to_project.dart`, `screen/download_project.dart`, `screen/top_button_area.dart` |
| **Backend Files** | `projectController.js` (2690 lines — largest file) |
| **Providers** | `ProjectProvider` |
| **Models** | CreateProjectRequest, UpdateProjectResponse, ProjectListResponse, ProjectDetailResponse, ProjectEmailRequest/Response, GenerateProjectIdReq |
| **Business Rules** | Unique 10-char ID, project code format `CGSL/AdminCode/ContractorCode/AuthorityCode/Date/FY/Code`, role-based filtering, device snapshot on project end, email notifications on start/end, date offset for timezone |
| **Roles** | ADMIN creates/updates/deletes. ALL view (filtered by role). |
| **Migration Status** | PENDING |

### Feature: Project Dashboard
| Aspect | Detail |
|--------|--------|
| **Flutter Files** | `screen/project_dashboard.dart`, `screen/dashboard/dashboard.dart`, `screen/dashboard/dashboard_helper.dart`, `screen/dashboard/dashboard_area.dart`, `screen/dashboard/custom_pie_chart.dart/pie_chart.dart`, `widget/graph.dart`, `widget/graph_view.dart` |
| **Backend Files** | `projectController.js` (dashboardData) |
| **Providers** | `DashboardProvider` |
| **Models** | ProjectDetailResponse (reused for dashboard) |
| **Business Rules** | Real-time MQTT data, date range filtering, sensor data aggregation, pie charts for sensor distribution, line graphs for time series |
| **Roles** | ALL authenticated users (filtered by project assignment) |
| **Migration Status** | PENDING |

### Feature: Reporting
| Aspect | Detail |
|--------|--------|
| **Flutter Files** | `screen/reporting_screen/reporting_screen.dart`, `screen/reporting_screen/report_screen.dart`, `screen/reporting_screen/charts.dart`, `screen/reporting_screen/comparison.dart` |
| **Backend Files** | `projectController.js` (report functions), `pdfController.js` |
| **Models** | ReportDataResponse, ReportSensorDataResponse |
| **Business Rules** | Time frequency aggregation (5min/hourly/daily/weekly/monthly), line/histogram/pie charts, server-side chart generation, multi-sensor comparison PDF, date range filtering, offset support |
| **Roles** | ALL authenticated users (filtered by project assignment) |
| **Migration Status** | PENDING |

### Feature: CSV Export/Import
| Aspect | Detail |
|--------|--------|
| **Flutter Files** | `widget/custom_csv.dart`, `widget/download_pdf.dart` |
| **Backend Files** | `csvController.js` |
| **Business Rules** | ZIP export with per-channel CSVs, strict CSV format validation on import, sets project to "end" status on import, sample data generation, requires csvAccess flag |
| **Roles** | ADMIN with csvAccess flag |
| **Migration Status** | PENDING |

### Feature: Admin Dashboard
| Aspect | Detail |
|--------|--------|
| **Flutter Files** | `screen/dashboard/dashboard.dart`, `screen/dashboard/dashboard_helper.dart`, `screen/dashboard/dashboard_area.dart` |
| **Backend Files** | `dashboardController.js` |
| **Providers** | `DashboardProvider` |
| **Business Rules** | Aggregated counts (projects by status, users, devices, sensors), graph data by week/month/year, role-based filtering |
| **Roles** | SUPERADMIN/ADMIN |
| **Migration Status** | PENDING |

### Feature: MQTT Real-time
| Aspect | Detail |
|--------|--------|
| **Flutter Files** | `mqtt/mqtt_client_manager.dart`, `provider.dart/mqtt_provider.dart`, `static_class.dart` |
| **Backend Files** | `cli/mqtt.js`, `ackcioController.js` |
| **Business Rules** | WebSocket connection to MQTT broker, subscribe to `devices/#`, publish to `sensors/<id>`, auto-reconnect, keepAlive 30s |
| **Migration Status** | PENDING |

### Feature: IoT Data Ingestion
| Aspect | Detail |
|--------|--------|
| **Flutter Files** | N/A (device → backend directly) |
| **Backend Files** | `ackcioController.js` (439 lines) |
| **Business Rules** | Handles 4 data types: NodeData (telemetry), HeartbeatData, SensorData (with calibration), NetworkData. Threshold alerts with email notifications. Dedup check. |
| **Migration Status** | PENDING |

### Feature: Email Notifications
| Aspect | Detail |
|--------|--------|
| **Flutter Files** | N/A |
| **Backend Files** | `utilities/mailer.js`, used in auth/project/ackcio controllers |
| **Business Rules** | Gmail SMTP, email verification, OTP password reset, project start/end notifications, threshold alerts |
| **Migration Status** | PENDING |

---

## 5. KEY SECURITY ISSUES TO FIX DURING MIGRATION

1. **No role-based authorization in backend** — Any authenticated user can access any endpoint
2. **Login via query parameters** — Credentials exposed in URLs/logs
3. **SQL injection** — String interpolation in multiple queries
4. **Weak JWT secret** — `structural_health_monitoring` is guessable
5. **30-day JWT with no refresh** — Long-lived tokens with no rotation
6. **Unauthenticated IoT endpoint** — Anyone can inject data
7. **Unauthenticated cron endpoint** — Anyone can trigger project analysis
8. **CORS wide open** — Allows all origins
9. **No rate limiting** — Brute force vulnerable
10. **Secrets in git** — .env committed with real credentials
11. **Hard delete of sensors** — Irreversible data loss
12. **No input sanitization** — XSS possible via stored data

---

## 6. POSTGRESQL SCHEMA MIGRATION NOTES

### Type Mappings

| MySQL Type | PostgreSQL Type |
|-----------|-----------------|
| `enum('a','b')` | `TEXT CHECK (column IN ('a','b'))` |
| `int NOT NULL AUTO_INCREMENT` | `SERIAL PRIMARY KEY` |
| `int` | `INTEGER` |
| `varchar(255)` | `VARCHAR(255)` |
| `text` | `TEXT` |
| `float` | `DOUBLE PRECISION` |
| `datetime` | `TIMESTAMP` |
| `timestamp` | `TIMESTAMPTZ` |
| `tinyint` | `SMALLINT` |
| `longtext` | `TEXT` |
| `longtext JSON` | `JSONB` |
| `char(255)` | `CHAR(255)` or `VARCHAR(255)` |

### ID Strategy
- **PRESERVE ALL EXISTING IDs** — No ID regeneration
- Use `SERIAL` with initial values matching current max IDs
- Create ID mapping table only if structural changes require it

### Enum Conversions
- MySQL `enum('superadmin','admin','contractor','authority')` → PostgreSQL `TEXT CHECK`
- MySQL `enum('1','0')` for status → PostgreSQL `BOOLEAN` or `TEXT CHECK`
- MySQL `enum('true','false')` for IsDelete → PostgreSQL `BOOLEAN`

---

## 7. DEPENDENCY MAPPING

### Flutter → Next.js Feature Mapping

| Flutter Package | Next.js Equivalent |
|----------------|-------------------|
| `provider` (state) | React Context / Zustand / Jotai |
| `go_router` | Next.js App Router (file-based) |
| `dio` / `retrofit` | `fetch` / `axios` |
| `mqtt_client` | `mqtt.js` (via WebSocket) |
| `fl_chart` | `recharts` / `chart.js` |
| `shared_preferences` | `localStorage` / cookies |
| `image_picker` | `react-dropzone` / file input |
| `csv` | `papaparse` |
| `shimmer` | CSS skeleton loading |
| `url_strategy` | Next.js built-in |
| `otp_pin_field` | Custom OTP input component |

### Backend Dependencies

| Current | Target |
|---------|--------|
| `express` | Express.js (keep) |
| `mysql2` | `pg` (node-postgres) + Prisma |
| `bcrypt` | `bcryptjs` |
| `jsonwebtoken` | `jose` (Edge-compatible) |
| `joi` | `zod` |
| `nodemailer` | `nodemailer` (keep) |
| `mqtt` | `mqtt` (keep) |
| `multer` | `busboy` / `formidable` |
| `jspdf` + `canvas` | `@react-pdf/renderer` or `pdf-lib` |
| `csv-parser` | `csv-parse` / `papaparse` |
| `jszip` | `jszip` (keep) |
| `chart.js` + `canvas` | Server-side `chart.js` with `chartjs-node-canvas` |

---

## 8. MIGRATION RISKS

| Risk | Impact | Mitigation |
|------|--------|------------|
| MySQL JSON stored as strings | LOW | Convert to PostgreSQL JSONB |
| `sensor_data` table has 953+ rows (will grow) | MEDIUM | Partition by date in PostgreSQL |
| No foreign keys in MySQL schema | MEDIUM | Add proper FKs in PostgreSQL |
| String booleans (`"true"/"false"`) | LOW | Convert to proper BOOLEAN |
| Hard delete of sensors | HIGH | Change to soft delete in new system |
| `assignSensor` JSON in text columns | MEDIUM | Normalize to junction table |
| `projectDevice` JSON blob | MEDIUM | Extract to proper relation |
| Base64 images in database | LOW | Move to object storage (S3/local) |
| No existing tests | HIGH | Write tests before migration |
| Timezone handling (IST conversion) | MEDIUM | Use TIMESTAMPTZ consistently |
