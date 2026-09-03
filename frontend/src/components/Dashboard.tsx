import { useEffect, useMemo, useState } from "react";
import { dashboardData } from "../data/mockData";
import type { Translation } from "../i18n";
import { translateRole } from "../utils/localize";
import type { AttendanceLog, AttendanceSession, DashboardMetric, User } from "../types";
import { addDays, formatClockTime, formatDuration, formatHolidayRange, formatSummaryDate } from "../utils/time";
import { ClockIcon, HolidayIcon, LeaveIcon, LoginIcon, LogoutIcon, WarningIcon } from "./icons";

type DashboardProps = {
  attendanceError: string;
  attendanceMessage: string;
  attendanceSession: AttendanceSession;
  isAttendanceBusy: boolean;
  logs: AttendanceLog[];
  onCheckIn: () => void;
  onCheckOut: () => void;
  user: User;
  t: Translation;
};

export function Dashboard({
  attendanceError,
  attendanceMessage,
  attendanceSession,
  isAttendanceBusy,
  logs,
  onCheckIn,
  onCheckOut,
  user,
  t
}: DashboardProps) {
  const [seconds, setSeconds] = useState(attendanceSession.elapsedSeconds);
  const locale = t.language === "Ngôn ngữ" ? "vi-VN" : "en-US";
  const today = useMemo(() => new Date(), []);
  const holidayStartDate = useMemo(() => new Date(dashboardData.nextHoliday.dateRange), []);
  const holidayEndDate = useMemo(() => addDays(holidayStartDate, 1), [holidayStartDate]);
  const summaryDate = formatSummaryDate(today, locale);
  const holidayDateRange = formatHolidayRange(holidayStartDate, holidayEndDate, locale);
  const greeting = getGreeting(today, t);

  useEffect(() => {
    setSeconds(attendanceSession.elapsedSeconds);
  }, [attendanceSession.elapsedSeconds, attendanceSession.status]);

  useEffect(() => {
    if (attendanceSession.status !== "working") return;
    const interval = window.setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(interval);
  }, [attendanceSession.status]);

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
        helper: t.holidayDate.replace("{date}", holidayDateRange),
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
  }, [holidayDateRange, t, user]);

  const roleOverview = getRoleOverview(user.role, t);
  const actionCards = getActionCards(user.role, t);
  const isWorking = attendanceSession.status === "working";
  const sessionAction = isWorking ? onCheckOut : onCheckIn;
  const sessionActionLabel = isAttendanceBusy ? (isWorking ? t.checkingOut : t.checkingIn) : isWorking ? t.checkOut : t.checkIn;
  const sessionStatusLabel = getSessionStatusLabel(attendanceSession.status, t);
  const checkedInLabel = attendanceSession.checkInAt ? `${t.checkedInAtPrefix} ${formatClockTime(attendanceSession.checkInAt)}` : t.readyToStart;

  return (
    <>
      <section className="content-grid" aria-label={t.dashboard}>
        <article className="hero-card">
          <div>
            <h3>
              {greeting}, {user.name}.
            </h3>
            <p>{t.dashboardSummary.replace("{date}", summaryDate)}</p>
          </div>

          <div className="session-card">
            <div className="session-copy">
              <span>{t.currentSession}</span>
              <strong>{isWorking || attendanceSession.status === "checked-out" ? formatDuration(seconds) : "00:00:00"}</strong>
              <p>{checkedInLabel}</p>
              <div className="session-meta">
                <span className={`session-status ${attendanceSession.status}`}>{sessionStatusLabel}</span>
                <small>{t.device}: {attendanceSession.device}</small>
                <small>{t.ipAddress}: {attendanceSession.ipAddress}</small>
                <small>{t.location}: {attendanceSession.location}</small>
              </div>
            </div>
            <button className="checkout-button" type="button" onClick={sessionAction} disabled={isAttendanceBusy}>
              {isWorking ? <LogoutIcon /> : <LoginIcon />}
              {sessionActionLabel}
            </button>
          </div>
          {(attendanceMessage || attendanceError) && (
            <div className={`attendance-toast ${attendanceError ? "error" : "success"}`} role="status">
              {attendanceError || attendanceMessage}
            </div>
          )}
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

      <section className="dashboard-panels" aria-label={t.roleOverview}>
        <article className="overview-card">
          <div>
            <span>{t.roleOverview}</span>
            <h3>{roleOverview.title}</h3>
            <p>{roleOverview.description}</p>
          </div>
          <strong>{translateRole(user.role, t)}</strong>
        </article>

        <div className="action-grid">
          {actionCards.map((card) => (
            <article className="action-card" key={card.label}>
              <div className="action-card-top">
                <span>{card.label}</span>
                <MetricIcon icon={card.icon} />
              </div>
              <p>
                <strong>{card.value}</strong> {card.suffix}
              </p>
              <a href="#">{t.reviewNow}</a>
            </article>
          ))}
        </div>
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
              {logs.map((log) => (
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
  if (status === "Missing Check-out") return t.missingSession;
  return t.onLeave;
}

function getSessionStatusLabel(status: AttendanceSession["status"], t: Translation) {
  if (status === "working") return t.working;
  if (status === "checked-out") return t.checkedOut;
  if (status === "missing") return t.missingSession;
  return t.notStarted;
}

function getGreeting(date: Date, t: Translation) {
  const hour = date.getHours();

  if (hour < 12) return t.goodMorning;
  if (hour < 18) return t.goodAfternoon;
  return t.goodEvening;
}

function getRoleOverview(role: User["role"], t: Translation) {
  if (role === "Manager") {
    return {
      title: t.managerDashboard,
      description: t.dashboardScopeManager
    };
  }

  if (role === "HR") {
    return {
      title: t.hrDashboard,
      description: t.dashboardScopeHr
    };
  }

  if (role === "Payroll") {
    return {
      title: t.payrollDashboard,
      description: t.dashboardScopePayroll
    };
  }

  if (role === "Admin") {
    return {
      title: t.adminDashboard,
      description: t.dashboardScopeAdmin
    };
  }

  return {
    title: t.personalDashboard,
    description: t.dashboardScopeEmployee
  };
}

function getActionCards(role: User["role"], t: Translation): DashboardMetric[] {
  const personalCards: DashboardMetric[] = [
    {
      label: t.upcomingLeave,
      value: "2",
      suffix: t.days,
      icon: "leave"
    },
    {
      label: t.attendanceExceptions,
      value: "1",
      suffix: t.items,
      icon: "warning"
    }
  ];

  if (role === "Employee") {
    return personalCards;
  }

  if (role === "Manager") {
    return [
      {
        label: t.pendingLeaveRequests,
        value: "6",
        suffix: t.requests,
        icon: "leave"
      },
      {
        label: t.lateArrivals,
        value: "3",
        suffix: t.people,
        icon: "warning"
      },
      {
        label: t.missingCheckOut,
        value: "1",
        suffix: t.items,
        icon: "clock"
      }
    ];
  }

  if (role === "Payroll") {
    return [
      {
        label: t.payrollReadiness,
        value: "92%",
        suffix: t.ready,
        icon: "clock"
      },
      {
        label: t.attendanceExceptions,
        value: "8",
        suffix: t.items,
        icon: "warning"
      },
      {
        label: t.overtimeAlerts,
        value: "4",
        suffix: t.items,
        icon: "clock"
      }
    ];
  }

  return [
    {
      label: t.pendingLeaveRequests,
      value: "18",
      suffix: t.requests,
      icon: "leave"
    },
    {
      label: t.attendanceExceptions,
      value: "12",
      suffix: t.items,
      icon: "warning"
    },
    {
      label: t.missingCheckOut,
      value: "5",
      suffix: t.items,
      icon: "clock"
    },
    {
      label: t.overtimeAlerts,
      value: "7",
      suffix: t.items,
      icon: "clock"
    }
  ];
}
