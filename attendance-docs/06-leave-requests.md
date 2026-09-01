# 06. Leave Requests

## Chuc nang

- Tao don xin nghi.
- Luu don nhap va gui don nhap vao quy trinh duyet.
- Chon loai nghi: phep nam, nghi om, nghi khong luong, nghi bu.
- Kiem tra so ngay phep con lai.
- Dinh kem tai lieu: frontend gui `multipart/form-data`, backend luu file that trong `backend/uploads/leave-attachments/` va don nghi chi luu metadata/URL tai file.
- Luong phe duyet theo quan ly truc tiep va HR.
- Admin cau hinh quy trinh duyet: bat/tat HR duyet cuoi, chan vuot so du phep, cho phep huy truoc buoc quan ly, bat buoc dinh kem khi nghi om, so ngay phep nam mac dinh.
- Huy don neu con duoc phep huy.
- Dong bo trang thai nghi vao Attendance Logs theo tung ngay nghi.

## Trang thai don

- `Draft`
- `Pending Manager`
- `Pending HR`
- `Approved`
- `Rejected`
- `Cancelled`

## Luong phe duyet

1. Employee tao don hoac luu nhap.
2. Khi gui don, he thong kiem tra so du phep, ngay hop le, tai lieu bat buoc va trung lich.
3. Manager duyet hoac tu choi don cua cap duoi truc tiep.
4. Neu cau hinh yeu cau, HR duyet buoc cuoi.
5. He thong tru phep nam va cap nhat so du phep khi don duoc duyet cuoi.
6. Attendance Logs hien `On Leave` cho tung ngay nghi duoc duyet.

## Quyen truy cap

- Employee: tao, luu nhap, gui nhap, xem trang thai, huy neu chua vao qua buoc quan ly.
- Manager: duyet hoac tu choi don cua cap duoi.
- HR: kiem tra quy phep, duyet HR, cap nhat so du phep khi duyet cuoi.
- Payroll: xem don da duyet de tinh cong, khong tao don trong man hinh payroll.
- Admin: can thiep duyet/huy va cau hinh quy trinh.

## Backend API da co

- `GET /api/leave-workflow`: lay cau hinh quy trinh hien tai.
- `PUT /api/leave-workflow`: Admin cap nhat cau hinh quy trinh.
- `GET /api/leave-requests`: lay danh sach don theo quyen nguoi dung.
- `POST /api/leave-requests`: tao don nghi hoac luu nhap bang JSON hoac `multipart/form-data`; kiem tra so du phep, ngay hop le, tai lieu bat buoc, trung lich khi gui.
- `POST /api/leave-requests/:id/submit`: gui don nhap vao quy trinh duyet.
- `GET /api/leave-attachments/:storageKey`: tai file dinh kem sau khi backend kiem tra quyen xem don.
- `POST /api/leave-requests/:id/cancel`: huy don neu con duoc phep huy.
- `POST /api/leave-requests/:id/approve`: duyet don theo buoc Manager, HR hoac Admin.
- `POST /api/leave-requests/:id/reject`: tu choi don theo quyen duyet.
- Khi duyet buoc cuoi, backend tao Attendance Logs voi trang thai `On Leave`.
- Moi thao tac tao, luu nhap, gui nhap, huy, duyet, tu choi, cap nhat workflow ghi audit log.

## Frontend da co

- Trang Leave Requests trong sidebar da mo trang that, khong con placeholder.
- Form tao don gom loai nghi, ngay bat dau, ngay ket thuc, ly do, file dinh kem.
- Nut `Luu nhap` va hanh dong `Gui nhap` trong chi tiet don.
- Hien so ngay xin nghi va so du phep con lai sau don.
- Bang danh sach don nghi theo phan quyen.
- Khung chi tiet don nghi va hanh dong huy, gui nhap, duyet, tu choi theo quyen.
- Panel cau hinh workflow chi hien voi Admin.
- Neu co token, frontend goi API backend; neu backend chua chay, fallback ve du lieu demo.

## Test can co

- Tao don nghi thanh cong.
- Luu nhap thanh cong va gui nhap sang `Pending Manager`.
- Khong tao/gui duoc don vuot so du phep neu cau hinh dang chan.
- Manager chi duyet duoc don cap duoi.
- HR cap nhat leave balance dung.
- Don bi tu choi khong tru phep.
- Don da duyet hien tren Attendance Logs.
- Admin cap nhat workflow thanh cong.
- Payroll chi xem don da duyet.

## Ket qua kiem tra hien tai

- Frontend build thanh cong bang `npm run build`.
- Backend build thanh cong bang `npm run build`.
- Da co UI/API cho `Draft`, gui nhap, workflow Admin va upload attachment vao storage local.
- Da co dong bo Attendance Logs theo tung ngay nghi khi duyet cuoi.
