# 12. Du lieu va API

## Bang du lieu chinh

- users
- employees
- departments
- roles
- permissions
- attendance_logs
- attendance_adjustment_requests
- leave_types
- leave_balances
- leave_requests
- holidays
- work_schedules
- payroll_periods
- payroll_summaries
- notifications
- audit_logs

## API Auth

- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /me`
- `PUT /me`

## API Attendance

- `POST /attendance/check-in`
- `POST /attendance/check-out`
- `GET /attendance/logs`
- `GET /attendance/logs/:id`
- `POST /attendance/adjustments`
- `POST /attendance/adjustments/:id/approve`
- `POST /attendance/adjustments/:id/reject`

## API Leave

- `GET /leave/requests`
- `POST /leave/requests`
- `GET /leave/requests/:id`
- `POST /leave/requests/:id/approve`
- `POST /leave/requests/:id/reject`
- `POST /leave/requests/:id/cancel`
- `GET /leave/balances`

## API Payroll

- `GET /payroll/periods`
- `POST /payroll/periods`
- `GET /payroll/periods/:id/summaries`
- `POST /payroll/periods/:id/recalculate`
- `POST /payroll/periods/:id/lock`
- `GET /reports/attendance/export`
- `GET /reports/payroll/export`

## API Settings

- `GET /settings/policies`
- `PUT /settings/policies`
- `GET /settings/roles`
- `PUT /settings/roles/:id`
- `GET /settings/holidays`
- `POST /settings/holidays`
- `GET /audit-logs`

## Test can co

- Schema validation cho request/response.
- Auth guard cho tat ca API can bao ve.
- Permission guard theo role va scope.
- Pagination/filter/sort dung.
- Export API dung file format.
