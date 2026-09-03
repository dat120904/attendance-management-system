# 08. Quản lý nhân viên

## Phạm vi đã thực hiện

Trang Quản lý nhân viên đã được triển khai cho frontend React và backend TypeScript.

## Chức năng đã có

- Danh sách nhân viên theo phân quyền.
- Tìm kiếm nhân viên theo mã, họ tên, email, phòng ban hoặc chức danh.
- Xem hồ sơ nhân viên.
- Tạo nhân viên mới bằng HR/Admin.
- Sửa hồ sơ nhân viên bằng HR/Admin.
- Khóa/mở khóa tài khoản bằng HR/Admin.
- Tài khoản bị khóa không đăng nhập được.
- Gán phòng ban.
- Gán chức danh.
- Gán quản lý trực tiếp.
- Gán lịch làm việc.
- Gán chính sách chấm công.
- Gán chính sách nghỉ phép.
- Xem lịch sử chấm công của từng nhân viên.
- Import nhân viên hàng loạt bằng dữ liệu CSV dạng: `name,email,role,department,position`.
- Validate lỗi từng dòng khi import.
- Export danh sách nhân viên dạng Excel/PDF.

## Dữ liệu hồ sơ nhân viên

- Mã nhân viên.
- Họ tên.
- Email.
- Số điện thoại.
- Phòng ban.
- Chức danh.
- Quản lý trực tiếp.
- Ngày vào làm.
- Trạng thái làm việc: đang làm, đã khóa, ngừng làm.
- Lịch làm việc.
- Chính sách chấm công.
- Chính sách nghỉ phép.
- Số ngày phép còn lại.

## Phân quyền

- Employee: không được truy cập trang quản lý nhân viên.
- Manager: chỉ xem nhân viên thuộc đội nhóm mình và bản thân.
- HR: xem toàn bộ, tạo/sửa/khóa/import/export nhân viên.
- Payroll: xem thông tin nhân viên phục vụ tính công/kỳ lương, không sửa/khóa.
- Admin: toàn quyền.

## API backend

- `GET /api/employees`: lấy danh sách nhân viên theo quyền.
- `POST /api/employees`: HR/Admin tạo nhân viên.
- `PUT /api/employees/:id`: HR/Admin cập nhật hồ sơ.
- `POST /api/employees/:id/lock`: HR/Admin khóa hoặc mở khóa tài khoản.
- `POST /api/employees/import`: HR/Admin import hàng loạt.
- `GET /api/employees/export?format=excel|pdf`: export danh sách nhân viên.

## Test đã chạy

- Frontend build thành công bằng `npm.cmd run build`.
- Backend build thành công bằng `npm.cmd run build`.
- Employee gọi `GET /api/employees` trả `403`.
- Manager gọi `GET /api/employees` trả `200` và chỉ thấy bản thân + nhân viên thuộc team.
- Payroll gọi `GET /api/employees` trả `200`, không thấy Admin.
- Payroll tạo nhân viên trả `403`.
- HR xem toàn bộ danh sách nhân viên trả `200`.
- HR tạo nhân viên mới trả `201`.
- HR sửa phòng ban, chức danh, lịch làm việc, chính sách chấm công và chính sách nghỉ phép trả `200`.
- HR khóa tài khoản trả `200`.
- Tài khoản đã khóa đăng nhập trả `423`.
- Admin mở khóa tài khoản trả `200`.
- Tài khoản sau khi mở khóa đăng nhập lại trả `200`.
- Admin import dòng lỗi trả `400` và có danh sách lỗi từng dòng.
- Admin import dòng hợp lệ trả `201`.
- Admin export Excel trả file `application/vnd.ms-excel`.
- Admin export PDF trả file `application/pdf`.
- Lịch sử chấm công theo nhân viên lấy được từ `/api/attendance/logs` trả `200`.

## Ghi chú production

Hiện dữ liệu vẫn lưu in-memory theo kiến trúc demo của dự án. Khi lên production cần thay bằng database, audit log bền vững, phân quyền server-side chi tiết hơn và import file thật thay vì textarea CSV.
