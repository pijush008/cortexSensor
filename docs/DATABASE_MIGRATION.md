# DATABASE_MIGRATION.md — MySQL to PostgreSQL

## Pre-Migration Checklist

- [ ] Full MySQL backup created
- [ ] Row counts recorded for all tables
- [ ] Primary key ranges recorded
- [ ] Foreign key relationships documented
- [ ] Enum values cataloged
- [ ] PostgreSQL database created
- [ ] Prisma schema finalized
- [ ] Migration scripts tested on staging

## Source → Target Mapping

### ID Preservation Strategy
**ALL existing IDs are preserved.** Use `SERIAL` with sequences starting at current max + 1.

| Table | Current Max ID | Sequence Start |
|-------|---------------|----------------|
| users | 62 | 63 |
| devices | 40 | 41 |
| device_channel | 168 | 169 |
| device_type | 5 (data: 3) | 6 |
| sensor | 33 | 34 |
| sensor_type | 16 (data: 9) | 17 |
| sensor_data | 1015 | 1016 |
| project | 99 (data: 2) | 100 |
| nodeData | 76 | 77 |
| notification | 90 (data: 12) | 91 |
| email | 19 (data: 17) | 20 |
| firebasetoken | 15 | 16 |
| temp_otp | 36 (data: 2) | 37 |

### Table Migrations

#### 1. users
```sql
-- Source: MySQL users
-- Target: PostgreSQL users

-- Column mappings:
-- id → id (SERIAL, preserve)
-- userType → user_type (TEXT CHECK)
-- parentId → parent_id (INTEGER)
-- firstName → first_name (VARCHAR)
-- lastName → last_name (VARCHAR)
-- emailId → email_id (VARCHAR UNIQUE)
-- phoneNo → phone_no (VARCHAR)
-- isMailVerified → is_mail_verified (BOOLEAN)
-- isUserVerified → is_user_verified (BOOLEAN)
-- password → password (VARCHAR)
-- profileImage → profile_image (TEXT)
-- status → status (BOOLEAN)
-- csv → csv_access (BOOLEAN)
-- createdAt → created_at (TIMESTAMP)
-- updatedAt → updated_at (TIMESTAMP)
-- IsDelete → is_deleted (BOOLEAN)

-- Value conversions:
-- 'true'/'false' strings → true/false booleans
-- '1'/'0' → true/false
-- enum values preserved as-is
```

#### 2. devices
```sql
-- Column mappings:
-- deviceName → device_name
-- deviceType → device_type (FK to device_types.id)
-- channelCount → channel_count
-- deviceId → device_id (this is the Ackcio device string ID)
-- gatewayDeviceId → gateway_device_id
-- addedBy → added_by
-- deviceStatus → device_status (TEXT CHECK)
-- deviceStartDate → device_start_date
-- assignedAdmin → assigned_admin (FK to users.id)
-- assignSensor → assign_sensor (JSONB)
-- createdAt → created_at
-- status → status (BOOLEAN)
-- updatedBy → updated_by
-- updatedAt → updated_at
-- IsDelete → is_deleted (BOOLEAN)
-- updateHeartBeat → update_heartbeat (TIMESTAMPTZ)
-- isOngoing → is_ongoing (BOOLEAN)

-- Value conversions:
-- 'active'/'inactive' → preserved
-- '1'/'0' for status → true/false
-- 'true'/'false' for IsDelete → true/false
```

#### 3. device_channel
```sql
-- Column mappings:
-- deviceId → device_id (references devices.id as string)
-- channelNumber → channel_number
-- channelName → channel_name
-- triggerValue → trigger_value
-- thresholdValue → threshold_value
-- assignSensor → assign_sensor (string, contains sensor ID)
-- activeStatus → active_status (BOOLEAN)

-- Value conversions:
-- '1'/'0' for activeStatus → true/false
```

#### 4. device_type
```sql
-- Column mappings:
-- deviceType → device_type
-- deviceImage → device_image
-- status → status (BOOLEAN)

-- Value conversions:
-- '1'/'0' for status → true/false
```

#### 5. sensor
```sql
-- Column mappings:
-- sensorName → sensor_name
-- sensorTypeID → sensor_type_id (FK to sensor_types.id)
-- assignedAdmin → assigned_admin (FK to users.id)
-- calibrationValue → calibration_value
-- unit → unit
-- status → status (BOOLEAN)
-- createdAt → created_at

-- Value conversions:
-- '1'/'0' for status → true/false
```

