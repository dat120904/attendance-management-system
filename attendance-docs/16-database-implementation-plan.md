# Ke hoach trien khai Database cho Workforce Pro

## 1. Muc tieu

Chuyen du lieu dang luu trong RAM sang PostgreSQL de du lieu khong bi mat khi backend khoi dong lai va co the deploy on dinh.

Pham vi cua dot nay:

- Luu tai khoan, nhan vien, PIN hash va phan quyen.
- Luu phien cham cong dang mo va lich su cham cong.
- Luu don nghi phep, thong bao, cai dat, ky luong va audit log.
- Giu nguyen contract API hien tai toi da co the de frontend khong bi anh huong lon.
- Khong xoa du lieu hoac reset database khi deploy.

Khong nam trong pham vi dot dau:

- Dong bo may cham cong vat ly.
- Phan quyen database theo tung tenant/cong ty.
- Cache Redis bat buoc. Redis se duoc them khi can chay nhieu backend instance.

## 2. Kien truc duoc de xuat

```text
Frontend (Vercel)
        |
        v
Backend API (Node.js)
        |
        v
Prisma ORM
        |
        v
PostgreSQL (Supabase / Neon / Railway)
```

Lua chon de xuat: PostgreSQL + Prisma.

Ly do:

- Phu hop cho du lieu quan he: nhan vien, ca lam, don nghi, luong va audit.
- Prisma tao migration co phien ban, de review va deploy.
- Backend hien tai TypeScript nen typing cua Prisma giam loi khi thay the du lieu RAM.

## 3. Chuan bi truoc khi code

- [ ] Chon nha cung cap PostgreSQL va tao project database.
- [ ] Tao database rieng cho `development`, `staging` neu co, va `production`.
- [ ] Luu connection string vao bien moi truong, khong commit vao Git.
- [ ] Sao luu file `.env` o noi an toan.
- [ ] Xac nhan branch se deploy backend va frontend.
- [ ] Tao database backup schedule tren nha cung cap.

Bien moi truong backend can co:

```env
DATABASE_URL="postgresql://user:password@host:5432/workforce_pro?sslmode=require"
```

Neu provider cap URL tach cho pooled connection va direct connection, dung URL pooled cho app va direct URL cho migration theo huong dan provider.

## 4. Cai dat Prisma

Chay trong thu muc `backend`:

```bash
npm install @prisma/client
npm install -D prisma
npx prisma init
```

Tao cac file:

```text
backend/prisma/schema.prisma
backend/src/db.ts
backend/.env
```

`backend/src/db.ts` chi tao mot `PrismaClient` dung chung cho server. Khong tao client moi trong tung request.

Checkpoint:

- [ ] `npx prisma validate` thanh cong.
- [ ] `npx prisma generate` thanh cong.
- [ ] `DATABASE_URL` khong xuat hien trong Git diff.

## 5. Thiet ke schema giai doan 1

### 5.1 Bang User

Truong toi thieu:

```text
id, email, passwordHash, pinHash, name, employeeCode,
phone, role, department, position, managerId,
employmentStatus, remainingLeaveDays, locked,
createdAt, updatedAt
```

Rang buoc:

- `email` unique.
- `employeeCode` unique.
- `phone` khong tra ve tu API danh sach cham cong cong khai.
- `pinHash` nullable trong luc chuyen doi du lieu, nhung khong bao gio tra ve frontend.
- Chuyen `locked` va `employmentStatus` thanh mot quy uoc ro rang de tranh mau thuan.

### 5.2 Bang AttendanceSession

Luu ca dang hoat dong:

```text
id, employeeId, checkInAt, device, ipAddress, location, createdAt
```

Rang buoc quan trong:

- Mot nhan vien chi co mot `AttendanceSession` dang mo.
- Check-out phai xoa hoac danh dau dong phien nay trong cung transaction voi viec tao log.

### 5.3 Bang AttendanceLog

```text
id, employeeId, workDate, checkInAt, checkOutAt,
totalMinutes, overtimeMinutes, status, adjustmentStatus,
payrollLocked, createdAt, updatedAt
```

