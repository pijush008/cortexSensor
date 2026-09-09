# API_DOCUMENTATION.md — REST API Specification

## Base URL
- Development: `http://localhost:3001/api`
- Production: `https://api.shm.example.com/api`

## Authentication
All protected endpoints require:
```
Authorization: Bearer <jwt_token>
```

## Response Format

### Success
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

### Paginated
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "currentPage": 1,
      "itemsPerPage": 20,
      "totalItems": 100,
      "totalPages": 5
    }
  }
}
```

---

## 1. Authentication

### POST /api/auth/login
**Auth:** None
```json
Request: { "email": "string", "password": "string" }
Response: {
  "token": "jwt_string",
  "user": {
    "id": 1,
    "firstName": "string",
    "lastName": "string",
    "emailId": "string",
    "userType": "superadmin|admin|contractor|authority",
    "profileImage": "string|null"
  }
}
```

### POST /api/auth/forgot-password
**Auth:** None
```json
Request: { "email": "string" }
Response: { "message": "OTP sent to email", "userId": 1 }
```

### POST /api/auth/validate-otp
**Auth:** None
```json
Request: { "userId": 1, "otp": "string" }
Response: { "message": "OTP validated" }
```

### POST /api/auth/change-password
**Auth:** None (after OTP validation)
```json
Request: { "userId": 1, "newPassword": "string", "oldPassword"?: "string" }
Response: { "message": "Password changed" }
```

### POST /api/auth/register/:userType
**Auth:** None (admin requires superadmin approval)
```json
Request: {
  "firstName": "string",
  "lastName": "string",
  "emailId": "string",
  "phoneNo": "string",
  "password": "string",
  "profileImage": "string|null",
  "admin_id": 0
}
Response: { "message": "Registration successful" }
```

---

## 2. Users

### GET /api/users/:userId
**Auth:** JWT (any role)
```json
Response: {
  "id": 1,
  "userType": "admin",
  "firstName": "string",
  "lastName": "string",
  "emailId": "string",
  "phoneNo": "string",
  "profileImage": "string|null",
  "status": true
}
```

### PATCH /api/users/:userId
**Auth:** JWT (own profile or superadmin)
```json
Request: { "firstName"?: "string", "lastName"?: "string", ... }
Response: { "message": "Profile updated" }
```

### DELETE /api/users/:userId
**Auth:** SUPERADMIN only
Cascade: Deletes all sub-users (contractors/authorities under admin)
```json
Response: { "message": "User deleted" }
```

### GET /api/users/list/:userType/:adminId
**Auth:** SUPERADMIN or ADMIN
Query: `?page=1&limit=20&searchTerm=&verifyType=`
```json
Response: {
  "users": [...],
  "pagination": { ... }
}
```

### GET /api/users/verify/:userId/:status
**Auth:** SUPERADMIN only
Approve or reject user registration.

### PUT /api/users/csv-access/:userId/:csv
**Auth:** SUPERADMIN only
Toggle CSV export permission.

### GET /api/users/delete/admin/:adminId
**Auth:** SUPERADMIN only
Soft-delete admin, reset their projects.

### GET /api/users/deactivate/admin/:adminId
**Auth:** SUPERADMIN only
Deactivate admin account.

---

## 3. Devices

### POST /api/devices
**Auth:** SUPERADMIN or ADMIN
```json
Request: {
  "deviceName": "string",
  "deviceType": 1,
  "channelCount": 4,
  "deviceId": "string",
  "gatewayDeviceId": "string",
  "deviceStartDate": "ISO date"
}
Response: { "message": "Device created" }
```

### GET /api/devices
**Auth:** SUPERADMIN or ADMIN
Query: `?page=1&limit=20&searchTerm=&deviceStatus=active|inactive&isNotOngoing=0|1`
SUPERADMIN sees all. ADMIN sees assigned only.

### PATCH /api/devices/:deviceId
**Auth:** SUPERADMIN or ADMIN (assigned)

### DELETE /api/devices/:deviceId
**Auth:** SUPERADMIN only
Soft-delete.

### POST /api/devices/assign-sensor
**Auth:** SUPERADMIN or ADMIN (assigned)
```json
Request: {
  "deviceId": 33,
  "channels": [
    { "channelId": 145, "sensorId": 28, "triggerValue": "45", "thresholdValue": "80" }
  ]
}
```

### DELETE /api/devices/assign-sensor
**Auth:** SUPERADMIN or ADMIN

### POST /api/devices/assign/:assignType
**Auth:** SUPERADMIN only
assignType: "assign" | "unassign"

### GET /api/device-types
**Auth:** SUPERADMIN or ADMIN

---

## 4. Sensors

### GET /api/sensors
**Auth:** SUPERADMIN or ADMIN
Query: `?page=1&limit=20&searchTerm=&sensorTypeList=`

### POST /api/sensors
**Auth:** SUPERADMIN or ADMIN
```json
Request: {
  "sensorName": "string",
  "sensorTypeID": 1,
  "calibrationValue": "string",
  "unit": "string"
}
```

### PATCH /api/sensors/:sensorId
**Auth:** SUPERADMIN or ADMIN

### DELETE /api/sensors/:sensorId
**Auth:** SUPERADMIN only
**WARNING:** Currently hard-deletes. Consider soft-delete.

### GET /api/sensors/:assignType/:adminId
**Auth:** SUPERADMIN or ADMIN
assignType: "assign" | "unassign"

### POST /api/sensors/assign/:assignType
**Auth:** SUPERADMIN only

### GET /api/sensor-types
**Auth:** SUPERADMIN or ADMIN

### POST /api/sensor-types
**Auth:** SUPERADMIN or ADMIN

### PATCH /api/sensor-types/:sensorTypeId
**Auth:** SUPERADMIN or ADMIN

### DELETE /api/sensor-types/:sensorTypeId
**Auth:** SUPERADMIN or ADMIN

---

## 5. Projects

### POST /api/projects
**Auth:** ADMIN only
```json
Request: {
  "projectName": "string",
  "projectLocation": "string",
  "startDate": "ISO date",
  "contractorId": 15,
  "authorityId": 16,
  "deviceId": "33",
  "sensorId": "[28,29]"
}
```

### GET /api/projects/list/:adminId
**Auth:** ALL (filtered by role)
Query: `?page=1&limit=20&searchTerm=&status=&filterType=&startDate=&endDate=`
- SUPERADMIN: all projects
- ADMIN: own projects
- CONTRACTOR: assigned projects
- AUTHORITY: assigned projects

### GET /api/projects/:projectId
**Auth:** ALL (filtered by role)

### PUT /api/projects
**Auth:** ADMIN (own project)

### DELETE /api/projects/:projectId
**Auth:** ADMIN (own project)

### GET /api/projects/start/:projectId?statusType=start|pause|end
**Auth:** ADMIN (own project)

### POST /api/projects/code/:projectId
**Auth:** ADMIN
Generate project code: `CGSL/AdminCode/ContractorCode/AuthorityCode/Date/FY/Code`

### PUT /api/projects/offset/:projectId/:offset
**Auth:** ADMIN

### PUT /api/projects/setup/:projectId
**Auth:** ADMIN
Register and activate project + device.

### PATCH /api/projects/:projectId/dashboard-images
**Auth:** ADMIN (own project)

---

## 6. Channels

### GET /api/channels/:deviceId
**Auth:** SUPERADMIN or ADMIN
Query: `?page=1&limit=20`

### PATCH /api/channels
**Auth:** SUPERADMIN or ADMIN
Bulk update channel sensor names, trigger/threshold values.

### PUT /api/channels/swap
**Auth:** SUPERADMIN or ADMIN
Swap sensor assignments between channels.

### DELETE /api/channels/:channelId/sensor
**Auth:** SUPERADMIN or ADMIN

---

## 7. Dashboard

### POST /api/dashboard/stats
**Auth:** SUPERADMIN or ADMIN
```json
Request: { "userId": "1", "userType": "admin" }
Response: {
  "projects": { "upcoming": 5, "running": 3, "paused": 1, "end": 10 },
  "devices": { "total": 10, "active": 5, "inactive": 5 },
  "users": { "admins": 3, "contractors": 10, "authorities": 5 }
}
```

### POST /api/dashboard/project-graph
**Auth:** SUPERADMIN or ADMIN
Query: `?userId=&userType=&type=week|month|year`

### POST /api/dashboard/device-graph
### POST /api/dashboard/sensor-graph
### POST /api/dashboard/user-graph

### GET /api/projects/dashboard/:uniqueId
**Auth:** ALL (filtered)
Query: `?startDate=&endDate=`

---

## 8. Reports

### POST /api/reports/sensor-list/:uniqueId
**Auth:** ALL (filtered)
Query: `?startDate=&endDate=&frequency=5min|hourly|daily|weekly|monthly`

### POST /api/reports/sensor-data/:sensorId/:uniqueId
**Auth:** ALL (filtered)
Query: `?offset=&startDate=&endDate=&frequency=`

### POST /api/reports/pdf/:uniqueId
**Auth:** ALL (filtered)
Generates PDF with line graphs, histograms, pie charts.

### POST /api/reports/comparison/:uniqueId
**Auth:** ALL (filtered)
Multi-sensor comparison PDF.

---

## 9. Exports

### POST /api/exports/csv/:uniqueId
**Auth:** ADMIN with csv_access
Query: `?from=&to=&format=CSV|PDF&isSample=0|1`
Returns ZIP with per-channel CSVs, or PDF.

### POST /api/exports/import/:uniqueId
**Auth:** ADMIN
Multipart: `csvFiles[]`
Validates format, inserts sensor data.

### POST /api/exports/download/list/:userType/:adminId
### POST /api/exports/download/devices/:adminId
### POST /api/exports/download/sensors/:adminId
### POST /api/exports/download/projects/:adminId
**Auth:** SUPERADMIN

---

## 10. Email Settings

### GET /api/emails/:uniqueId
**Auth:** ALL (filtered)

### PATCH /api/emails
**Auth:** ADMIN (own project)
```json
Request: {
  "uniqueId": "string",
  "emails": [
    { "email": "string", "isEnable": true },
    { "id": 5, "action": "delete" }
  ]
}
```

---

## 11. IoT (External Device Integration)

### POST /api/iot/device-data
**Auth:** None (called by IoT devices)
```json
Request: {
  "type": "NodeData|HeartbeatData|SensorData|NetworkData",
  "DeviceId": "string",
  "GatewayDeviceId": "string",
  ...
}
```

### GET /api/iot/node-data
**Auth:** JWT

### GET /api/iot/sensor-data
**Auth:** JWT

---

## 12. Cron (Internal)

### POST /api/cron/project-analysis
**Auth:** Internal only (should be triggered by scheduler, not exposed publicly)
Auto-starts/ends projects based on dates.

---

## 13. Live IoT ingestion over MQTT (field devices)

### Subscribe (backend, on startup)
**Auth:** none (broker credentials from env)
- Broker: `MQTT_BROKER_URL` (e.g. `mqtt://broker:1883`)
- Topics: `MQTT_INGEST_TOPICS` (default `shm/device/#`)
- Payload: same `BeamDeviceDataInput` as `POST /api/beamDeviceData`
- On drop-invalid → warn & skip; on network loss → exponential backoff reconnect

