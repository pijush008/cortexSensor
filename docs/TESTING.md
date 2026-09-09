# TESTING.md — Test Strategy

## Test Pyramid

```
        ┌──────────┐
        │  E2E     │  (Playwright)
        │  Tests   │
        ├──────────┤
        │Integration│  (Supertest + Prisma)
        │  Tests   │
        ├──────────┤
        │  Unit    │  (Vitest)
        │  Tests   │
        └──────────┘
```

## Backend Tests

### Unit Tests (Vitest)

#### Auth Module
| Test | Description |
|------|-------------|
| `auth.service.test.ts` | |
| Login with valid credentials → returns token | ✅ |
| Login with invalid password → returns error | ✅ |
| Login with deleted user → returns error | ✅ |
| Login with unverified user → returns error | ✅ |
| Register admin → requires approval | ✅ |
| Register contractor → auto-verified | ✅ |
| Register authority → auto-verified | ✅ |
| Forgot password → generates OTP | ✅ |
| Validate OTP → valid code accepted | ✅ |
| Validate OTP → invalid code rejected | ✅ |
| Change password → updates hash | ✅ |

#### Users Module
| Test | Description |
|------|-------------|
| `users.service.test.ts` | |
| Get user profile → returns user data | ✅ |
| Update user → modifies fields | ✅ |
| Soft delete user → sets is_deleted | ✅ |
| Delete admin → cascades to sub-users | ✅ |
| List users → pagination works | ✅ |
| List users → search filters | ✅ |
| Superadmin verify user → approves | ✅ |
| Superadmin reject user → cascades | ✅ |
| Toggle CSV access → flips flag | ✅ |

#### Devices Module
| Test | Description |
|------|-------------|
| `devices.service.test.ts` | |
| Create device → creates channels | ✅ |
| Create device → validates channel count | ✅ |
| List devices → admin sees assigned only | ✅ |
| List devices → superadmin sees all | ✅ |
| Update device → modifies fields | ✅ |
| Delete device → soft delete | ✅ |
| Assign sensor → updates channel | ✅ |
| Assign sensor → removes from other device | ✅ |
| Remove sensor from channel → updates | ✅ |

#### Sensors Module
| Test | Description |
|------|-------------|
| `sensors.service.test.ts` | |
| Create sensor → duplicate name rejected | ✅ |
| Create sensor → validates sensor type exists | ✅ |
| List sensors → admin sees assigned only | ✅ |
| Update sensor → modifies fields | ✅ |
| Delete sensor → warns about hard delete | ✅ |

#### Projects Module
| Test | Description |
|------|-------------|
| `projects.service.test.ts` | |
| Create project → unique name required | ✅ |
| Create project → generates unique ID | ✅ |
| List projects → superadmin sees all | ✅ |
| List projects → admin sees own only | ✅ |
| List projects → contractor sees assigned | ✅ |
| List projects → authority sees assigned | ✅ |
| Start project → status changes | ✅ |
| End project → captures device snapshot | ✅ |
| End project → sends notifications | ✅ |
| Delete project → soft delete | ✅ |
| Generate project code → correct format | ✅ |

#### Dashboard Module
| Test | Description |
|------|-------------|
| `dashboard.service.test.ts` | |
| Get stats → correct project counts | ✅ |
| Get stats → role-based filtering | ✅ |
| Get graph data → week aggregation | ✅ |
| Get graph data → month aggregation | ✅ |
| Get graph data → year aggregation | ✅ |

#### Reports Module
| Test | Description |
|------|-------------|
| `reports.service.test.ts` | |
| Sensor report → date range filter | ✅ |
| Sensor report → frequency aggregation | ✅ |
| Sensor report → offset handling | ✅ |
| Comparison report → multiple sensors | ✅ |

### Integration Tests (Supertest)

| Test Suite | Description |
|-----------|-------------|
| Auth flow | Register → Verify → Login → Access protected |
| RBAC | contractor cannot access admin endpoints |
| Device lifecycle | Create → Assign → Channel setup → Delete |
| Project lifecycle | Create → Start → Pause → End |
| Sensor data flow | Ingest → Query → Report |
| Export flow | Export CSV → Verify ZIP contents |

### RBAC Integration Tests

```typescript
describe('Role-Based Access Control', () => {
  it('contractor cannot create a project', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${contractorToken}`)
      .send({ projectName: 'Test' });
    expect(res.status).toBe(403);
  });

  it('admin cannot delete another admin user', async () => {
    const res = await request(app)
      .delete(`/api/users/${otherAdminId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  it('authority cannot manage devices', async () => {
    const res = await request(app)
      .post('/api/devices')
      .set('Authorization', `Bearer ${authorityToken}`)
      .send({ deviceName: 'Test' });
    expect(res.status).toBe(403);
  });
});
```

## Frontend Tests

### Component Tests (Vitest + React Testing Library)

| Component | Test |
|-----------|------|
| LoginForm | Renders email/password fields, handles submit |
| UserTable | Renders rows, handles pagination |
| DeviceTable | Renders devices, filters by status |
| ProjectTable | Renders projects, role-based columns |
| DashboardStats | Displays counts correctly |
| SensorChart | Renders chart with data |
| DataTable | Sorting, filtering, pagination work |

### E2E Tests (Playwright)

| Flow | Description |
|------|-------------|
| Login → Dashboard | Complete login flow |
| Create user → List users | Admin creates contractor, appears in list |
| Create device → Assign sensor | Full device setup flow |
| Create project → View dashboard | End-to-end project flow |
| Generate report → Download PDF | Report generation flow |
| Export CSV → Import CSV | Data round-trip |
| MQTT live data → Dashboard updates | Real-time data flow |

## Test Commands

```bash
# Backend
cd backend
npm run test              # Unit tests
npm run test:integration  # Integration tests
npm run test:coverage     # Coverage report

# Frontend
cd frontend
npm run test              # Component tests
npm run test:e2e          # E2E tests
npm run test:coverage     # Coverage report
```

## Coverage Targets

| Module | Target |
|--------|--------|
| Auth | 90%+ |
| Users | 85%+ |
| Devices | 85%+ |
| Sensors | 85%+ |
| Projects | 90%+ |
| Dashboard | 80%+ |
| Reports | 80%+ |
| Exports | 85%+ |
| Frontend components | 70%+ |
