# 09. Cấu hình hệ thống

## Chức năng

- Cấu hình giờ làm việc tiêu chuẩn.
- Cấu hình ca làm việc.
- Cấu hình quy tắc đi muộn, về sớm, tăng ca.
- Cấu hình ngày lễ.
- Cấu hình số ngày phép năm.
- Cấu hình phân quyền.
- Cấu hình thông báo.
- Cấu hình bảo mật.
- Cấu hình tích hợp.

## Nhóm cấu hình

- Attendance policies.
- Leave policies.
- Work schedules.
- Holidays.
- Roles and permissions.
- Notification channels.
- Payroll export format.
- Security settings.
- Audit settings.

## Quyền truy cập

- Employee: thông tin cá nhân, ngôn ngữ, mật khẩu, thông báo.
- Manager: thiết lập thông báo đội nhóm nếu được cấp quyền.
- HR: chính sách chấm công, nghỉ phép, ngày lễ.
- Payroll: quy tắc kỳ lương, định dạng xuất file.
- Admin: vai trò, quyền, tích hợp, bảo mật, audit.

## Đã thực thi

- Tạo trang Cài đặt riêng trong frontend React và nối vào menu sidebar.
- Chia tab cấu hình: chính sách chấm công, chính sách nghỉ phép, ca làm việc, ngày lễ, vai trò và quyền, thông báo, xuất lương, bảo mật, tích hợp, audit.
- Thêm form chỉnh giờ vào/ra chuẩn, phút cho phép đi muộn/về sớm, ngưỡng tăng ca và bắt buộc vị trí chấm công.
- Thêm form cấu hình phép năm mặc định, bắt buộc tài liệu nghỉ ốm, yêu cầu HR duyệt và chặn nghỉ phép vượt số dư.
- Thêm danh sách ca làm việc, có thể thêm ca mới và chỉnh ngày làm việc.
- Thêm danh sách ngày lễ, có thể thêm ngày lễ mới và đánh dấu ngày lễ có lương.
- Thêm cấu hình quyền theo từng role bằng danh sách permission.
- Thêm cấu hình thông báo trong app, email, tổng hợp nhóm cho quản lý và nhắc kỳ lương.
- Thêm cấu hình định dạng xuất lương mặc định Excel/PDF, kèm cảnh báo khi xuất và quy tắc chỉ khóa kỳ khi đã xử lý log.
- Thêm cấu hình bảo mật: độ dài mật khẩu tối thiểu, thời gian hết phiên, tự đăng ký và xác thực hai lớp.
- Thêm cấu hình tích hợp lịch, provider tính lương và webhook.
- Thêm cấu hình audit: bật/tắt audit và số ngày lưu audit.
- Backend có API `GET /api/settings` và `PUT /api/settings`.
- Backend kiểm tra phân quyền khi sửa từng nhóm settings.
- Khi sửa leave policy, backend đồng bộ sang leave workflow hiện có.
- Ngày lễ trong settings được loại khỏi ngày công chuẩn khi tổng hợp lương.
- Quy tắc khóa kỳ lương đọc từ settings: nếu bật, kỳ còn warning sẽ không khóa được.
- Security settings được dùng cho độ dài mật khẩu đăng ký và thời gian hết phiên đăng nhập.
- Mỗi lần cập nhật settings hợp lệ sinh audit log `settings.updated`.

## Test đã chạy

- `frontend: npm run build` thành công.
- `backend: npm run build` thành công.
- API settings trên cổng test 4024:
  - Admin đọc settings thành công.
  - Employee sửa security bị chặn 403.
  - HR sửa leave policy thành công.
  - Payroll sửa payroll export format thành công.
  - Holiday sai dữ liệu bị chặn 400.
  - Audit log có bản ghi `settings.updated`.

## Test cần có

- Chính sách chấm công mới áp dụng đúng.
- Ngày lễ mới ảnh hưởng đúng đến tính công.
- Thay đổi role cập nhật quyền truy cập.
- Người không có quyền không sửa được settings.
- Mọi thay đổi quan trọng có audit log.