Nen luu thoi gian dang `DateTime` va thoi luong dang so phut. Chuoi nhu `8h 40m` chi format o API/frontend.

### 5.4 Bang AuditLog

```text
id, actorId, action, targetId, success,
ipAddress, userAgent, createdAt
```

Khong luu PIN, `pinHash`, password, hoac body request day du.

### 5.5 Cac bang nghiep vu con lai

Tao schema cho:

- `LeaveRequest`, `LeaveAttachment`, `LeaveWorkflowConfig`.
- `Notification`.
- `PayrollPeriod`, `PayrollSummaryRow`, `PayrollVersion`.
- `WorkSchedule`, `Holiday`, `SystemSetting`.
- `HelpArticle`, `SupportTicket`.

Bat dau voi cac truong ma API hien tai dang dung. Khong can thiet ke lai toan bo giao dien trong dot migration.

Checkpoint:

- [ ] Schema duoc review voi cac quan he `User -> AttendanceSession`, `User -> AttendanceLog`, `User -> LeaveRequest`.
- [ ] Co index cho `employeeId`, `workDate`, `managerId`, `status` o cac bang hay truy van.
- [ ] `pinHash` va `passwordHash` khong co trong DTO public.

## 6. Tao migration dau tien

```bash
cd backend
npx prisma migrate dev --name init_postgres
npx prisma generate
```

Kiem tra migration truoc khi commit:

```bash
npx prisma migrate status
npx prisma studio
```

Chi commit:

```text
backend/prisma/schema.prisma
backend/prisma/migrations/<timestamp>_init_postgres/
```

Khong commit file `.env` that.

## 7. Tao seed data an toan

Tao `backend/prisma/seed.ts` de seed tai khoan demo:

- Dat, Linh, Morgan, Taylor, Jordan, Admin.
- Mat khau demo phai duoc hash.
- PIN demo `1234` phai duoc hash bang `scrypt`, bcrypt hoac argon2.
- So dien thoai demo chi dung trong database, khong hien o man hinh public.

Lenh du kien:

```bash
npx prisma db seed
```

Checkpoint:

- [ ] Dang nhap email/password van hoat dong voi tai khoan demo.
- [ ] Quick Check-in dung 4 so cuoi + PIN dung.
- [ ] API public khong tra `phone`, `passwordHash`, `pinHash`.

## 8. Thay the du lieu RAM theo tung nhom

Khong thay tat ca trong mot commit. Thuc hien theo thu tu sau.

### Dot A - User va Authentication

- Thay `users` trong `backend/src/data.ts` bang repository Prisma.
- Chuyen map password trong RAM thanh `passwordHash` trong database.
- Cap nhat login, register, `/api/me`, employee management.
- Giu nguyen response API de frontend khong can doi hang loat.

Test sau Dot A:

- [ ] Login dung/sai.
- [ ] Register.
- [ ] Khoa tai khoan.
- [ ] RBAC theo role.

### Dot B - Quick Check-in va Attendance

- Thay `activeAttendanceSessions` bang bang `AttendanceSession`.
- Thay `attendanceLogs` bang `AttendanceLog`.
- Dung Prisma transaction cho check-out: tao log + dong session.
- Dung transaction hoac unique constraint de chan check-in trung.
- Chuyen rate limit sang Redis neu deploy nhieu instance backend.

Test sau Dot B:

- [ ] Sai phone/PIN tra loi chung.
- [ ] Dung phone/PIN check-in thanh cong.
- [ ] Check-in lap lai bi chan.
- [ ] Check-out khi chua co session bi chan.
- [ ] Check-in -> check-out tao dung mot log.
- [ ] Audit log co thanh cong va that bai.

### Dot C - Leave, Settings va Notifications

- Chuyen don nghi phep, file dinh kem metadata, workflow va cai dat.
- Chuyen notification va support ticket.
- Dung transaction khi duyet don va tru phep con lai.

### Dot D - Payroll va Audit

