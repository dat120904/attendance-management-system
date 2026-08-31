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
  user: User;
  onLogout: () => void;
  t: Translation;
};

export function Topbar({ activePage, attendanceSession, isAttendanceBusy, language, onAttendanceAction, onLanguageChange, user, onLogout, t }: TopbarProps) {
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
        <button className="icon-button" type="button" aria-label={t.notifications}>
          <BellIcon />
        </button>
        <button className="checkin-button" type="button" onClick={onAttendanceAction} disabled={isAttendanceBusy}>
          <LoginIcon />
          {actionLabel}
        </button>
        <button className="avatar" type="button" aria-label={`${user.name} ${t.accountMenu}`}>
          <span aria-hidden="true">{user.name.charAt(0)}</span>
        </button>
        <button className="text-button" type="button" onClick={onLogout}>
          {t.logout}
        </button>
      </div>
    </header>
  );
}
