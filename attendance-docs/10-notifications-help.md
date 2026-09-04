# 10. Thông báo và Help Center

## Chức năng thông báo

- Thông báo đơn nghỉ được duyệt/từ chối.
- Thông báo log chấm công bất thường.
- Thông báo sắp hết giờ check-out.
- Thông báo yêu cầu điều chỉnh công.
- Thông báo kỳ công cần xác nhận.

## Kênh thông báo

- In-app notification.
- Email.
- Slack/Teams nếu tích hợp sau.

## Help Center

- Trang câu hỏi thường gặp.
- Hướng dẫn check-in/check-out.
- Hướng dẫn tạo đơn nghỉ.
- Hướng dẫn điều chỉnh công.
- Gửi yêu cầu hỗ trợ.

## Quyền truy cập

- Employee: xem thông báo của mình, gửi yêu cầu hỗ trợ.
- Manager: xem thông báo liên quan đội nhóm.
- HR: xem thông báo HR, xử lý yêu cầu chấm công/nghỉ phép.
- Payroll: xem thông báo liên quan kỳ công.
- Admin: cấu hình mẫu thông báo và danh mục Help Center.

## Đã thực thi

- Thêm model `AppNotification`, `HelpArticle`, `SupportTicket` cho frontend và backend.
- Thêm dữ liệu mẫu đủ nhóm thông báo: nghỉ phép, log bất thường, nhắc check-out, điều chỉnh công, kỳ công và hệ thống.
- Chuông thông báo trên Topbar hiển thị danh sách thông báo theo đúng người nhận/vai trò.
- Dot đỏ chỉ hiện khi còn thông báo chưa đọc.
- Có đánh dấu từng thông báo đã đọc và đánh dấu tất cả đã đọc.
- Có retry email cho thông báo đang lỗi gửi email.
- Backend có API `GET /api/notifications` lọc theo người dùng hiện tại.
- Backend có API `POST /api/notifications/:id/read` và `POST /api/notifications/read-all`.
- Backend có API `POST /api/notifications/:id/retry-email`, chỉ HR/Payroll/Admin được gọi.
- Backend tự sinh notification khi duyệt/từ chối đơn nghỉ, yêu cầu/duyệt/từ chối điều chỉnh công và tạo kỳ công.
- Thêm trang Help Center riêng trong frontend, không còn placeholder.
- Help Center có ô tìm kiếm bài viết theo tiêu đề, nội dung và danh mục.
- Help Center có bài FAQ, hướng dẫn check-in/check-out, tạo đơn nghỉ, điều chỉnh công và kỳ công.
- Help Center lọc bài viết theo quyền truy cập của từng role.
- Có form gửi yêu cầu hỗ trợ, backend lưu ticket và tạo thông báo cho Admin.
- Bổ sung đầy đủ nhãn EN/VI cho notification và Help Center.

## Test đã chạy

- `frontend: npm run build` thành công.
- `backend: npm run build` thành công.
- API notification/help trên cổng test 4025:
  - Employee chỉ lấy được notification của mình.
  - Employee không đọc được notification của Manager.
  - Manager thấy notification điều chỉnh công của đội nhóm.
  - Mark as read hoạt động đúng.
  - Mark all as read hoạt động đúng.
  - Payroll retry email lỗi thành công.
  - Search Help Center với từ khóa `leave` trả về bài phù hợp.
  - Employee gửi support ticket thành công.
  - Admin nhận notification khi có support ticket mới.

## Test cần có

- Tạo notification đúng người nhận.
- Mark as read hoạt động đúng.
- Không xem được notification của người khác.
- Email retry khi gửi lỗi.
- Help Center search đúng bài viết.
