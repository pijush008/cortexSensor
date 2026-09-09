# ROLE_PERMISSION_MATRIX.md

## Role Definitions

| Role | Description | Created By | Parent |
|------|-------------|------------|--------|
| `superadmin` | System owner (Arctano). Full access. | System seed | — (parent_id = 0) |
| `admin` | Company admin. Manages contractors, authorities, projects, devices, sensors. | superadmin | superadmin |
| `contractor` | Project worker. Assigned by admin to projects. | admin | admin |
| `authority` | Project auditor. Assigned by admin to projects. | admin | admin |

---

## Permission Matrix

### Authentication

| Action | superadmin | admin | contractor | authority |
|--------|:----------:|:-----:|:----------:|:---------:|
| Login | ✅ | ✅ | ✅ | ✅ |
| Forgot Password (OTP) | ✅ | ✅ | ✅ | ✅ |
| Change Password | ✅ | ✅ | ✅ | ✅ |
| Email Verification | ✅ | Required | Auto-verified | Auto-verified |

### User Management

| Action | superadmin | admin | contractor | authority |
|--------|:----------:|:-----:|:----------:|:---------:|
| View own profile | ✅ | ✅ | ✅ | ✅ |
| Update own profile | ✅ | ✅ | ✅ | ✅ |
| List admins | ✅ | — | — | — |
| Create admin | ✅ | — | — | — |
| Approve/reject admin | ✅ | — | — | — |
| Delete admin (soft) | ✅ | — | — | — |
| Deactivate admin | ✅ | — | — | — |
| List contractors | ✅ | Own only | — | — |
| Create contractor | — | ✅ | — | — |
| Delete contractor | ✅ | — | — | — |
| List authorities | ✅ | Own only | — | — |
| Create authority | — | ✅ | — | — |
| Delete authority | ✅ | — | — | — |
| Toggle CSV access | ✅ | — | — | — |

### Device Management

| Action | superadmin | admin | contractor | authority |
|--------|:----------:|:-----:|:----------:|:---------:|
| List device types | ✅ | ✅ | — | — |
| Create device | ✅ | ✅ | — | — |
| List devices | ✅ | Assigned only | — | — |
| View device details | ✅ | Assigned only | — | — |
| Update device | ✅ | Assigned only | — | — |
| Delete device | ✅ | — | — | — |
| Assign device to admin | ✅ | — | — | — |
| Assign sensor to channel | ✅ | ✅ | — | — |
| Remove sensor from channel | ✅ | ✅ | — | — |
| View channels | ✅ | ✅ | — | — |
| Update channel settings | ✅ | ✅ | — | — |
| Swap channel sensors | ✅ | ✅ | — | — |

### Sensor Management

| Action | superadmin | admin | contractor | authority |
|--------|:----------:|:-----:|:----------:|:---------:|
| List sensor types | ✅ | ✅ | — | — |
| Create sensor type | ✅ | ✅ | — | — |
| Update sensor type | ✅ | ✅ | — | — |
| Delete sensor type | ✅ | ✅ | — | — |
| Create sensor | ✅ | ✅ | — | — |
| List sensors | ✅ | Assigned only | — | — |
| Update sensor | ✅ | ✅ | — | — |
| Delete sensor | ✅ | — | — | — |
| Assign sensor to admin | ✅ | — | — | — |
| List sensors by assign status | ✅ | ✅ | — | — |

### Project Management

| Action | superadmin | admin | contractor | authority |
|--------|:----------:|:-----:|:----------:|:---------:|
| Create project | — | ✅ | — | — |
| List projects | All | Own only | Assigned only | Assigned only |
| View project detail | ✅ | Own only | Assigned only | Assigned only |
| Update project | — | Own only | — | — |
| Delete project | — | Own only | — | — |
| Start/pause/end project | — | Own only | — | — |
| Generate project code | — | ✅ | — | — |
| Register/setup project | — | ✅ | — | — |
| Update date offset | — | ✅ | — | — |
| Update dashboard images | — | Own only | — | — |

### Project Dashboard

| Action | superadmin | admin | contractor | authority |
|--------|:----------:|:-----:|:----------:|:---------:|
| View project dashboard | ✅ | ✅ | Assigned only | Assigned only |
| View sensor data (real-time) | ✅ | ✅ | Assigned only | Assigned only |
| View MQTT live data | ✅ | ✅ | Assigned only | Assigned only |

### Reports

| Action | superadmin | admin | contractor | authority |
|--------|:----------:|:-----:|:----------:|:---------:|
| View sensor report | ✅ | ✅ | Assigned only | Assigned only |
| Download report PDF | ✅ | ✅ | Assigned only | Assigned only |
| View comparison report | ✅ | ✅ | Assigned only | Assigned only |
| Download comparison PDF | ✅ | ✅ | Assigned only | Assigned only |

### Data Export/Import

| Action | superadmin | admin | contractor | authority |
|--------|:----------:|:-----:|:----------:|:---------:|
| Export CSV (ZIP) | ✅ | ✅ (csv_access) | — | — |
| Export project PDF | ✅ | ✅ | — | — |
| Import CSV | ✅ | ✅ | — | — |
| Download user list PDF | ✅ | — | — | — |
| Download device list PDF | ✅ | — | — | — |
| Download sensor list PDF | ✅ | — | — | — |
| Download project list PDF | ✅ | — | — | — |

### Email Notifications

| Action | superadmin | admin | contractor | authority |
|--------|:----------:|:-----:|:----------:|:---------:|
| Manage project email list | — | Own only | — | — |
| Receive threshold alerts | — | — | If in email list | If in email list |
| Receive project start/end | — | — | If in email list | If in email list |

### Admin Dashboard

| Action | superadmin | admin | contractor | authority |
|--------|:----------:|:-----:|:----------:|:---------:|
| View dashboard stats | ✅ | ✅ | — | — |
| View project graph | ✅ | ✅ | — | — |
| View device graph | ✅ | ✅ | — | — |
| View sensor graph | ✅ | ✅ | — | — |
| View user graph | ✅ | ✅ | — | — |

### IoT Data

| Action | superadmin | admin | contractor | authority |
|--------|:----------:|:-----:|:----------:|:---------:|
| Ingest device data | Device (no auth) | — | — | — |
| View node data | ✅ | ✅ | — | — |
| View Ackcio sensor data | ✅ | ✅ | — | — |

---

## Implementation Notes

### RBAC Middleware
```typescript
// Each protected route uses:
router.get('/devices', auth, rbac(['superadmin', 'admin']), controller.list);

// With resource-level filtering:
router.get('/projects/:id', auth, rbac('all'), controller.getById);
// Service layer then filters by role:
// superadmin → no filter
// admin → WHERE created_by = userId
// contractor/authority → WHERE contractor_id OR authority_id = userId
```

### Cascading Deletes
When a superadmin deletes an admin:
1. All contractors under that admin → soft-deleted
2. All authorities under that admin → soft-deleted
3. All devices assigned to that admin → unassigned
4. All sensors assigned to that admin → unassigned
5. All projects created by that admin → status set to inactive

### Auto-Verification
- `contractor` and `authority` accounts created by admin are auto-verified (`is_user_verified = true`)
- `admin` accounts require superadmin approval (`is_user_verified = false` until approved)
