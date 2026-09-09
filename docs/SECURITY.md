# SECURITY.md — Security Requirements for Migration

## Critical Security Fixes

### 1. Role-Based Authorization (HIGH PRIORITY)
**Current:** No RBAC. Any authenticated user can access any endpoint.
**Fix:** Implement RBAC middleware that checks user role before every protected operation.

```typescript
// src/middleware/rbac.ts
export const rbac = (...allowedRoles: string[]) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' }
      });
    }
    next();
  };
};
```

### 2. Fix SQL Injection (HIGH PRIORITY)
**Current:** String interpolation in 6+ queries:
- `sensorListOnType`: `s.assignedAdmin = ${adminId}`
- `channelSwap`: `formattedChannelIds` in IN clause
- `channelListByDeviceId`: `d.id = ${deviceId}`
- `dashboardController`: userId/userType interpolation
- `ackcioController`: DeviceId/GatewayDeviceId interpolation

**Fix:** Use parameterized queries via Prisma (eliminates SQL injection entirely).

### 3. Fix Login Endpoint (HIGH PRIORITY)
**Current:** Credentials sent as query parameters (visible in logs, browser history).
**Fix:** Send credentials in POST body.

```typescript
// BEFORE (insecure):
// POST /api/commonLogin?username=x&password=y

// AFTER (secure):
// POST /api/auth/login
// Body: { "email": "x", "password": "y" }
```

### 4. Secure IoT Endpoint (MEDIUM PRIORITY)
**Current:** `POST /api/beamDeviceData` has no authentication.
**Fix:** Use API key or device certificate authentication.

```typescript
// Option 1: API key in header
router.post('/iot/device-data', apiKeyAuth, controller.ingest);

// Option 2: HMAC signature verification
// Device signs payload with shared secret
```

### 5. Secure Cron Endpoint (MEDIUM PRIORITY)
**Current:** `POST /api/project_analysis` has no authentication → ✅ Fixed (P1.10): now `authenticate, superAdminOnly`. Only the platform superadmin (or an internal scheduler holding a superadmin token) can run auto start/end transitions.

### 6. JWT Improvements (MEDIUM PRIORITY)
**Current:** 30-day expiry, weak secret, no refresh mechanism.
**Fix:**
- Access token: 24h expiry
- Refresh token: 7d expiry, rotated on use
- Strong random secret (256-bit)
- HttpOnly cookie storage (not localStorage)

```typescript
// .env
JWT_SECRET=<random-256-bit-hex>
JWT_REFRESH_SECRET=<random-256-bit-hex>
JWT_ACCESS_EXPIRY=24h
JWT_REFRESH_EXPIRY=7d
```

### 7. CORS Configuration (MEDIUM PRIORITY)
**Current:** `cors()` allows all origins.
**Fix:** Whitelist specific origins.

```typescript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));
```

### 8. Rate Limiting (MEDIUM PRIORITY)
**Current:** No rate limiting.
**Fix:** Apply rate limits to sensitive endpoints.

```typescript
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { error: 'Too many login attempts' },
});
```

### 9. Input Validation (MEDIUM PRIORITY)
**Current:** Joi validation exists but inconsistent.
**Fix:** Zod schemas for all endpoints, consistent validation.

### 10. Secrets Management (LOW PRIORITY for migration)
**Current:** .env committed to git with real credentials.
**Fix:**
- .env.example with placeholders only
- .gitignore includes .env
- Use environment variables in deployment
- Rotate all credentials

### 11. CORS Headers (LOW PRIORITY)
**Fix:** Add security headers via helmet.

```typescript
import helmet from 'helmet';
app.use(helmet());
```

### 12. SQL Injection in sensor_data (LOW PRIORITY)
**Current:** `sensor_data` table stores device_id and sensor_id as strings.
**Fix:** While Prisma prevents injection, consider proper FK references.

## Security Checklist

| Item | Status | Priority |
|------|--------|----------|
| RBAC middleware | TODO | HIGH |
| Parameterized queries (Prisma) | TODO | HIGH |
| Login via POST body | TODO | HIGH |
| Strong JWT secrets | TODO | HIGH |
| HttpOnly cookie storage | TODO | MEDIUM |
| Refresh token rotation | TODO | MEDIUM |
| IoT API key auth | TODO | MEDIUM |
| Cron endpoint protection | TODO | MEDIUM |
| Rate limiting | TODO | MEDIUM |
| CORS whitelist | TODO | MEDIUM |
| Security headers (helmet) | TODO | LOW |
| Input validation (Zod) | TODO | MEDIUM |
| No secrets in git | TODO | LOW |
| SQL injection prevention | DONE (via Prisma) | — |

## Password Security
- Bcrypt with 12 salt rounds (increased from 10)
- Minimum password length: 8 characters
- Password complexity: at least 1 uppercase, 1 lowercase, 1 number
- Never store plaintext passwords
- Never log passwords
- Never return passwords in API responses

## File Upload Security
- Validate file types (MIME type + extension)
- Limit file size (10MB default)
- Store outside web root
- Generate random filenames
- Scan for malware in production

## Audit Logging
Implement for sensitive operations:
- Login/logout
- User create/update/delete
- Project create/update/delete
- Device/sensor create/update/delete
- Permission changes
- Data exports

```sql
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100) NOT NULL,
  entity_id INTEGER,
  old_value JSONB,
  new_value JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```