- Chuyen ky luong, dong/mo khoa ky luong, dong du lieu payroll.
- Chuyen audit log hoan toan sang database.
- Them index va phan trang cho trang log lon.

## 9. Quy tac API va DTO

Tao ham chuyen doi nhat quan:

```text
User database -> authenticated user DTO
User database -> public quick-attendance DTO
AttendanceLog database -> attendance log API DTO
```

Quy tac:

- API `/api/attendance/quick-users` chi tra `id`, `name`, `employeeCode`, `role`, `attendanceStatus`.
- API dang nhap co the tra phone khi nguoi dung da duoc xac thuc neu giao dien can, nhung khong bao gio tra `pinHash` hay `passwordHash`.
- Khong dua model Prisma truc tiep vao `sendJson`.

## 10. Bao mat production

- [ ] `DATABASE_URL` dat tren hosting, khong nam trong source code.
- [ ] Dung SSL cho PostgreSQL production.
- [ ] Password va PIN hash, khong luu plain text.
- [ ] Rate limit Quick Check-in theo employee + IP; dung Redis neu scale ngang.
- [ ] Gioi han CORS dung domain frontend production.
- [ ] Tao backup database hang ngay.
- [ ] Tao tai khoan database co quyen toi thieu can thiet.
- [ ] Xoa tai khoan/PIN demo hoac doi PIN truoc khi mo cho nguoi dung that.
- [ ] Theo doi audit log va loi 401/429 bat thuong.

## 11. Deploy production

Trinh tu deploy an toan:

1. Tao database production va them `DATABASE_URL` vao backend hosting.
2. Deploy backend co Prisma client nhung chua bat buoc dung data moi neu can rollout tung buoc.
3. Chay migration production:

   ```bash
   npx prisma migrate deploy
   ```

4. Chay seed chi khi la database moi:

   ```bash
   npx prisma db seed
   ```

5. Kiem tra health endpoint va Quick Check-in bang tai khoan test.
6. Deploy frontend sau khi backend API on dinh.
7. Theo doi log trong 24 gio dau.

Khong chay `prisma migrate dev` tren production.

## 12. Rollback

- Truoc moi migration, tao database backup/snapshot.
- Migration moi uu tien add truong nullable truoc, backfill sau, roi moi dat bat buoc.
- Neu deploy app loi, rollback backend/frontend ve ban truoc.
- Khong rollback migration bang cach xoa bang tren production.
- Neu can rollback schema, tao migration moi de dao nguoc thay vi sua/xoa migration da deploy.

## 13. Tieu chi hoan thanh

- [ ] Backend khoi dong lai khong mat user, session, log va cai dat.
- [ ] Login va RBAC hoat dong nhu truoc.
- [ ] Quick Check-in/Check-out hoat dong voi database.
- [ ] Mot user khong the co hai ca dang mo.
- [ ] PIN hash khong bi expose trong API hay audit log.
- [ ] Dashboard, log, leave, payroll doc du lieu tu database.
- [ ] `npm run build` thanh cong cho backend va frontend.
- [ ] Migration production chay thanh cong tren database rong.
- [ ] Co backup va quy trinh rollback duoc kiem tra.

## 14. Thu tu commit de thuc hien

```text
1. chore(database): add Prisma and PostgreSQL configuration
2. feat(database): add initial schema and migration
3. feat(seed): add hashed demo accounts and PINs
4. refactor(auth): persist users and authentication
5. refactor(attendance): persist sessions and attendance logs
6. refactor(leave): persist leave workflow and requests
7. refactor(settings): persist settings and notifications
8. refactor(payroll): persist payroll and audit data
9. test(database): add integration tests and deployment checklist
```

## 15. Quyết định cần chốt trước khi bắt đầu

- Chon Supabase, Neon hay Railway cho PostgreSQL.
- Chon noi host backend co bien moi truong va co the chay `prisma migrate deploy`.
- Xac nhan co can giu du lieu demo hay se tao du lieu nhan vien that ngay tu dau.
- Xac nhan co can Redis ngay tu dau hay chi them khi scale nhieu instance backend.