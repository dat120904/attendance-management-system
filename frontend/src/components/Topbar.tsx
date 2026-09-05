import { useState } from "react";
import type { AppNotification, AppPage, AttendanceSession, User } from "../types";
import type { Language, Translation } from "../i18n";
import { BellIcon, LoginIcon } from "./icons";

type TopbarProps = {
  attendanceSession: AttendanceSession;
  activePage: AppPage;
  isAttendanceBusy: boolean;
  language: Language;
  notifications: AppNotification[];
  onLanguageChange: (language: Language) => void;
  onAttendanceAction: () => void;
  onMarkNotificationRead: (notificationId: string) => void;
  onMarkAllNotificationsRead: () => void;
  onRetryNotificationEmail: (notificationId: string) => void;
  onOpenProfile: () => void;
  onMenuClick: () => void;
  user: User;
  onLogout: () => void;
  t: Translation;
};

export function Topbar({ activePage, attendanceSession, isAttendanceBusy, language, notifications, onAttendanceAction, onLanguageChange, onMarkAllNotificationsRead, onMarkNotificationRead, onRetryNotificationEmail, onOpenProfile, onMenuClick, user, onLogout, t }: TopbarProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const isWorking = attendanceSession.status === "working";
  const actionLabel = isAttendanceBusy ? (isWorking ? t.checkingOut : t.checkingIn) : isWorking ? t.checkOut : t.checkIn;
  const unreadCount = notifications.filter((item) => !item.read).length;

  return (
    <header className="topbar">
      <button className="menu-button" type="button" aria-label={t.openMenu} aria-controls="main-navigation" onClick={onMenuClick}>
        <span />
        <span />
        <span />
      </button>
      <h2>{t[activePage]}</h2>
      <div className="top-actions">
        <div className="language-switch" aria-label={t.language}>
          <button className={language === "en" ? "active" : ""} type="button" onClick={() => onLanguageChange("en")}>{t.english}</button>
          <button className={language === "vi" ? "active" : ""} type="button" onClick={() => onLanguageChange("vi")}>{t.vietnamese}</button>
        </div>
        <div className="notification-menu-wrap">
          <button className={`icon-button notification-trigger ${isNotificationsOpen ? "active" : ""}`} type="button" aria-label={t.notifications} aria-expanded={isNotificationsOpen} onClick={() => { setIsNotificationsOpen((current) => !current); setIsAccountOpen(false); }}>
            <BellIcon />
            {unreadCount > 0 && <span className="notification-dot" aria-hidden="true" />}
          </button>
          {isNotificationsOpen && (
            <div className="notification-dropdown" role="menu" aria-label={t.notifications}>
              <div className="notification-dropdown-head">
                <strong>{t.notifications}</strong>
                <button type="button" onClick={onMarkAllNotificationsRead}>{t.markAllRead}</button>
              </div>
              <div className="notification-list">
                {notifications.length === 0 && <p className="empty-state">{t.noNotifications}</p>}
                {notifications.slice(0, 8).map((notification) => (
                  <article className={`notification-item ${notification.read ? "" : "unread"}`} key={notification.id}>
                    <div className="notification-item-head">
                      <strong>{translateNotificationTitle(notification, t, user.name)}</strong>
                      <span>{translateCategory(notification.category, t)}</span>
                    </div>
                    <p>{translateNotificationMessage(notification, t, user.name)}</p>
                    <div className="notification-meta">
                      <small>{new Date(notification.createdAt).toLocaleString()}</small>
                      <small>{translateEmailStatus(notification.emailStatus, t)}</small>
                    </div>
                    <div className="notification-actions">
                      {!notification.read && <button type="button" onClick={() => onMarkNotificationRead(notification.id)}>{t.markAllRead}</button>}
                      {notification.emailStatus === "Failed" && <button type="button" onClick={() => onRetryNotificationEmail(notification.id)}>{t.retryEmail}</button>}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
        <button className="checkin-button" type="button" onClick={onAttendanceAction} disabled={isAttendanceBusy}>
          <LoginIcon />
          {actionLabel}
        </button>
        <div className="account-menu-wrap">
          <button className="avatar" type="button" aria-label={`${user.name} ${t.accountMenu}`} aria-expanded={isAccountOpen} onClick={() => { setIsAccountOpen((current) => !current); setIsNotificationsOpen(false); }}>
            <span aria-hidden="true">{user.name.charAt(0)}</span>
          </button>
          {isAccountOpen && (
            <div className="account-dropdown">
              <button type="button" onClick={() => { onOpenProfile(); setIsAccountOpen(false); }}>{t.profile}</button>
              <button type="button" onClick={onLogout}>{t.logout}</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function translateCategory(category: AppNotification["category"], t: Translation) {
  if (category === "leave") return t.leaveNotification;
  if (category === "attendance") return t.attendanceNotification;
  if (category === "checkout") return t.checkoutNotification;
  if (category === "adjustment") return t.adjustmentNotification;
  if (category === "payroll") return t.payrollNotification;
  return t.systemNotification;
}

function translateEmailStatus(status: AppNotification["emailStatus"], t: Translation) {
  if (status === "Sent") return t.emailSent;
  if (status === "Failed") return t.emailFailed;
  return t.emailNotSent;
}

function translateNotificationTitle(notification: AppNotification, t: Translation, name: string) {
  if (notification.id === "notif-welcome") return t.welcomeNotificationTitle;
  return notification.title.replace("Welcome back", t.welcomeNotificationTitle).replace("Leave request approved", t.leaveApproved).replace("Attendance exception", t.attendanceExceptions).replace("Check-out reminder", t.confirmCheckOut).replace("Attendance adjustment requested", t.requestAdjustment).replace("Payroll period needs confirmation", t.currentPayrollPeriod).replace("New support request", t.supportRequest).replace("{name}", name);
}

function translateNotificationMessage(notification: AppNotification, t: Translation, name: string) {
  if (notification.id === "notif-welcome") return t.welcomeNotificationBody.replace("{name}", name);
  return notification.message.replace("Your Workforce Pro workspace is ready.", t.welcomeNotificationBody.replace("{name}", name)).replace("Your annual leave request was approved.", t.leaveApproved).replace("Linh has an early leave log pending review.", `${t.earlyLeave}: Linh`).replace("Your workday is nearly complete. Remember to check out.", t.confirmCheckOut).replace("A team member requested attendance adjustment approval.", t.adjustmentRequested).replace("Current payroll period has items waiting for confirmation.", t.pendingAdjustmentWarningTemplate.replace("{count}", "2"));
}
