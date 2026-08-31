# 05. Attendance Logs

## Chuc nang

- Danh sach log theo ngay, tuan, thang.
- Loc theo trang thai: dung gio, di muon, ve som, nghi phep, thieu du lieu.
- Tim kiem theo nhan vien, phong ban.
- Xem chi tiet mot ngay cong.
- Xuat Excel/PDF.
- Tao yeu cau dieu chinh cong.
- Duyet/tu choi yeu cau dieu chinh theo quyen.

## Cot du lieu de xuat

- Date.
- Employee.
- Department.
- Check-in.
- Check-out.
- Total hours.
- Overtime.
- Status.
- Adjustment status.

## Trang thai

- `On Time`
- `Late`
- `Early Leave`
- `On Leave`
- `Missing Check-out`
- `Holiday`
- `Weekend`
- `Adjusted`

## Quyen truy cap

- Employee: chi xem log cua minh va tao yeu cau dieu chinh.
- Manager: xem log cap duoi truc tiep va duyet/tu choi dieu chinh cap quan ly.
- HR: xem, sua co ly do, phe duyet dieu chinh buoc cuoi.
- Payroll: xem va xuat du lieu da khoa cho ky luong.
- Admin: toan quyen, bao gom phuc hoi ban ghi neu co.

## Backend API da can co

- `GET /api/attendance/logs`: lay danh sach log theo quyen, `dateRange`, `status`, `query`.
- `GET /api/attendance/export`: xuat file theo bo loc hien tai voi `format=excel|pdf`.
- `POST /api/attendance/logs/:id/adjustment`: tao yeu cau dieu chinh cong.
- `POST /api/attendance/logs/:id/approve`: duyet yeu cau dieu chinh.
- `POST /api/attendance/logs/:id/reject`: tu choi yeu cau dieu chinh.
- `GET /api/audit-logs`: xem lich su thao tac theo quyen duoc phep.

## Frontend da can co

- Trang Attendance Logs goi API backend khi dang nhap co token.
- Neu backend chua chay, trang van fallback ve du lieu demo de khong bi trang rong.
- Export tu UI uu tien goi API backend de tai dung file theo bo loc hien tai.
- Tao/duyet/tu choi dieu chinh tren UI uu tien goi API backend va refresh lai audit log.

## Test can co

- Loc theo ngay/tuan/thang dung.
- Tim kiem theo nhan vien dung.
- Employee khong xem duoc log nguoi khac.
- Yeu cau dieu chinh tao audit log.
- Log da khoa ky khong sua tuy tien.
- Export dung bo loc hien tai.

## Ket qua kiem tra hien tai

- Frontend build thanh cong bang `npm run build`.
- Backend build thanh cong bang `npm run build`.
- Admin lay duoc log theo tuan.
- Manager chi thay log cua minh/cap duoi va duyet duoc log cap duoi.
- Log da khoa ky luong tra ve loi `409` khi yeu cau dieu chinh.
- PDF export tra ve file bat dau bang `%PDF-1.4`.
