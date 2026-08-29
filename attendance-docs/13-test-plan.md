# 13. Ke hoach test

## Unit test

- Tinh tong gio lam.
- Tinh trang thai di muon/ve som.
- Tinh so ngay phep con lai.
- Validate trung lap check-in.
- Validate check-out khi chua check-in.
- Validate phan quyen theo role.
- Tinh gio tang ca.
- Xu ly ngay le va cuoi tuan.

## Integration test

- Dang nhap -> check-in -> dashboard cap nhat -> check-out -> log duoc tao.
- Tao don nghi -> manager duyet -> HR xac nhan -> cap nhat leave balance.
- Sua log cham cong -> tao audit log -> cap nhat payroll summary.
- Tao ky cong -> tong hop du lieu -> khoa ky -> xuat file.
- Nguoi dung khong co quyen truy cap API bi chan.

## End-to-end test

- Employee hoan thanh mot ngay cong binh thuong.
- Employee di muon va thay trang thai `Late`.
- Employee xin nghi phep va xem ket qua.
- Manager duyet don nghi cua nhan vien.
- HR sua log cham cong co ly do.
- Payroll xuat bang cong thang.
- Admin tao role va gan quyen.

## UI/UX test

- Dashboard dung voi desktop, tablet, mobile.
- Sidebar active state dung.
- Nut `Check In` va `Check Out` doi trang thai dung.
- Dong ho current session chay lien tuc.
- Bang log khong vo layout khi noi dung dai.
- Mau trang thai de doc va dat tuong phan.
- Loading, empty state, error state day du.

## Security test

- Khong xem duoc log cua nguoi khac neu khong co quyen.
- Khong sua duoc log da khoa ky.
- API bat buoc xac thuc.
- Kiem tra IDOR voi employeeId, departmentId, payrollPeriodId.
- Kiem tra CSRF neu dung cookie session.
- Kiem tra rate limit cho dang nhap va check-in.
- Kiem tra audit log cho thay doi quan trong.

## Performance test

- Tai dashboard duoi 2 giay voi du lieu trung binh.
- Loc bang cong thang voi 10.000 ban ghi.
- Xuat file payroll voi du lieu lon.
- Kiem tra dong thoi nhieu nguoi check-in dau gio.

## Acceptance test theo vai tro

- Employee: chi thay va thao tac du lieu cua minh.
- Manager: chi thay nhan vien thuoc doi nhom duoc gan.
- HR: quan ly cham cong va nghi phep toan cong ty.
- Payroll: chi thao tac payroll va bao cao can thiet.
- Admin: toan quyen va xem audit.
