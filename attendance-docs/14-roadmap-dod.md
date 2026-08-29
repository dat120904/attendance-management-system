# 14. Roadmap va Definition of Done

## Giai doan 1: MVP giao dien va luong cham cong co ban

- Hoan thanh layout theo anh: sidebar, header, dashboard, KPI, recent logs.
- Dang nhap/dang xuat.
- Check in/check out ca nhan.
- Luu log cham cong.
- Xem bang log ca nhan.
- Trang thai dung gio/di muon/co nghi phep.
- Phan quyen co ban Employee/Admin.

Tieu chi hoan thanh:

- Nhan vien dang nhap duoc.
- Nhan vien check-in va check-out duoc.
- Dashboard cap nhat dong ho va bang log dung.
- Admin xem duoc log cua tat ca nhan vien.

## Giai doan 2: Nghi phep va quan ly nhom

- Tao don nghi phep.
- Duyet nghi phep theo Manager.
- Tinh so ngay phep con lai.
- Dashboard Manager.
- Loc Attendance Logs theo nhan vien/phong ban.
- Thong bao don nghi phep.

Tieu chi hoan thanh:

- Don nghi phep chay du quy trinh tao, duyet, tu choi, huy.
- Log cham cong hien dung trang thai `On Leave`.
- Manager chi xem du lieu dung pham vi cap duoi.

## Giai doan 3: HR, Payroll va bao cao

- Quan ly nhan vien.
- Cau hinh ca lam, ngay le, quy tac di muon/ve som.
- Tong hop bang cong theo ky.
- Xuat Excel/CSV/PDF.
- Khoa ky cong.
- Audit log cho thay doi nhay cam.

Tieu chi hoan thanh:

- HR cau hinh duoc lich lam va chinh sach.
- Payroll tao duoc ky cong va xuat file.
- Du lieu da khoa khong bi sua tuy tien.

## Giai doan 4: Hoan thien doanh nghiep

- Cham cong theo vi tri/IP/thiet bi.
- Quy trinh dieu chinh cong nhieu buoc.
- Tich hop email/Slack/Teams neu can.
- Dashboard analytics.
- Import/export nhan vien hang loat.
- Bao mat nang cao: 2FA, session timeout, IP allowlist.

Tieu chi hoan thanh:

- He thong dap ung quy trinh cham cong thuc te cua doanh nghiep.
- Co log kiem toan day du.
- Hieu nang on dinh voi du lieu lon.

## Thu tu uu tien trien khai

1. Tao design system co ban: mau, typography, button, input, table, badge, card, sidebar.
2. Xay dashboard theo anh dinh kem.
3. Lam auth va role guard.
4. Lam check-in/check-out va attendance logs ca nhan.
5. Lam leave requests.
6. Lam manager approval.
7. Lam HR employee/settings.
8. Lam payroll summaries va export.
9. Lam audit log va security hardening.
10. Lam test E2E, performance, accessibility va polish UI.

## Definition of Done

- Tat ca trang chinh co UI responsive.
- Tat ca API quan trong co validation va phan quyen.
- Co test unit cho logic tinh cong, nghi phep, phan quyen.
- Co test E2E cho luong Employee, Manager, HR, Payroll, Admin.
- Co audit log cho hanh dong sua/xoa/duyet/khoa ky.
- Co bao cao xuat file dung dinh dang.
- Khong co loi truy cap cheo du lieu giua cac role.
- Dashboard ban dau dat gan dung visual theo anh dinh kem.
