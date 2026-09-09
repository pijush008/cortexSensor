# DATA_VALIDATION.md — Post-Migration Verification

## Validation Queries

### Table Row Counts

Run these after migration and compare with source:

```sql
-- Source (MySQL):
SELECT 'users' as tbl, COUNT(*) as cnt FROM users
UNION ALL SELECT 'devices', COUNT(*) FROM devices
UNION ALL SELECT 'device_channel', COUNT(*) FROM device_channel
UNION ALL SELECT 'device_type', COUNT(*) FROM device_type
UNION ALL SELECT 'sensor', COUNT(*) FROM sensor
UNION ALL SELECT 'sensor_type', COUNT(*) FROM sensor_type
UNION ALL SELECT 'sensor_data', COUNT(*) FROM sensor_data
UNION ALL SELECT 'project', COUNT(*) FROM project
UNION ALL SELECT 'nodeData', COUNT(*) FROM nodeData
UNION ALL SELECT 'notification', COUNT(*) FROM notification
UNION ALL SELECT 'email', COUNT(*) FROM email
UNION ALL SELECT 'firebasetoken', COUNT(*) FROM firebasetoken
UNION ALL SELECT 'temp_otp', COUNT(*) FROM temp_otp;

-- Target (PostgreSQL):
SELECT 'users' as tbl, COUNT(*) FROM users
UNION ALL SELECT 'devices', COUNT(*) FROM devices
UNION ALL SELECT 'device_channels', COUNT(*) FROM device_channels
UNION ALL SELECT 'device_types', COUNT(*) FROM device_types
UNION ALL SELECT 'sensors', COUNT(*) FROM sensors
UNION ALL SELECT 'sensor_types', COUNT(*) FROM sensor_types
UNION ALL SELECT 'sensor_data', COUNT(*) FROM sensor_data
UNION ALL SELECT 'projects', COUNT(*) FROM projects
UNION ALL SELECT 'node_data', COUNT(*) FROM node_data
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'project_emails', COUNT(*) FROM project_emails
UNION ALL SELECT 'firebase_tokens', COUNT(*) FROM firebase_tokens
UNION ALL SELECT 'temp_otps', COUNT(*) FROM temp_otps;

-- Expected counts:
-- users: 4
-- devices: 2
-- device_channel: 8
-- device_type: 3
-- sensor: 4
-- sensor_type: 9
-- sensor_data: 953
-- project: 2
-- nodeData: 36
-- notification: 12
-- email: 17
-- firebasetoken: 15
-- temp_otp: 2
```

### ID Range Verification

```sql
-- Verify no ID gaps or overlaps
SELECT 'users' as tbl, MIN(id) as min_id, MAX(id) as max_id FROM users
UNION ALL SELECT 'devices', MIN(id), MAX(id) FROM devices
UNION ALL SELECT 'device_channels', MIN(id), MAX(id) FROM device_channels
UNION ALL SELECT 'sensors', MIN(id), MAX(id) FROM sensors
UNION ALL SELECT 'sensor_data', MIN(id), MAX(id) FROM sensor_data
UNION ALL SELECT 'projects', MIN(id), MAX(id) FROM projects;
```

### Foreign Key Integrity

```sql
-- Verify all assigned_admin references exist
SELECT d.id, d.assigned_admin 
FROM devices d 
LEFT JOIN users u ON d.assigned_admin = u.id 
WHERE d.assigned_admin IS NOT NULL AND u.id IS NULL;

-- Verify all project contractor_id references exist
SELECT p.id, p.contractor_id 
FROM projects p 
LEFT JOIN users u ON p.contractor_id = u.id 
WHERE p.contractor_id IS NOT NULL AND u.id IS NULL;

-- Verify all project authority_id references exist
SELECT p.id, p.authority_id 
FROM projects p 
LEFT JOIN users u ON p.authority_id = u.id 
WHERE p.authority_id IS NOT NULL AND u.id IS NULL;

-- Verify all project created_by references exist
SELECT p.id, p.created_by 
FROM projects p 
LEFT JOIN users u ON p.created_by = u.id 
WHERE p.created_by IS NOT NULL AND u.id IS NULL;

-- Verify sensor_type_id references
SELECT s.id, s.sensor_type_id 
FROM sensors s 
LEFT JOIN sensor_types st ON s.sensor_type_id = st.id 
WHERE s.sensor_type_id IS NOT NULL AND st.id IS NULL;

-- All queries should return 0 rows.
```

