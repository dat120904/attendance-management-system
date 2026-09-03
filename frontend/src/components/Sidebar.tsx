import type { AppPage, User } from "../types";
import type { Translation } from "../i18n";
import { BuildingIcon } from "./icons";
import { translateDepartment } from "../utils/localize";

const navItems = [
  ["dashboard", "grid-icon"],
  ["attendanceLogs", "calendar-icon"],
  ["leaveRequests", "leave-nav-icon"],
  ["payrollSummaries", "payroll-icon"],
  ["employeeManagement", "employee-nav-icon"],
  ["settings", "settings-icon"]
] as const;

const utilityItems = [
  ["helpCenter", "help-icon"],
  ["logout", "logout-icon"]
] as const;

type SidebarProps = {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  onLogout: () => void;
  user: User;
  t: Translation;
};

export function Sidebar({ activePage, onLogout, onNavigate, user, t }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand">
        <div className="brand-mark">
          <BuildingIcon />
        </div>
        <div>
          <h1>Workforce Pro</h1>
          <p>{translateDepartment(user.subtitle, t)}</p>
        </div>
      </div>

      <nav className="main-nav">
        {navItems.map(([label, icon]) => (
          <button className={`nav-item ${activePage === label ? "active" : ""}`} type="button" aria-current={activePage === label ? "page" : undefined} key={label} onClick={() => onNavigate(label)}>
            <span className={`nav-icon ${icon}`} aria-hidden="true" />
            {t[label]}
          </button>
        ))}
      </nav>

      <nav className="utility-nav" aria-label="Utility navigation">
        {utilityItems.map(([label, icon]) => (
          <button className={`nav-item ${activePage === label ? "active" : ""}`} type="button" key={label} onClick={label === "logout" ? onLogout : () => onNavigate(label)}>
            <span className={`nav-icon ${icon}`} aria-hidden="true" />
            {t[label]}
          </button>
        ))}
      </nav>
    </aside>
  );
}