ESP32 nodes / Raspberry Pi gateways publish here and the backend stores via the
same device→project pipeline as the REST path.

### POST /api/beamDeviceData
**Auth:** `x-api-key` header (constant-time compare with `IOT_API_KEY`)
```json
{
  "Type": "NodeData|HeartbeatData|SensorData|NetworkData",
  "Telemetries": [{
    "Battery": 95, "Temperature": 23.4, "Humidity": 41, "Pressure": 1013,
    "GatewayDeviceId": "gw-esp32-01", "DeviceId": "fb8d",
    "DeviceName": "Bridge Node A", "ProjectName": "Kali Bridge",
    "DeviceType": "ESP32 SHM Node", "Timestamp": 1700000000,
    "Sensor": { "SensorType": "Strain", "Channels": [{ "RawReading": 123.4 }] }
  }]
}
```

---

## 14. Office data download (historical field telemetry)

### POST /api/download/sensorData
**Auth:** JWT · Permission: `PROJECT_REPORTS`
Returns a CSV attachment of calibrated sensor readings.
Body (all optional): `projectId`, `deviceId`, `sensorId`, `startDate`, `endDate`

### POST /api/download/nodeData
**Auth:** JWT · Permission: `PROJECT_REPORTS`
Returns a CSV attachment of node/gateway health (battery, temp, humidity, pressure).
Body (all optional): `deviceId`, `sensorId`, `startDate`, `endDate`

Both cap rows at `TELEMETRY_EXPORT_ROW_LIMIT` (default 100 000).