### Enum/Status Value Verification

```sql
-- Verify user types are preserved
SELECT user_type, COUNT(*) FROM users GROUP BY user_type;
-- Expected: superadmin=1, admin=1, contractor=1, authority=1

-- Verify project statuses
SELECT status, COUNT(*) FROM projects GROUP BY status;
-- Expected: 'end'=1, 'start'=1

-- Verify device statuses
SELECT device_status, COUNT(*) FROM devices GROUP BY device_status;
-- Expected: 'inactive'=2
```

### Critical Data Value Verification

```sql
-- Verify user emails are preserved
SELECT id, email_id, user_type FROM users ORDER BY id;
-- Expected:
-- 1, info@arctano.com, superadmin
-- 12, pulkit@arctano.com, admin
-- 15, sales@arctano.com, contractor
-- 16, rohan@arctano.com, authority

-- Verify project names
SELECT id, project_name, status, created_by FROM projects;
-- Expected:
-- 97, Project K, end, 12
-- 99, Project C, start, 12

-- Verify sensor names
SELECT id, sensor_name, sensor_type_id, unit FROM sensors;
-- Expected:
-- 28, Load Cell, 5, kN
-- 29, LVDT, 2, mm
-- 32, TESt, 1, C
-- 33, A, 1, F
```

### Timestamp Verification

```sql
-- Verify timestamps are not zeroed or shifted
SELECT id, created_at FROM users ORDER BY id;
-- All should have valid timestamps, not '0000-00-00'

SELECT id, created_at FROM projects ORDER BY id;
-- Should match source
```

### JSON Data Verification

```sql
-- Verify assign_sensor JSONB in devices
SELECT id, device_name, assign_sensor FROM devices WHERE assign_sensor IS NOT NULL;

-- Verify project_device JSONB
SELECT id, project_name, project_device IS NOT NULL as has_device_json FROM projects;

-- Verify sensor_id in projects (stored as text JSON array)
SELECT id, project_name, sensor_id FROM projects WHERE sensor_id IS NOT NULL;
```

## Validation Script

```typescript
// scripts/validate-migration.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EXPECTED_COUNTS = {
  users: 4,
  devices: 2,
  device_channels: 8,
  device_types: 3,
  sensors: 4,
  sensor_types: 9,
  sensor_data: 953,
  projects: 2,
  node_data: 36,
  notifications: 12,
  project_emails: 17,
  firebase_tokens: 15,
  temp_otps: 2,
};

async function validate() {
  console.log('=== Migration Validation ===\n');
  
  let allPassed = true;
  
  for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
    const result = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM ${table}`
    );
    const actual = result[0].count;
    const status = actual === expected ? 'PASS' : 'FAIL';
    if (status === 'FAIL') allPassed = false;
    console.log(`${table}: expected=${expected}, actual=${actual} [${status}]`);
  }
  
  // Verify no null required fields
  const nullChecks = [
    { table: 'users', column: 'email_id' },
    { table: 'users', column: 'user_type' },
    { table: 'devices', column: 'device_name' },
    { table: 'sensors', column: 'sensor_name' },
    { table: 'projects', column: 'project_name' },
    { table: 'projects', column: 'created_by' },
  ];
  
  for (const check of nullChecks) {
    const result = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM ${check.table} WHERE ${check.column} IS NULL`
    );
    const nullCount = result[0].count;
    const status = nullCount === 0 ? 'PASS' : 'FAIL';
    if (status === 'FAIL') allPassed = false;
    console.log(`${check.table}.${check.column} nulls: ${nullCount} [${status}]`);
  }
  
  console.log(`\n=== Overall: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} ===`);
  
  await prisma.$disconnect();
}

validate();
```

## Acceptance Criteria

| Check | Criteria |
|-------|----------|
| Row counts | All tables match source counts exactly |
| Primary keys | All IDs preserved, no regeneration |
| Foreign keys | All references resolve to valid records |
| Enums | All enum values preserved correctly |
| Timestamps | All timestamps within 1 second of source |
| JSON data | All JSON fields parseable and contain same data |
| Boolean conversions | 'true'/'false' strings → true/false correctly |
| Null handling | Null fields remain null, defaults preserved |
| Emails | All 4 user emails match exactly |
| Project names | All project names match exactly |
| Sensor data | All 953 sensor readings preserved with correct values |
