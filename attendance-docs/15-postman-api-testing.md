# 15. Huong dan test API bang Postman

Tai lieu nay dung theo endpoint dang chay trong `backend/src/server.ts`.

## 1. Chuan bi

Chay backend local:

```bash
cd backend
npm install
npm run build
npm run dev
```

Tao hai bien trong Postman:

| Variable | Local | Deploy |
| --- | --- | --- |
| `baseUrl` | `http://localhost:4000` | `https://attendance-management-system-vjvu.onrender.com` |
| `token` | de trong luc dau | token tra ve tu API login |

Trong request co bao mat, them header:

```text
Authorization: Bearer {{token}}
Content-Type: application/json
```

## 2. Kiem tra server

```http
GET {{baseUrl}}/api/health
```

Ket qua thanh cong:

```json
{
  "ok": true,
  "service": "workforce-pro-api"
}
```

## 3. Dang nhap va lay token

```http
POST {{baseUrl}}/api/auth/login
Content-Type: application/json
```

Body `raw -> JSON`:

```json
{
  "email": "manager@workforce.local",
  "password": "password"
}
```

Copy gia tri `token` trong response gan vao bien Postman `token`. Tai khoan demo:

| Email | Role |
| --- | --- |
| `alex@workforce.local` | Employee |
| `manager@workforce.local` | Manager |
| `hr@workforce.local` | HR |
| `payroll@workforce.local` | Payroll |
| `admin@workforce.local` | Admin |

Test nhanh token:

```http
GET {{baseUrl}}/api/me
Authorization: Bearer {{token}}
```

## 4. Attendance

```http
POST {{baseUrl}}/api/attendance/check-in
POST {{baseUrl}}/api/attendance/check-out
GET {{baseUrl}}/api/attendance/logs
GET {{baseUrl}}/api/attendance/export?format=excel
GET {{baseUrl}}/api/attendance/export?format=pdf
```

Tat ca request tren can Bearer token. Dung check-in truoc, sau do check-out. Goi check-in lan hai khi dang co ca se tra `409`.

Tao yeu cau dieu chinh cong:

```http
POST {{baseUrl}}/api/attendance/logs/{{logId}}/adjustment
```

```json
{
  "checkIn": "08:30 AM",
  "checkOut": "05:30 PM",
  "reason": "Bo quen cham cong vao ca"
}
```

Duyet hoac tu choi:

```http
POST {{baseUrl}}/api/attendance/logs/{{logId}}/approve
POST {{baseUrl}}/api/attendance/logs/{{logId}}/reject
```

## 5. Don nghi phep

Xem danh sach:

```http
GET {{baseUrl}}/api/leave-requests
```

Tao va gui don ngay:

```http
POST {{baseUrl}}/api/leave-requests
```

```json
{
  "type": "Annual Leave",
  "startDate": "2026-09-20",
  "endDate": "2026-09-21",
  "reason": "Nghi phep ca nhan",
  "submitMode": "submit"
}
```

Tao nhap bang cach doi `submitMode` thanh `draft`, sau do gui:

```http
POST {{baseUrl}}/api/leave-requests/{{leaveId}}/submit
POST {{baseUrl}}/api/leave-requests/{{leaveId}}/cancel
```

Duyet don:

```http
POST {{baseUrl}}/api/leave-requests/{{leaveId}}/approve
POST {{baseUrl}}/api/leave-requests/{{leaveId}}/reject
```

Quy trinh de test:

1. Dang nhap Employee, tao don `submit`.
2. Dang nhap Manager, lay token moi va goi `approve`.
3. Neu bat phe duyet HR, dang nhap HR va goi `approve` lan hai.
4. Kiem tra lai `GET /api/leave-requests` va `GET /api/attendance/logs`.

Upload tai lieu dung `form-data` thay cho raw JSON:

- `type`: `Sick Leave`
- `startDate`: `2026-09-22`
- `endDate`: `2026-09-22`
- `reason`: `Kham benh`
- `submitMode`: `submit`
- `attachment`: chon kieu `File` va chon file tren may

## 6. Payroll

```http
GET {{baseUrl}}/api/payroll/periods
POST {{baseUrl}}/api/payroll/periods
POST {{baseUrl}}/api/payroll/periods/{{periodId}}/recalculate
POST {{baseUrl}}/api/payroll/periods/{{periodId}}/confirm
POST {{baseUrl}}/api/payroll/periods/{{periodId}}/lock
POST {{baseUrl}}/api/payroll/periods/{{periodId}}/unlock
GET {{baseUrl}}/api/payroll/periods/{{periodId}}/export?format=excel
GET {{baseUrl}}/api/payroll/periods/{{periodId}}/export?format=pdf
```

Body tao ky cong:

```json
{
  "name": "Ky cong thang 09/2026",
  "startDate": "2026-09-01",
  "endDate": "2026-09-30"
}
```

`unlock` chi danh cho Admin. `lock` danh cho Payroll va Admin. Neu con log can xu ly, API lock tra `409` kem danh sach `warnings`.

## 7. Nhan vien, cai dat va thong bao

```http
GET {{baseUrl}}/api/employees
POST {{baseUrl}}/api/employees
PUT {{baseUrl}}/api/employees/{{employeeId}}
POST {{baseUrl}}/api/employees/{{employeeId}}/lock
POST {{baseUrl}}/api/employees/import
GET {{baseUrl}}/api/settings
PUT {{baseUrl}}/api/settings
GET {{baseUrl}}/api/notifications
POST {{baseUrl}}/api/notifications/read-all
GET {{baseUrl}}/api/help/articles
POST {{baseUrl}}/api/help/support-tickets
GET {{baseUrl}}/api/audit-logs
```

Cac request nay can token. Backend se tra `401` neu thieu token va `403` neu role khong du quyen.

## 8. Ma loi can biet

| Ma | Y nghia |
| --- | --- |
| `200` | Thanh cong |
| `201` | Tao moi thanh cong |
| `400` | Body hoac du lieu khong hop le |
| `401` | Chua dang nhap/token sai |
| `403` | Khong du quyen |
| `404` | Khong tim thay du lieu |
| `409` | Xung dot trang thai, trung don hoac con canh bao |

Luu y: backend hien dung du lieu trong memory. Restart Render co the lam mat du lieu test moi tao. Email va upload hien phuc vu demo, chua phai luu tru production ben vung.