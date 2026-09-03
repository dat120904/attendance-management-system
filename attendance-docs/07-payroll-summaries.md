# 07. Payroll Summaries

## Chuc nang

- Tong hop cong theo ky luong.
- Tao ky cong/khoang ngay tinh cong.
- Tinh tong gio lam, gio tang ca, gio nghi phep co luong, gio nghi khong luong, gio thieu.
- Tinh so lan di muon, ve som, log thieu/chua xu ly.
- Canh bao du lieu thieu truoc khi khoa ky.
- HR/Payroll/Admin co the tinh lai va xac nhan ky cong.
- Payroll/Admin khoa bang cong sau khi xac nhan.
- Admin co the mo khoa ky khi can.
- Ky da khoa se khoa Attendance Logs trong khoang ngay cua ky.
- Xuat bao cao Excel/PDF cho he thong tinh luong.
- Luu lich su phien ban bang cong sau moi thao tac tao, tinh lai, xac nhan, khoa, mo khoa.

## Chi so da tinh

- Standard hours.
- Worked hours.
- Overtime hours.
- Paid leave hours.
- Unpaid leave hours.
- Missing hours.
- Late count.
- Early leave count.
- Missing log count.
- Total payable hours.
- Payroll status: `Draft`, `Confirmed`, `Locked`.

## Quyen truy cap

- Employee: khong truy cap mac dinh.
- Manager: xem tong hop doi nhom de doi chieu.
- HR: xem toan cong ty, tinh lai va xac nhan cong/nghi phep/tang ca.
- Payroll: tao ky, tinh lai, xac nhan, khoa ky, xuat file.
- Admin: tao ky, cau hinh/can thiep, khoa va mo khoa ky khi can.

## Backend API da co

- `GET /api/payroll/periods`: lay danh sach ky cong theo quyen.
- `POST /api/payroll/periods`: Payroll/Admin tao ky cong.
- `POST /api/payroll/periods/:id/recalculate`: tinh lai bang cong neu ky chua khoa.
- `POST /api/payroll/periods/:id/confirm`: xac nhan ky cong.
- `POST /api/payroll/periods/:id/lock`: khoa ky neu khong con canh bao bat buoc.
- `POST /api/payroll/periods/:id/unlock`: Admin mo khoa ky.
- `GET /api/payroll/periods/:id/export?format=excel|pdf`: xuat bao cao.
- Moi thao tac quan trong ghi audit log.

## Frontend da co

- Trang Payroll Summaries trong sidebar da mo trang that, khong con placeholder.
- Form tao ky cong cho Payroll/Admin.
- Danh sach ky cong va trang thai ky.
- Bang tong hop chi so theo nhan vien.
- The tong chi so toan ky.
- Panel canh bao du lieu thieu.
- Panel lich su phien ban.
- Nut tinh lai, xac nhan, khoa, mo khoa theo quyen.
- Nut xuat Excel/PDF.
- Neu co token, frontend goi API backend; neu backend chua chay, fallback ve du lieu demo/local.

## Test can co

- Tao ky cong thanh cong.
- Tong hop gio lam dung.
- Tinh nghi phep co luong/khong luong dung.
- Khong khoa ky neu con log thieu bat buoc xu ly.
- Ky da khoa khong bi sua attendance log tuy tien.
- Export dung format.
- Manager chi xem du lieu doi nhom.
- Employee bi chan truy cap mac dinh.
- Admin mo khoa ky thanh cong.

## Ket qua kiem tra hien tai

- Frontend build thanh cong bang `npm run build`.
- Backend build thanh cong bang `npm run build`.
- Da co API va UI cho tao ky, tinh lai, xac nhan, khoa, mo khoa, export, canh bao va version history.
