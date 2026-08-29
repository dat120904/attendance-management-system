import type { User } from "../types";
import type { Language, Translation } from "../i18n";
import { BellIcon, LoginIcon } from "./icons";

type TopbarProps = {
  language: Language;
  onLanguageChange: (language: Language) => void;
  user: User;
  onLogout: () => void;
  t: Translation;
};

export function Topbar({ language, onLanguageChange, user, onLogout, t }: TopbarProps) {
  return (
    <header className="topbar">
      <button className="menu-button" type="button" aria-label={t.openMenu}>
        <span />
        <span />
        <span />
      </button>
      <h2>{t.dashboard}</h2>
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
        <button className="icon-button app-grid" type="button" aria-label={t.applications}>
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </button>
        <button className="checkin-button" type="button">
          <LoginIcon />
          {t.checkIn}
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
