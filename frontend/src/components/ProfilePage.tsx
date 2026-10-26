import { FormEvent, useState } from "react";
import { changePassword } from "../api";
import type { Translation } from "../i18n";
import type { User } from "../types";
import { translateDepartment, translateRole } from "../utils/localize";

type ProfilePageProps = { authToken: string; t: Translation; user: User };

export function ProfilePage({ authToken, t, user }: ProfilePageProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);

  // 2FA State
  const [is2FAEnabled, setIs2FAEnabled] = useState(user.role === "Admin" || user.role === "HR");
  const [securityNotice, setSecurityNotice] = useState("");

  // Active Sessions
  const [sessions, setSessions] = useState([
    {
      id: "sess-1",
      device: "Google Chrome 122 (Windows 11 Pro)",
      ip: "113.161.72.45",
      location: "TP. Hồ Chí Minh, VN",
      isCurrent: true,
      lastActive: "Đang hoạt động"
    },
    {
      id: "sess-2",
      device: "Workforce Mobile App (iOS 17.4)",
      ip: "14.169.12.10",
      location: "Hà Nội, VN",
      isCurrent: false,
      lastActive: "2 giờ trước"
    }
  ]);

  const permissionTags = getPermissionTags(user.role);
  const employeeCode = user.employeeCode || (user.id.startsWith("u-") ? user.id.replace("u-", "").toUpperCase() : user.id.slice(0, 7).toUpperCase());

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 6) {
      setIsError(true);
      setNotice(t.passwordMinLength);
      return;
    }
    if (newPassword !== confirmPassword) {
      setIsError(true);
      setNotice(t.passwordMismatch);
      return;
    }
    setIsSubmitting(true);
    setNotice("");
    setIsError(false);
    try {
      await changePassword(authToken, currentPassword, newPassword, confirmPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice(t.passwordChanged);
    } catch (error) {
      setIsError(true);
      setNotice(error instanceof Error ? error.message : t.changePasswordFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleToggle2FA() {
    const nextState = !is2FAEnabled;
    setIs2FAEnabled(nextState);
    setSecurityNotice(nextState ? "Đã kích hoạt Xác thực 2 bước (2FA)." : "Đã hủy kích hoạt Xác thực 2 bước (2FA).");
    window.setTimeout(() => setSecurityNotice(""), 4000);
  }

  function handleLogoutOtherSessions() {
    setSessions((current) => current.filter((s) => s.isCurrent));
    setSecurityNotice(t.otherSessionsLoggedOut);
    window.setTimeout(() => setSecurityNotice(""), 4000);
  }

  return (
    <section className="profile-page page-stack">
      <div className="page-heading">
        <div>
          <h3>{t.myProfile}</h3>
          <p>{t.profilePreview}</p>
        </div>
      </div>

      {securityNotice && <div className="attendance-toast success" role="status">{securityNotice}</div>}

      <div className="profile-redesign-layout">
        {/* LEFT COLUMN: Identity & Role Card */}
        <aside className="profile-identity-card">
          <div className="identity-avatar-wrap">
            <div className="profile-avatar-large">{user.name.charAt(0)}</div>
            <span className="online-indicator-dot" title="Online" />
          </div>

          <h4 className="identity-name">{user.name}</h4>
          <p className="identity-email">{user.email}</p>

          <div className="identity-badges-row">
            <span className="role-pill-badge">{translateRole(user.role, t)}</span>
            <span className="code-pill-badge">{employeeCode}</span>
          </div>

          <hr className="identity-divider" />

          {/* Permissions Tags */}
          <div className="permissions-section">
            <span className="section-small-title">{t.permissionsScope}</span>
            <div className="permission-tags-grid">
              {permissionTags.map((tag) => (
                <span className="permission-tag" key={tag}>
                  ✓ {tag}
                </span>
              ))}
            </div>
          </div>

          <hr className="identity-divider" />

          {/* Quick Meta */}
          <div className="identity-meta-list">
            <div className="meta-row">
              <span className="meta-label">{t.department}</span>
              <strong className="meta-val">{translateDepartment(user.subtitle, t)}</strong>
            </div>
            <div className="meta-row">
              <span className="meta-label">Trạng thái</span>
              <strong className="meta-val text-success">Đang hoạt động</strong>
            </div>
            <div className="meta-row">
              <span className="meta-label">Ngày gia nhập</span>
              <strong className="meta-val">15/01/2024</strong>
            </div>
          </div>
        </aside>

        {/* RIGHT COLUMN: Details & Security */}
        <div className="profile-main-content">
          {/* Card 1: Static Read-only Account Information */}
          <section className="profile-card profile-details-card">
            <div className="card-header-clean">
              <h4>{t.accountInformation}</h4>
              <span className="card-badge-readonly">Chế độ chỉ đọc</span>
            </div>

            <div className="static-info-grid">
              <div className="static-info-item">
                <span className="info-label">{t.fullName}</span>
                <span className="info-value">{user.name}</span>
              </div>
              <div className="static-info-item">
                <span className="info-label">{t.email}</span>
                <span className="info-value info-value-code">{user.email}</span>
              </div>
              <div className="static-info-item">
                <span className="info-label">{t.role}</span>
                <span className="info-value">{translateRole(user.role, t)}</span>
              </div>
              <div className="static-info-item">
                <span className="info-label">{t.department}</span>
                <span className="info-value">{translateDepartment(user.subtitle, t)}</span>
              </div>
              <div className="static-info-item">
                <span className="info-label">Mã nhân viên</span>
                <span className="info-value info-value-code">{employeeCode}</span>
              </div>
              <div className="static-info-item">
                <span className="info-label">Quản lý trực tiếp</span>
                <span className="info-value">{user.role === "Admin" ? "Ban Điều Hành (Executive)" : "Nguyễn Văn Quản Lý"}</span>
              </div>
            </div>
          </section>

          {/* Card 2: Advanced Security & 2FA */}
          <section className="profile-card profile-security-card">
            <div className="card-header-clean">
              <h4>{t.advancedSecurity}</h4>
            </div>

            {/* 2FA Section */}
            <div className="two-factor-box">
              <div className="two-factor-info">
                <div className="two-factor-title-row">
                  <strong>{t.twoFactorAuth}</strong>
                  <span className={`status-pill ${is2FAEnabled ? "pill-success" : "pill-muted"}`}>
                    {is2FAEnabled ? t.twoFactorEnabled : t.twoFactorDisabled}
                  </span>
                </div>
                <p className="two-factor-desc">{t.twoFactorHint}</p>
              </div>
              <button
                type="button"
                className={`two-factor-btn ${is2FAEnabled ? "btn-active" : ""}`}
                onClick={handleToggle2FA}
              >
                {is2FAEnabled ? "Tắt 2FA" : "Bật 2FA"}
              </button>
            </div>

            <hr className="card-inner-divider" />

            {/* Password Change Form */}
            <div className="password-change-section">
              <h5>{t.changePassword}</h5>
              <form className="profile-password-form" onSubmit={handlePasswordChange}>
                <div className="profile-fields-grid">
                  <label className="field-group">
                    <span className="field-label">{t.currentPassword}</span>
                    <input
                      type="password"
                      className="form-input"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </label>
                  <label className="field-group">
                    <span className="field-label">{t.newPassword}</span>
                    <input
                      type="password"
                      className="form-input"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </label>
                  <label className="field-group">
                    <span className="field-label">{t.confirmPassword}</span>
                    <input
                      type="password"
                      className="form-input"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </label>
                </div>
                {notice && (
                  <p className={`form-message auth-form-message ${isError ? "error" : "success"}`} role="status">
                    {notice}
                  </p>
                )}
                <div className="form-submit-row">
                  <button className="primary-button btn-save-pwd" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? t.savingChanges : t.savePassword}
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* Card 3: Active Device Sessions */}
          <section className="profile-card profile-sessions-card">
            <div className="card-header-clean">
              <div>
                <h4>{t.activeSessions}</h4>
                <p className="section-subheader">Danh sách thiết bị và vị trí IP đã được cấp quyền đăng nhập.</p>
              </div>
              {sessions.length > 1 && (
                <button
                  type="button"
                  className="btn-outline-danger"
                  onClick={handleLogoutOtherSessions}
                >
                  {t.logoutOtherDevices}
                </button>
              )}
            </div>

            <div className="sessions-list">
              {sessions.map((sess) => (
                <div className={`session-device-item ${sess.isCurrent ? "current-session" : ""}`} key={sess.id}>
                  <div className="device-icon-box">
                    {sess.device.includes("Mobile") ? "📱" : "💻"}
                  </div>
                  <div className="device-info-main">
                    <div className="device-name-row">
                      <strong>{sess.device}</strong>
                      {sess.isCurrent && <span className="current-device-tag">{t.currentDevice}</span>}
                    </div>
                    <span className="device-subtext">
                      IP: {sess.ip} · {sess.location} · {sess.lastActive}
                    </span>
                  </div>
                  {!sess.isCurrent && (
                    <button
                      type="button"
                      className="btn-text-danger"
                      onClick={() => setSessions((curr) => curr.filter((s) => s.id !== sess.id))}
                    >
                      Đăng xuất
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function getPermissionTags(role: User["role"]) {
  if (role === "Admin") {
    return [
      "Super Administrator",
      "Quản trị Hệ thống",
      "Duyệt Đơn nghỉ phép",
      "Điều chỉnh Chấm công",
      "Quản lý Bảng lương",
      "Quản lý Nhân sự & Phân quyền"
    ];
  }
  if (role === "HR") {
    return [
      "Quản trị Nhân sự",
      "Duyệt Đơn nghỉ phép",
      "Theo dõi Chấm công Toàn cty",
      "Cập nhật Hồ sơ Nhân viên"
    ];
  }
  if (role === "Manager") {
    return [
      "Quản lý Phòng ban",
      "Duyệt Đơn nghỉ Cấp dưới",
      "Duyệt Điều chỉnh Công"
    ];
  }
  if (role === "Payroll") {
    return [
      "Chuyên viên Tính lương",
      "Chốt Kỳ chấm công",
      "Xuất Dữ liệu Bảng lương"
    ];
  }
  return [
    "Nhân viên Tiêu chuẩn",
    "Chấm công Hàng ngày",
    "Tạo Đơn nghỉ phép",
    "Yêu cầu Điều chỉnh công"
  ];
}