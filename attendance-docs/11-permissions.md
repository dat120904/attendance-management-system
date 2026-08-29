# 11. Phan quyen

## Vai tro mac dinh

- Employee
- Manager
- HR
- Payroll
- Admin

## Bang phan quyen tong quan

| Chuc nang / Trang | Employee | Manager | HR | Payroll | Admin |
| --- | --- | --- | --- | --- | --- |
| Dashboard ca nhan | Xem | Xem | Xem | Xem | Xem |
| Dashboard phong ban | Khong | Xem doi nhom minh | Xem toan cong ty | Xem tong hop | Xem toan cong ty |
| Check in / Check out | Tao cua minh | Tao cua minh | Tao cua minh | Tao cua minh | Tao cua minh |
| Attendance Logs ca nhan | Xem | Xem | Xem | Xem | Xem |
| Attendance Logs nhan vien | Khong | Xem doi nhom minh | Xem/sua toan cong ty | Xem toan cong ty | Xem/sua toan cong ty |
| Yeu cau dieu chinh cong | Tao cua minh | Tao va duyet cap duoi | Duyet/xu ly | Xem | Toan quyen |
| Leave Requests ca nhan | Tao/xem/huy | Tao/xem/huy | Tao/xem/huy | Tao/xem/huy | Tao/xem/huy |
| Duyet nghi phep | Khong | Duyet cap duoi | Duyet buoc HR | Khong | Toan quyen |
| Payroll Summaries | Khong | Xem doi nhom minh | Xem/xac nhan | Tao/xuat/khoa ky | Toan quyen |
| Quan ly nhan vien | Khong | Xem doi nhom minh | Tao/sua thong tin HR | Xem thong tin luong cong | Toan quyen |
| Cau hinh he thong | Khong | Khong | Cau hinh cham cong/nghi phep | Cau hinh payroll | Toan quyen |
| Bao cao va xuat file | Ca nhan | Doi nhom minh | Toan cong ty | Payroll | Toan quyen |
| Audit log | Khong | Khong | Xem | Xem | Xem/toan quyen |

## Nguyen tac kiem tra quyen

- Moi API can kiem tra authentication.
- Moi API du lieu nhan vien can kiem tra data scope.
- Employee chi thao tac du lieu cua minh.
- Manager chi thao tac du lieu cap duoi duoc gan.
- HR co quyen nghiep vu nhan su nhung khong mac dinh toan quyen he thong.
- Payroll chi can quyen tinh cong va xuat bao cao.
- Admin quan ly role, permission, policy va audit.

## Test can co

- Test role guard cho tung route.
- Test API guard cho tung endpoint.
- Test IDOR voi `employeeId`, `departmentId`, `payrollPeriodId`.
- Test data scope Manager.
- Test hanh dong Admin co audit log.
