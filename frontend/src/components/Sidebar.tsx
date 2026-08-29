import type { User } from "../types";
import type { Translation } from "../i18n";
import { BuildingIcon } from "./icons";

const navItems = [
  ["dashboard", "grid-icon"],
  ["attendanceLogs", "calendar-icon"],
  ["leaveRequests", "leave-nav-icon"],
  ["payrollSummaries", "payroll-icon"],
  ["settings", "settings-icon"]
] as const;

const utilityItems = [
  ["helpCenter", "help-icon"],
  ["logout", "logout-icon"]
] as const;

type SidebarProps = {
  user: User;
  t: Translation;
};

export function Sidebar({ user, t }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="brand">
        <div className="brand-mark">
          <BuildingIcon />
        </div>
        <div>
          <h1>Workforce Pro</h1>
          <p>{user.subtitle}</p>
        </div>
      </div>

      <nav className="main-nav">
        {navItems.map(([label, icon], index) => (
          <a className={`nav-item ${index === 0 ? "active" : ""}`} href="#" aria-current={index === 0 ? "page" : undefined} key={label}>
            <span className={`nav-icon ${icon}`} aria-hidden="true" />
            {t[label]}
          </a>
        ))}
      </nav>

      <nav className="utility-nav" aria-label="Utility navigation">
        {utilityItems.map(([label, icon]) => (
          <a className="nav-item" href="#" key={label}>
            <span className={`nav-icon ${icon}`} aria-hidden="true" />
            {t[label]}
          </a>
        ))}
      </nav>
    </aside>
  );
}
