# ARCHITECTURE.md — SHM Migration

## System Architecture

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│              Next.js 14+ (App Router)            │
│              React 18 + TypeScript               │
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  Pages   │ │Components│ │   Feature Modules │ │
│  │  (SSR/   │ │  (UI)    │ │  (hooks, types,   │ │
│  │   RSC)   │ │          │ │   utils, api)     │ │
│  └────┬─────┘ └──────────┘ └──────────────────┘ │
│       │                                          │
│  ┌────▼─────────────────────────────────────┐    │
│  │         API Client Layer (fetch/axios)    │    │
│  └────────────────────┬─────────────────────┘    │
└───────────────────────┼──────────────────────────┘
                        │ REST API + WebSocket
┌───────────────────────┼──────────────────────────┐
│                 Backend                          │
│       Node.js + TypeScript + Express             │
│                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │   Auth   │ │Business  │ │  Infrastructure  │ │
│  │Middleware│ │Logic Layer│ │  (DB, MQTT,      │ │
│  │  (JWT,   │ │(Services)│ │   Email, Files)  │ │
│  │   RBAC)  │ │          │ │                  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │              Prisma Client               │    │
│  └──────────────────┬───────────────────────┘    │
└─────────────────────┼────────────────────────────┘
                      │
┌─────────────────────┼────────────────────────────┐
│              PostgreSQL 15+                       │
│                                                  │
│  ┌──────┐ ┌────────┐ ┌────────┐ ┌──────────┐   │
│  │users │ │devices │ │sensors │ │projects  │   │
│  └──────┘ └────────┘ └────────┘ └──────────┘   │
│  ┌──────────┐ ┌───────────┐ ┌──────────────┐   │
│  │sensor_   │ │device_    │ │sensor_data   │   │
│  │data      │ │channels   │ │(partitioned) │   │
│  └──────────┘ └───────────┘ └──────────────┘   │
└──────────────────────────────────────────────────┘

External:
┌──────────────┐  ┌──────────────┐  ┌──────────┐
│ Ackcio IoT   │  │ MQTT Broker  │  │  Gmail   │
│ Devices      │──│ (WebSocket)  │  │  SMTP    │
│              │  │ ws://broker  │  │          │
└──────────────┘  └──────────────┘  └──────────┘
```

## Directory Structure

### Frontend (`frontend/`)

```
frontend/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Auth route group (no layout)
│   │   ├── login/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── verify-otp/page.tsx
│   ├── (dashboard)/              # Dashboard layout group
│   │   ├── layout.tsx            # Sidebar + header layout
│   │   ├── [userType]/
│   │   │   ├── page.tsx          # Dashboard home
│   │   │   ├── users/
│   │   │   │   ├── admin/page.tsx
│   │   │   │   ├── contractor/page.tsx
│   │   │   │   ├── authority/page.tsx
│   │   │   │   └── add/page.tsx
│   │   │   ├── devices/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [deviceId]/
│   │   │   │   │   └── channels/page.tsx
│   │   │   │   └── add/page.tsx
│   │   │   ├── sensors/
│   │   │   │   ├── page.tsx
│   │   │   │   └── add/page.tsx
│   │   │   ├── projects/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── add/page.tsx
│   │   │   │   └── [uniqueId]/
│   │   │   │       ├── dashboard/page.tsx
│   │   │   │       ├── report/page.tsx
│   │   │   │       ├── export/page.tsx
│   │   │   │       └── settings/page.tsx
│   │   │   └── profile/page.tsx
│   │   └── ...
│   ├── api/                      # Next.js API routes (proxy only)
│   └── layout.tsx                # Root layout
├── components/
│   ├── ui/                       # Reusable UI components
│   ├── layout/                   # Layout components
│   ├── dashboard/                # Dashboard components
│   ├── charts/                   # Chart components
│   ├── tables/                   # Data table components
│   ├── forms/                    # Form components
│   └── common/                   # Shared widgets
├── lib/
│   ├── api/                      # API client functions
│   ├── hooks/                    # Custom React hooks
│   ├── types/                    # TypeScript types
│   ├── utils/                    # Utility functions
│   ├── constants/                # App constants
│   └── validators/               # Zod schemas
├── providers/                    # React context providers
├── styles/                       # Global styles
└── public/                       # Static assets
```

### Backend (`backend/`)

```
backend/
├── prisma/
│   ├── schema.prisma             # Database schema
│   ├── seed.ts                   # Seed script
│   └── migrations/               # Auto-generated migrations
├── src/
│   ├── config/
│   │   ├── database.ts           # Prisma client singleton
│   │   ├── env.ts                # Environment variable validation
│   │   └── mqtt.ts               # MQTT client setup
│   ├── middleware/
│   │   ├── auth.ts               # JWT verification
│   │   ├── rbac.ts               # Role-based access control
│   │   ├── validate.ts           # Request validation (Zod)
│   │   ├── errorHandler.ts       # Global error handler
│   │   └── upload.ts             # File upload (multer/busboy)
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.routes.ts
│   │   │   └── auth.types.ts
│   │   ├── users/
│   │   │   ├── users.controller.ts
│   │   │   ├── users.service.ts
│   │   │   ├── users.routes.ts
│   │   │   └── users.types.ts
│   │   ├── devices/
│   │   │   ├── devices.controller.ts
│   │   │   ├── devices.service.ts
│   │   │   ├── devices.routes.ts
│   │   │   └── devices.types.ts
│   │   ├── sensors/
│   │   │   ├── sensors.controller.ts
│   │   │   ├── sensors.service.ts
│   │   │   ├── sensors.routes.ts
│   │   │   └── sensors.types.ts
│   │   ├── projects/
│   │   │   ├── projects.controller.ts
│   │   │   ├── projects.service.ts
│   │   │   ├── projects.routes.ts
│   │   │   └── projects.types.ts
│   │   ├── dashboard/
│   │   │   ├── dashboard.controller.ts
│   │   │   ├── dashboard.service.ts
│   │   │   └── dashboard.routes.ts
│   │   ├── reports/
│   │   │   ├── reports.controller.ts
│   │   │   ├── reports.service.ts
│   │   │   ├── reports.routes.ts
│   │   │   └── reports.types.ts
│   │   ├── channels/
│   │   │   ├── channels.controller.ts
│   │   │   ├── channels.service.ts
│   │   │   └── channels.routes.ts
│   │   ├── notifications/
│   │   │   ├── notifications.controller.ts
│   │   │   ├── notifications.service.ts
│   │   │   └── notifications.routes.ts
│   │   ├── iot/
│   │   │   ├── iot.controller.ts
│   │   │   ├── iot.service.ts
│   │   │   └── iot.routes.ts
│   │   ├── exports/
│   │   │   ├── exports.controller.ts
│   │   │   ├── exports.service.ts
│   │   │   └── exports.routes.ts
│   │   └── emails/
│   │       ├── emails.service.ts
│   │       └── emails.templates.ts
│   ├── utils/
│   │   ├── jwt.ts                # JWT sign/verify
│   │   ├── bcrypt.ts             # Password hashing
│   │   ├── pdf.ts                # PDF generation
│   │   ├── csv.ts                # CSV export/import
│   │   ├── chart.ts              # Chart generation
│   │   ├── otp.ts                # OTP generation
│   │   └── image.ts              # Image handling
│   ├── types/
│   │   └── index.ts              # Shared types
│   ├── app.ts                    # Express app setup
│   └── server.ts                 # Server entry point
├── uploads/                      # File uploads
├── .env.example                  # Environment template
├── tsconfig.json
├── package.json
└── README.md
```

## Authentication Flow

```
1. User enters email + password
2. POST /api/auth/login { email, password }  ← NOT query params
3. Backend validates with Zod schema
4. Backend queries PostgreSQL for user
5. bcrypt.compare(password, hashedPassword)
6. Backend checks: isMailVerified, isUserVerified, isDelete
7. Backend signs JWT: { userId, userType } with 24h expiry
8. Returns: { token, user: { id, name, type, ... } }
9. Frontend stores token in HttpOnly cookie (not localStorage)
10. Subsequent requests: Authorization: Bearer <token>
11. Auth middleware: verify JWT → check user exists → check not deleted → attach to req
12. RBAC middleware: check user.role has permission for this route
```

## Role-Based Access Control (RBAC)

```typescript
// Middleware chain for protected routes:
auth → rbac(roles) → validate(schema) → controller → service → prisma

