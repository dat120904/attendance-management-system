import { useState } from "react";
import type { AppPage, User } from "../types";
import type { Language, Translation } from "../i18n";
import type { AttendanceSession } from "../types";
import { BellIcon, LoginIcon } from "./icons";

type TopbarProps = {
  attendanceSession: AttendanceSession;
  activePage: AppPage;
  isAttendanceBusy: boolean;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onAttendanceAction: () => void;
  onOpenProfile: () => void;
  user: User;
  onLogout: () => void;
  t: Translation;
};

export function Topbar({ activePage, attendanceSession, isAttendanceBusy, language, onAttendanceAction, onLanguageChange, onOpenProfile, user, onLogout, t }: TopbarProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isWelcomeRead, setIsWelcomeRead] = useState(false);
  const isWorking = attendanceSession.status === "working";
  const actionLabel = isAttendanceBusy ? (isWorking ? t.checkingOut : t.checkingIn) : isWorking ? t.checkOut : t.checkIn;

  return (
    <header className="topbar">
      <button className="menu-button" type="button" aria-label={t.openMenu}>
        <span />
        <span />
        <span />
      </button>
      <h2>{t[activePage]}</h2>
      <div className="top-actions">
        <div className="language-switch" aria-label={t.language}>
          <button className={language === "en" ? "active" : ""} type="button" onClick={() => onLanguageChange("en")}>
            {t.english}
          </button>
          <button className={language === "vi" ? "active" : ""} type="button" onClick={() => onLanguageChange("vi")}>
            {t.vietnamese}
          </button>
        </div>
        <div className="notification-menu-wrap">
          <button
            className={`icon-button notification-trigger ${isNotificationsOpen ? "active" : ""}`}
            type="button"
            aria-label={t.notifications}
            aria-expanded={isNotificationsOpen}
            onClick={() => {
              setIsNotificationsOpen((current) => !current);
              setIsAccountOpen(false);
            }}
          >
            <BellIcon />
            {!isWelcomeRead && <span className="notification-dot" aria-hidden="true" />}
          </button>
          {isNotificationsOpen && (
            <div className="notification-dropdown" role="menu" aria-label={t.notifications}>
              <div className="notification-dropdown-head">
                <strong>{t.notifications}</strong>
                <button type="button" onClick={() => setIsWelcomeRead(true)}>{t.markAllRead}</button>
              </div>
              <article className={`notification-item ${isWelcomeRead ? "" : "unread"}`}>
                <strong>{t.welcomeNotificationTitle}</strong>
                <p>{t.welcomeNotificationBody.replace("{name}", user.name)}</p>
                <small>{t.justNow}</small>
              </article>
            </div>
          )}
        </div>
        <button className="checkin-button" type="button" onClick={onAttendanceAction} disabled={isAttendanceBusy}>
          <LoginIcon />
          {actionLabel}
        </button>
        <div className="account-menu-wrap">
          <button
            className="avatar"
            type="button"
            aria-label={`${user.name} ${t.accountMenu}`}
            aria-expanded={isAccountOpen}
            onClick={() => {
              setIsAccountOpen((current) => !current);
              setIsNotificationsOpen(false);
            }}
          >
            <span aria-hidden="true">{user.name.charAt(0)}</span>
          </button>
          {isAccountOpen && (
            <div className="account-dropdown">
              <button
                type="button"
                onClick={() => {
                  onOpenProfile();
                  setIsAccountOpen(false);
                }}
              >
                {t.profile}
              </button>
              <button type="button" onClick={onLogout}>
                {t.logout}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
