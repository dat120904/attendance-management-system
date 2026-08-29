import { useEffect, useMemo, useState } from "react";
import { dashboardData } from "../data/mockData";
import type { Translation } from "../i18n";
import type { DashboardMetric, User } from "../types";
import { formatDuration } from "../utils/time";
import { ClockIcon, HolidayIcon, LeaveIcon, LogoutIcon, WarningIcon } from "./icons";

type DashboardProps = {
  user: User;
  t: Translation;
};

export function Dashboard({ user, t }: DashboardProps) {
  const [seconds, setSeconds] = useState(dashboardData.sessionSeconds);

  useEffect(() => {
    const interval = window.setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const metrics = useMemo<DashboardMetric[]>(() => {
    const base: DashboardMetric[] = [
      {
        label: t.hoursThisWeek,
        value: `${dashboardData.weeklyHours}`,
        suffix: `/ ${dashboardData.weeklyTarget}h`,
        progress: Math.round((dashboardData.weeklyHours / dashboardData.weeklyTarget) * 100),
        icon: "clock"
      },
      {
        label: t.remainingLeave,
        value: `${user.remainingLeaveDays}`,
        suffix: t.days,
        icon: "leave"
      },
      {
        label: t.nextHoliday,
        value: t.thanksgiving,
        helper: t.holidayDate,
        icon: "holiday"
      }
    ];

    if (user.role === "Manager" || user.role === "HR" || user.role === "Admin") {
      base.push({
        label: t.teamAlerts,
        value: `${dashboardData.managerAlerts.length}`,
        suffix: t.open,
        helper: t.teamAlertsText,
        icon: "warning"
      });
    }

    if (user.role === "Payroll" || user.role === "Admin") {
      base.push({
        label: t.payrollReadiness,
        value: dashboardData.payrollReadiness,
        helper: t.currentPayrollPeriod,
        icon: "clock"
      });
    }

    return base;
  }, [t, user]);

  return (
    <>
      <section className="content-grid" aria-label={t.dashboard}>
        <article className="hero-card">
          <div>
            <h3>
              {t.goodMorning}, {user.name}.
            </h3>
            <p>{t.dashboardSummary}</p>
          </div>

          <div className="session-card">
            <div className="session-copy">
              <span>{t.currentSession}</span>
              <strong>{formatDuration(seconds)}</strong>
              <p>{t.checkedInAt}</p>
            </div>
            <button className="checkout-button" type="button">
              <LogoutIcon />
              {t.checkOut}
            </button>
          </div>
        </article>

        <aside className="stats-column" aria-label={t.quickStats}>
          {metrics.map((metric) => (
            <article className="stat-card" key={metric.label}>
              <div className="stat-label">
                <MetricIcon icon={metric.icon} />
                {metric.label}
              </div>
              {metric.icon === "holiday" ? (
                <>
                  <h4>{metric.value}</h4>
                  <p>{metric.helper}</p>
                </>
              ) : (
                <>
                  <p>
                    <strong>{metric.value}</strong> {metric.suffix}
                  </p>
                  {metric.helper && <small>{metric.helper}</small>}
                </>
              )}
              {typeof metric.progress === "number" && (
                <div className="progress" aria-label={`${metric.progress}%`}>
                  <span style={{ width: `${metric.progress}%` }} />
                </div>
              )}
            </article>
          ))}
        </aside>
      </section>

      <section className="logs-card" aria-label={t.recentLogs}>
        <div className="section-header">
          <h3>{t.recentLogs}</h3>
          <a href="#">{t.viewAll}</a>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t.date}</th>
                <th>{t.checkInColumn}</th>
                <th>{t.checkOutColumn}</th>
                <th>{t.totalHours}</th>
                <th>{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {dashboardData.logs.map((log) => (
                <tr key={log.id}>
                  <td data-label={t.date}>{log.date}</td>
                  <td data-label={t.checkInColumn}>{log.checkIn}</td>
                  <td data-label={t.checkOutColumn}>{log.checkOut}</td>
                  <td data-label={t.totalHours}>{log.totalHours}</td>
                  <td data-label={t.status}>
                    <span className={`badge ${statusClassName(log.status)}`}>{translateStatus(log.status, t)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function MetricIcon({ icon }: { icon: DashboardMetric["icon"] }) {
  if (icon === "clock") return <ClockIcon />;
  if (icon === "leave") return <LeaveIcon />;
  if (icon === "warning") return <WarningIcon />;
  return <HolidayIcon />;
}

function statusClassName(status: string) {
  if (status === "On Time") return "success";
  if (status === "Late") return "warning";
  return "muted";
}

function translateStatus(status: string, t: Translation) {
  if (status === "On Time") return t.onTime;
  if (status === "Late") return t.late;
  return t.onLeave;
}