// Role hierarchy:
SUPERADMIN > ADMIN > CONTRACTOR/AUTHORITY

// Permission matrix encoded as:
const PERMISSIONS = {
  SUPERADMIN: ['*'],  // All permissions
  ADMIN: [
    'users:read:own', 'users:create:contractor', 'users:create:authority',
    'devices:read:assigned', 'devices:create', 'devices:update:assigned',
    'sensors:read:assigned', 'sensors:create', 'sensors:update',
    'projects:read:own', 'projects:create', 'projects:update:own', 'projects:delete:own',
    'reports:read:assigned', 'exports:csv', 'dashboard:read',
    'channels:read:assigned', 'channels:update:assigned',
    'emails:manage:own',
  ],
  CONTRACTOR: [
    'projects:read:assigned', 'reports:read:assigned',
  ],
  AUTHORITY: [
    'projects:read:assigned', 'reports:read:assigned',
  ],
};
```

## Real-time Architecture (MQTT + WebSocket)

```
Ackcio Device
  ↓ (MQTT publish)
MQTT Broker (configure via env; e.g. ws://your-mqtt-broker:9001)
  ↓ (MQTT subscribe)
Backend (mqtt.js client)
  ↓ (process + store + publish)
Socket.IO Server
  ↓ (WebSocket push)
Next.js Frontend (socket.io-client)
  ↓ (React state update)
Dashboard UI (live charts)
```

## Data Flow Patterns

### Sensor Data Ingestion

```
1. POST /api/iot/device-data (IoT device → backend)
2. Parse data type (NodeData / Heartbeat / SensorData / Network)
3. Validate payload
4. Insert into PostgreSQL (sensor_data table)
5. Apply calibration if applicable
6. Check trigger/threshold values
7. If threshold exceeded → insert notification + send email
8. Publish to MQTT topic
9. Socket.IO broadcasts to connected clients
```

### Project Creation

```
1. ADMIN creates project via form
2. POST /api/projects { name, location, contractor, authority, device, sensors, ... }
3. Backend validates: unique name, valid IDs, device exists, sensors exist
4. Generate unique 10-char project ID
5. Create project record
6. Assign device to project
7. Assign sensors to device channels
8. Create audit record
9. Return project with generated code
```

## Performance Considerations

### sensor_data Table Strategy

- **Partitioning:** Monthly range partitions by `createdAt`
- **Indexing:** Composite index on `(projectId, sensor_id, createdAt)`
- **Aggregation:** Use PostgreSQL window functions for reports
- **Retention:** Consider data archival policy for old readings

### Dashboard Queries

- Materialized views for aggregated counts
- Redis caching for frequently accessed stats
- Pagination on all list endpoints (cursor-based preferred)