#### 6. sensor_type
```sql
-- Column mappings:
-- sensorType → sensor_type
-- sensorIcon → sensor_icon
-- calibrationValue → calibration_value
-- status → status (BOOLEAN)
-- unit → unit

-- Value conversions:
-- '1'/'0' for status → true/false
```

#### 7. sensor_data
```sql
-- Column mappings:
-- projectId → project_id (FK to projects.id, nullable)
-- device_id → device_id (string)
-- sensor_id → sensor_id (string)
-- sensor_data → sensor_data (DOUBLE PRECISION)
-- createdAt → created_at (TIMESTAMP)

-- NOTE: This is the largest table. Current: ~953 rows.
-- Partition strategy: Monthly range on created_at
-- Index: (project_id, sensor_id, created_at)
```

#### 8. project
```sql
-- Column mappings:
-- projectName → project_name
-- projectUniqueID → project_unique_id
-- uniqueId → unique_id
-- projectLocation → project_location
-- startDate → start_date
-- actualStartDate → actual_start_date
-- projectLogo → project_logo
-- endDate → end_date
-- contractorId → contractor_id (FK to users.id)
-- authorityId → authority_id (FK to users.id)
-- deviceId → device_id (string)
-- sensorId → sensor_id (TEXT, contains JSON array)
-- dashImage → dash_image
-- dashImage2 → dash_image2
-- status → status (TEXT CHECK)
-- offset → offset (INTEGER)
-- createdAt → created_at
-- createdBy → created_by (FK to users.id)
-- updatedAt → updated_at
-- updatedBy → updated_by
-- projectDevice → project_device (JSONB)
-- csvData → csv_data (BOOLEAN)
-- isDelete → is_deleted (BOOLEAN)
-- isRegistered → is_registered (BOOLEAN)

-- Value conversions:
-- 'not_start','start','pause','end' → preserved
-- 0/1 for isDelete → false/true
-- 0/1 for csvData → false/true
```

#### 9. nodeData → node_data
```sql
-- Direct mapping, no special conversions needed.
-- Battery, Temperature, Humidity, Pressure preserved.
```

#### 10. notification → notifications
```sql
-- sensor_data_id → sensor_data_id (INTEGER)
-- min → min_value (VARCHAR)
-- max → max_value (VARCHAR)
-- createdAt → created_at
```

#### 11. email → project_emails
```sql
-- email → email (VARCHAR)
-- isEnable → is_enabled (BOOLEAN)
-- projectId → project_id (FK to projects.id)

-- Value conversions:
-- 1/0 for isEnable → true/false
```

#### 12. firebasetoken → firebase_tokens
```sql
-- userId → user_id (FK to users.id)
-- token → token (TEXT)
-- status → status (BOOLEAN)
-- createdAt → created_at

-- Value conversions:
-- '1'/'0' → true/false
```

#### 13. temp_otp → temp_otps
```sql
-- userId → user_id (FK to users.id)
-- otp → otp (VARCHAR)
-- createdAt → created_at
```

## Migration Script Strategy

### Phase 1: Schema Creation (Prisma)
```bash
cd backend
npx prisma migrate dev --name init
npx prisma db seed
```

### Phase 2: Data Import
```bash
# Export MySQL data as CSV/JSON
mysqldump --user=root --password= --database=structualHealthMonitoring \
  --tab=/tmp/shm_export --fields-terminated-by=',' --fields-enclosed-by='"'

# Or use a migration script that:
# 1. Reads MySQL via mysql2
# 2. Transforms data (type conversions)
# 3. Writes to PostgreSQL via Prisma
```

### Phase 3: Validation
See DATA_VALIDATION.md

## Rollback Plan
1. Keep MySQL database intact (DO NOT DROP)
2. PostgreSQL migration is additive, not destructive
3. If issues found, revert to original stack (legacy source retained in `database/` and backup archive)

## Post-Migration Steps
1. Run data validation queries
2. Test all API endpoints
3. Deploy Next.js app pointing to PostgreSQL
4. Run parallel testing for 1-2 weeks
5. Plan cutover date
