# DATABASE_SCHEMA.md — PostgreSQL Schema

## Schema: public

### 1. users

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  user_type TEXT NOT NULL CHECK (user_type IN ('superadmin', 'admin', 'contractor', 'authority')),
  parent_id INTEGER NOT NULL DEFAULT 0,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  email_id VARCHAR(255) NOT NULL UNIQUE,
  phone_no VARCHAR(255) NOT NULL,
  is_mail_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_user_verified BOOLEAN NOT NULL DEFAULT FALSE,
  password VARCHAR(255) NOT NULL,
  profile_image TEXT,
  status BOOLEAN NOT NULL DEFAULT TRUE,
  csv_access BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_users_email ON users(email_id);
CREATE INDEX idx_users_type ON users(user_type);
CREATE INDEX idx_users_parent ON users(parent_id);
CREATE INDEX idx_users_active ON users(is_deleted, status);
```

**Migration notes:**
- `enum('superadmin','admin','contractor','authority')` → `TEXT CHECK`
- `enum('true','false')` for isMailVerified, isUserVerified, IsDelete → `BOOLEAN`
- `enum('1','0')` for status → `BOOLEAN` (1=true, 0=false)
- `parentId int DEFAULT 0` → `parent_id INTEGER DEFAULT 0` (0 = no parent)
- `csv int DEFAULT 0` → `csv_access BOOLEAN DEFAULT FALSE`
- Preserve all existing IDs

### 2. device_types

```sql
CREATE TABLE device_types (
  id SERIAL PRIMARY KEY,
  device_type VARCHAR(255) NOT NULL,
  device_image VARCHAR(255),
  status BOOLEAN NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 3. devices

```sql
CREATE TABLE devices (
  id SERIAL PRIMARY KEY,
  device_name VARCHAR(255) NOT NULL,
  device_type INTEGER NOT NULL REFERENCES device_types(id),
  channel_count INTEGER NOT NULL,
  device_id VARCHAR(255),
  gateway_device_id VARCHAR(255) NOT NULL,
  added_by INTEGER NOT NULL DEFAULT 0,
  device_status TEXT NOT NULL DEFAULT 'inactive' CHECK (device_status IN ('active', 'inactive')),
  device_start_date TIMESTAMP NOT NULL,
  assigned_admin INTEGER REFERENCES users(id),
  assign_sensor JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  update_heartbeat TIMESTAMPTZ,
  is_ongoing BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_devices_admin ON devices(assigned_admin);
CREATE INDEX idx_devices_status ON devices(device_status, is_deleted);
```

### 4. device_channels

```sql
CREATE TABLE device_channels (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(255) NOT NULL,
  channel_number VARCHAR(255) NOT NULL,
  channel_name VARCHAR(255),
  trigger_value VARCHAR(255),
  threshold_value VARCHAR(255),
  assign_sensor VARCHAR(255),
  active_status BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_device_channels_device ON device_channels(device_id);
```

### 5. sensor_types

```sql
CREATE TABLE sensor_types (
  id SERIAL PRIMARY KEY,
  sensor_type VARCHAR(255) NOT NULL,
  sensor_icon VARCHAR(255) NOT NULL,
  calibration_value VARCHAR(255) NOT NULL,
  status BOOLEAN NOT NULL,
  unit VARCHAR(255)
);
```

### 6. sensors

```sql
CREATE TABLE sensors (
  id SERIAL PRIMARY KEY,
  sensor_name VARCHAR(255) NOT NULL,
  sensor_type_id INTEGER NOT NULL REFERENCES sensor_types(id),
  assigned_admin INTEGER REFERENCES users(id),
  calibration_value VARCHAR(255),
  unit CHAR(255) NOT NULL,
  status BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sensors_admin ON sensors(assigned_admin);
CREATE INDEX idx_sensors_type ON sensors(sensor_type_id);
```

### 7. projects

```sql
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  project_name VARCHAR(255) NOT NULL,
  project_unique_id VARCHAR(512),
  unique_id VARCHAR(50),
  project_location VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  actual_start_date DATE,
  project_logo VARCHAR(255),
  end_date DATE,
  contractor_id INTEGER REFERENCES users(id),
  authority_id INTEGER REFERENCES users(id),
  device_id VARCHAR(255),
  sensor_id TEXT,
  dash_image VARCHAR(255),
  dash_image2 VARCHAR(255),
  status TEXT NOT NULL DEFAULT 'not_start' CHECK (status IN ('not_start', 'start', 'pause', 'end')),
  offset INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INTEGER NOT NULL REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by INTEGER REFERENCES users(id),
  project_device JSONB,
  csv_data BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  is_registered BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_projects_contractor ON projects(contractor_id);
CREATE INDEX idx_projects_authority ON projects(authority_id);
CREATE INDEX idx_projects_status ON projects(status, is_deleted);
CREATE INDEX idx_projects_unique ON projects(unique_id);
```

### 8. sensor_data

```sql
CREATE TABLE sensor_data (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id),
  device_id VARCHAR(255) NOT NULL,
  sensor_id VARCHAR(255) NOT NULL,
  sensor_data DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_sensor_data_project ON sensor_data(project_id, sensor_id, created_at);
CREATE INDEX idx_sensor_data_device ON sensor_data(device_id, created_at);
CREATE INDEX idx_sensor_data_time ON sensor_data(created_at);
```

### 9. node_data

```sql
CREATE TABLE node_data (
  id SERIAL PRIMARY KEY,
  battery INTEGER,
  temperature DOUBLE PRECISION,
  humidity DOUBLE PRECISION,
  pressure DOUBLE PRECISION,
  gateway_device_id VARCHAR(255),
  device_id VARCHAR(255),
  device_name VARCHAR(255),
  project_name VARCHAR(255),
  device_type VARCHAR(255),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  device_updated_at TIMESTAMP NOT NULL
);
```

### 10. notifications

```sql
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  sensor_data_id INTEGER NOT NULL,
  min_value VARCHAR(255),
  max_value VARCHAR(255),
  created_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_notifications_sensor ON notifications(sensor_data_id);
```

### 11. project_emails

```sql
CREATE TABLE project_emails (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  project_id INTEGER NOT NULL REFERENCES projects(id)
);

CREATE INDEX idx_project_emails_project ON project_emails(project_id);
```

### 12. firebase_tokens

```sql
CREATE TABLE firebase_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token TEXT NOT NULL,
  status BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### 13. temp_otps

```sql
CREATE TABLE temp_otps (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  otp VARCHAR(100) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## Entity Relationship Summary

```
users (superadmin)
  ├── users (admin)          [parent_id]
  │     ├── users (contractor)  [parent_id]
  │     └── users (authority)   [parent_id]
  ├── devices                 [assigned_admin]
  ├── sensors                 [assigned_admin]
  ├── projects                [created_by]
  │     ├── contractor_id → users
  │     ├── authority_id → users
  │     ├── project_emails
  │     └── sensor_data
  └── firebase_tokens

device_types
  └── devices

devices
  ├── device_channels
  └── node_data

sensor_types
  └── sensors

sensor_data
  └── notifications

projects
  ├── project_emails
  └── sensor_data
```

## Data Volume Estimates

| Table | Current Rows | Growth Rate | 1-Year Estimate |
|-------|-------------|-------------|-----------------|
| users | 4 | Low | ~50 |
| devices | 2 | Low | ~20 |
| device_channels | 8 | Low | ~80 |
| sensors | 4 | Low | ~40 |
| sensor_types | 9 | Rarely | ~15 |
| device_types | 3 | Rarely | ~5 |
| projects | 2 | Low | ~30 |
| sensor_data | 953 | **HIGH** | ~100K+ |
| node_data | 36 | Medium | ~5K |
| notifications | 12 | Medium | ~500 |
| project_emails | 17 | Low | ~100 |

**Key concern:** `sensor_data` will grow rapidly. Consider:
1. Monthly partitioning
2. Data retention policy (e.g., raw data for 2 years, then aggregate)
3. Indexing strategy for time-range queries
