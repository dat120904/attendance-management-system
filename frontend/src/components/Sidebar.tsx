import type { AppPage, User } from "../types";
import type { Translation } from "../i18n";
import {
  BuildingIcon,
  GridIcon,
  CalendarIcon,
  CalendarCheckIcon,
  PayrollIcon,
  UsersIcon,
  SettingsIcon,
  HelpIcon,
  LogoutIcon
} from "./icons";
import { translateDepartment } from "../utils/localize";
import { canAccessPage } from "../utils/permissions";

type NavItemConfig = {
  page: AppPage;
  icon: (props: { className?: string }) => React.JSX.Element;
};

const navItems: NavItemConfig[] = [
  { page: "dashboard", icon: GridIcon },
  { page: "attendanceLogs", icon: CalendarIcon },
  { page: "leaveRequests", icon: CalendarCheckIcon },
  { page: "payrollSummaries", icon: PayrollIcon },
  { page: "employeeManagement", icon: UsersIcon },
  { page: "settings", icon: SettingsIcon }
];

type UtilityItemConfig = {
  key: "helpCenter" | "logout";
  icon: (props: { className?: string }) => React.JSX.Element;
};

const utilityItems: UtilityItemConfig[] = [
  { key: "helpCenter", icon: HelpIcon },
  { key: "logout", icon: LogoutIcon }
];

type SidebarProps = {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  onLogout: () => void;
  user: User;
  t: Translation;
  isOpen: boolean;
  isCollapsed?: boolean;
  onClose: () => void;
  onToggleCollapse?: () => void;
};

export function Sidebar({ activePage, onLogout, onNavigate, user, t, isOpen, onClose }: SidebarProps) {
  const navigate = (page: AppPage) => { onNavigate(page); onClose(); };
  const visibleNavItems = navItems.filter((item) => canAccessPage(user.role, item.page));

  return (
    <aside id="main-navigation" className={`sidebar ${isOpen ? "is-open" : ""}`} aria-label="Main navigation">
      <div className="brand">
        <div className="brand-mark">
          <BuildingIcon />
        </div>
        <div className="brand-text">
          <h1>Workforce Pro</h1>
          <p>{translateDepartment(user.subtitle, t)}</p>
        </div>
        <button
          className="sidebar-mobile-close"
          type="button"
          aria-label={t.close}
          title={t.close}
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <nav className="main-nav">
        {visibleNavItems.map(({ page, icon: Icon }) => (
          <button
            className={`nav-item ${activePage === page ? "active" : ""}`}
            type="button"
            aria-current={activePage === page ? "page" : undefined}
            key={page}
            onClick={() => navigate(page)}
          >
            <span className="nav-icon-wrap" aria-hidden="true">
              <Icon className="sidebar-svg-icon" />
            </span>
            {t[page]}
          </button>
        ))}
      </nav>

      <nav className="utility-nav" aria-label="Utility navigation">
        {utilityItems.map(({ key, icon: Icon }) => (
          <button
            className={`nav-item ${activePage === key ? "active" : ""}`}
            type="button"
            key={key}
            onClick={key === "logout" ? onLogout : () => navigate(key)}
          >
            <span className="nav-icon-wrap" aria-hidden="true">
              <Icon className="sidebar-svg-icon" />
            </span>
            {t[key]}
          </button>
        ))}
      </nav>
    </aside>
  );
}
