import { useEffect, useMemo, useState } from "react";
import type { Language, Translation } from "../i18n";
import { translateRole } from "../utils/localize";
import type { AppPage, AttendanceLog, AttendanceSession, DashboardMetric, SystemSettings, User } from "../types";
import { formatAttendanceTime, formatClockTime, formatDuration, formatSummaryDate, formatWorkDate } from "../utils/time";
import { ClockIcon, LeaveIcon, LoginIcon, LogoutIcon, WarningIcon } from "./icons";

type DashboardProps = {
  attendanceError: string;
  attendanceMessage: string;
  attendanceSession: AttendanceSession;
  isAttendanceBusy: boolean;
  language: Language;
  logs: AttendanceLog[];
  managerAlerts: string[];
  payrollReadiness: string | null;
  settings: SystemSettings;
  onCheckIn: () => void;
  onCheckOut: () => void;
  user: User;
  t: Translation;
  onNavigate: (page: AppPage) => void;
};

export function Dashboard({
  attendanceError,
  attendanceMessage,
  attendanceSession,
  isAttendanceBusy,
  language,
  logs,
  managerAlerts,
  payrollReadiness,
  settings,
  onCheckIn,
  onCheckOut,
  user,
  t,
  onNavigate
}: DashboardProps) {
  const [seconds, setSeconds] = useState(attendanceSession.elapsedSeconds);
  const [isPayrollIssuesOpen, setIsPayrollIssuesOpen] = useState(false);
  const locale = language === "vi" ? "vi-VN" : "en-US";
  const today = useMemo(() => new Date(), []);
  const summaryDate = formatSummaryDate(today, locale);
  const greeting = getGreeting(today, t);
  const schedule = settings.workSchedules[0];
  const scheduleLabel = schedule ? formatSchedule(schedule) : "";
  const hasSessionMetadata = Boolean(attendanceSession.checkInAt && (attendanceSession.device || attendanceSession.ipAddress || attendanceSession.location));
  const recentLogs = logs.filter((log) => log.employeeId === user.id).slice(0, 5);

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
        label: t.yourRemainingLeave,
        value: `${user.remainingLeaveDays}`,
        suffix: t.days,
        icon: "leave"
      }
    ];

    if (user.role === "Manager" || user.role === "HR" || user.role === "Admin") {
      base.push({
        label: t.teamAlerts,
        value: `${managerAlerts.length}`,
        suffix: t.open,
        helper: t.teamAlertsText,
        icon: "warning"
      });
    }

    if (user.role === "Payroll" || user.role === "Admin") {
      base.push({
        label: t.payrollReadiness,
        value: payrollReadiness ?? "--",
        helper: t.currentPayrollPeriod,
        icon: "clock"
      });
    }

    return base;
  }, [managerAlerts.length, payrollReadiness, t, user]);

  const roleOverview = getRoleOverview(user.role, t);
  const payrollIssues = getPayrollIssues(logs, t);
  const actionCards = getActionCards(user.role, t, payrollIssues);
  const isWorking = attendanceSession.status === "working";
  const sessionAction = isWorking ? onCheckOut : onCheckIn;
  const sessionActionLabel = isAttendanceBusy ? (isWorking ? t.checkingOut : t.checkingIn) : isWorking ? t.checkOut : t.checkIn;
  const sessionStatusLabel = getSessionStatusLabel(attendanceSession.status, t);
  const checkedInLabel = attendanceSession.checkInAt ? `${t.checkedInAtPrefix} ${formatClockTime(attendanceSession.checkInAt, locale)}` : "";
  const checkInReminder = !isWorking ? getCheckInReminder(today, schedule, language, t) : "";

  return (
    <>
      <section className="content-grid" aria-label={t.dashboard}>
        <article className="hero-card">
          <div className="dashboard-hero-heading">
            <div className="dashboard-intro">
              <span className="dashboard-date-label">{t.todayDate}: {summaryDate}</span>
              <h3>
                {greeting}, {user.name}.
              </h3>
            </div>

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
          </div>

          <div className="session-card">
            <div className="session-copy">
              <span>{t.currentSession}</span>
              <strong>{isWorking || attendanceSession.status === "checked-out" ? formatDuration(seconds) : "00:00:00"}</strong>
              {checkedInLabel && <p>{checkedInLabel}</p>}

              {checkInReminder && <p className="session-reminder">{checkInReminder}</p>}
              <div className="session-meta">
                <span className={`session-status ${attendanceSession.status}`}>{sessionStatusLabel}</span>
                {hasSessionMetadata && <>
                  {attendanceSession.device && <small>{t.device}: {attendanceSession.device}</small>}
                  {attendanceSession.ipAddress && <small>{t.ipAddress}: {attendanceSession.ipAddress}</small>}
                  {attendanceSession.location && <small>{t.location}: {attendanceSession.location}</small>}
                </>}
              </div>
            </div>
            {scheduleLabel && (
              <div className="session-schedule">
                <span>{t.standardWorkSchedule}</span>
                <strong>{scheduleLabel}</strong>
              </div>
            )}
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

      </section>

      <section className={`dashboard-panels dashboard-panels-${user.role.toLowerCase()}`} aria-label={t.roleOverview}>
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
            <article className={`action-card ${getActionCardPriority(card.label, user.role, t)}`} key={card.label}>
              <div className="action-card-top">
                <span>{card.label}</span>
                <MetricIcon icon={card.icon} />
              </div>
              <p>
                <strong>{card.value}</strong> {card.suffix}
              </p>
              {card.helper && <small>{card.helper}</small>}
              {card.label === t.payrollReadiness && payrollIssues.length > 0 && isPayrollIssuesOpen && <ul className="action-issue-list">
                {payrollIssues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>}
              {card.label === t.payrollReadiness ? <div className="action-card-links">
                {payrollIssues.length > 0 && <button className="action-link" type="button" onClick={() => setIsPayrollIssuesOpen((current) => !current)}>{isPayrollIssuesOpen ? t.hideMissingItems : t.viewMissingItems}</button>}
                <button className="action-link secondary" type="button" onClick={() => onNavigate("payrollSummaries")}>{t.openPayrollSummary}</button>
              </div> : <button className="action-link" type="button" onClick={() => onNavigate(getActionPage(card.label, t))}>{t.reviewNow}</button>}
            </article>
          ))}
        </div>
      </section>

      <section className="logs-card" aria-label={t.recentLogs}>
        <div className="section-header">
          <h3>{t.recentLogs}</h3>
          <button className="action-link" type="button" onClick={() => onNavigate("attendanceLogs")}>{t.viewAll}</button>
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
              {recentLogs.map((log) => (
                <tr key={log.id}>
                  <td data-label={t.date}>{formatWorkDate(log.workDate, locale)}</td>
                  <td data-label={t.checkInColumn}>{formatAttendanceTime(log.checkIn, locale)}</td>
                  <td data-label={t.checkOutColumn}>{formatAttendanceTime(log.checkOut, locale)}</td>
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

function getActionPage(label: string, t: Translation): AppPage {
  if (label === t.upcomingLeave || label === t.pendingLeaveRequests) return "leaveRequests";
  if (label === t.payrollReadiness) return "payrollSummaries";
  return "attendanceLogs";
}

function MetricIcon({ icon }: { icon: DashboardMetric["icon"] }) {
  if (icon === "clock") return <ClockIcon />;
  if (icon === "leave") return <LeaveIcon />;
  if (icon === "warning") return <WarningIcon />;
  return <LeaveIcon />;
}

function getActionCardPriority(label: string, role: User["role"], t: Translation) {
  if (role !== "HR") return "";
  if (label === t.pendingLeaveRequests || label === t.attendanceExceptions) return "urgent";
  return "attention";
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

function getActionCards(role: User["role"], t: Translation, payrollIssues: string[]): DashboardMetric[] {
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
        value: `${Math.max(0, 100 - payrollIssues.length * 4)}%`,
        suffix: t.ready,
        helper: payrollIssues.length > 0 ? t.payrollReadinessDetail.replace("{count}", `${payrollIssues.length}`) : t.payrollAllResolved,
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

function getPayrollIssues(logs: AttendanceLog[], t: Translation) {
  return logs
    .filter((log) => log.status === "Missing Check-out" || log.adjustmentStatus === "Pending")
    .map((log) => `${log.employeeName}: ${log.status === "Missing Check-out" ? t.missingCheckOut : t.pendingAdjustment}`);
}

function formatSchedule(schedule: SystemSettings["workSchedules"][number]) {
  return `${schedule.startTime}-${schedule.morningEndTime} · ${schedule.afternoonStartTime}-${schedule.endTime}`;
}

function getCheckInReminder(now: Date, schedule: SystemSettings["workSchedules"][number] | undefined, language: Language, t: Translation) {
  if (!schedule || !schedule.workDays.includes(now.getDay())) return "";
  const [hours, minutes] = schedule.startTime.split(":").map(Number);
  const remainingMinutes = hours * 60 + minutes - (now.getHours() * 60 + now.getMinutes());
  if (remainingMinutes <= 0) return "";
  const remainingHours = Math.floor(remainingMinutes / 60);
  const remainingMins = remainingMinutes % 60;
  const duration = language === "vi"
    ? `${remainingHours ? `${remainingHours} giờ ` : ""}${remainingMins} phút`
    : `${remainingHours ? `${remainingHours} hour${remainingHours === 1 ? "" : "s"} ` : ""}${remainingMins} minute${remainingMins === 1 ? "" : "s"}`;
  return t.checkInAvailableIn.replace("{time}", duration.trim());
}
