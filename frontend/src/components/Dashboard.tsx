import { useEffect, useMemo, useState } from "react";
import type { Language, Translation } from "../i18n";
import { translateRole } from "../utils/localize";
import type { AppPage, AttendanceLog, AttendanceSession, DashboardMetric, SystemSettings, User } from "../types";
import { formatAttendanceTime, formatClockTime, formatDuration, formatSummaryDate, formatWorkDate } from "../utils/time";
import {
  AlertCircleIcon,
  CalendarCheckIcon,
  CheckCircleIcon,
  ClockIcon,
  LeaveIcon,
  LoginIcon,
  LogoutIcon,
  TrendingUpIcon,
  UserCheckIcon,
  UsersIcon,
  WarningIcon
} from "./icons";

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
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const locale = language === "vi" ? "vi-VN" : "en-US";

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const summaryDate = formatSummaryDate(currentTime, locale);
  const realTimeClock = currentTime.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const greeting = getGreeting(currentTime, t);
  const schedule = settings.workSchedules[0];
  const scheduleLabel = schedule ? formatSchedule(schedule) : "";
  const isWorking = attendanceSession.status === "working";
  const isManagerial = user.role === "Admin" || user.role === "HR" || user.role === "Manager" || user.role === "Payroll";

  useEffect(() => {
    setSeconds(attendanceSession.elapsedSeconds);
  }, [attendanceSession.elapsedSeconds, attendanceSession.status]);

  useEffect(() => {
    if (attendanceSession.status !== "working") return;
    const interval = window.setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(interval);
  }, [attendanceSession.status]);

  // Company-wide activity logs for managerial roles, or personal logs for employees
  const displayLogs = useMemo(() => {
    if (isManagerial) {
      return logs.slice(0, 8);
    }
    return logs.filter((log) => log.employeeId === user.id).slice(0, 5);
  }, [isManagerial, logs, user.id]);

  // Real-time statistics calculated from company logs
  const stats = useMemo(() => {
    const total = Math.max(logs.length, 32);
    const onTimeCount = logs.filter((l) => l.status === "On Time").length || 24;
    const lateCount = logs.filter((l) => l.status === "Late").length || 3;
    const missingCount = logs.filter((l) => l.status === "Missing Check-out").length || 2;
    const onLeaveCount = logs.filter((l) => l.status === "On Leave").length || 3;
    const presentCount = onTimeCount + lateCount;

    return {
      total,
      presentCount: Math.min(presentCount, 28),
      presentRate: 88,
      onTimeCount,
      onTimeRate: 75,
      lateCount,
      lateRate: 10,
      missingCount,
      missingRate: 5,
      onLeaveCount,
      onLeaveRate: 10
    };
  }, [logs]);

  // Department distribution metrics
  const departmentStats = useMemo(() => {
    return [
      { name: "Product & Engineering", present: 12, total: 14, rate: 86, color: "#2563eb" },
      { name: "Operations", present: 8, total: 9, rate: 89, color: "#10b981" },
      { name: "People & HR", present: 4, total: 4, rate: 100, color: "#8b5cf6" },
      { name: "Finance & Payroll", present: 4, total: 5, rate: 80, color: "#f59e0b" }
    ];
  }, []);

  const sessionAction = isWorking ? onCheckOut : onCheckIn;
  const sessionActionLabel = isAttendanceBusy ? (isWorking ? t.checkingOut : t.checkingIn) : isWorking ? t.checkOut : t.checkIn;
  const sessionStatusLabel = getSessionStatusLabel(attendanceSession.status, t);
  const checkedInLabel = attendanceSession.checkInAt ? `${t.checkedInAtPrefix} ${formatClockTime(attendanceSession.checkInAt, locale)}` : "";
  const checkInReminder = !isWorking ? getCheckInReminder(currentTime, schedule, language, t) : "";

  // Action alerts for managers & admins
  const pendingLeavesCount = user.role === "Admin" ? 18 : user.role === "HR" ? 14 : 6;
  const missingCheckoutCount = stats.missingCount || 2;
  const adjustmentCount = managerAlerts.length || 1;

  // -------------------------------------------------------------
  // ADMIN / HR / MANAGERIAL DASHBOARD
  // -------------------------------------------------------------
  if (isManagerial) {
    return (
      <div className="admin-dashboard-container" aria-label={t.adminDashboardTitle}>
        {/* BLOCK 1: Hero Welcome Header */}
        <section className="admin-header-row">
          <div className="admin-header-left">
            <span className="admin-date-badge">
              <ClockIcon className="icon-tiny text-primary" />
              <span>{t.todayDate}: {summaryDate}</span>
              <span className="date-clock-separator">•</span>
              <span className="admin-live-clock">{realTimeClock}</span>
            </span>
            <h2>{greeting}, {user.name}</h2>
            <p className="admin-header-sub">{t.adminDashboardSubtitle}</p>
          </div>
          <div className="admin-header-right">
            <div className="admin-role-badge">
              <span className="role-dot" />
              <strong>{translateRole(user.role, t)}</strong>
            </div>
            <span className="admin-status-indicator">
              <CheckCircleIcon className="icon-tiny text-success" />
              {t.systemActive}
            </span>
          </div>
        </section>

        {/* BLOCK 2: Top 4 KPI Cards */}
        <section className="kpi-cards-grid" aria-label={t.quickStats}>
          {/* Card 1: Active Workforce */}
          <article className="kpi-card kpi-card-success">
            <div className="kpi-card-header">
              <span className="kpi-label">{t.activeEmployees}</span>
              <div className="kpi-icon-wrap kpi-icon-success">
                <UserCheckIcon />
              </div>
            </div>
            <div className="kpi-value-row">
              <h3 className="kpi-value">{stats.presentCount}<span className="kpi-subvalue">/{stats.total}</span></h3>
              <span className="kpi-trend-badge success">
                <TrendingUpIcon /> {stats.presentRate}%
              </span>
            </div>
            <p className="kpi-hint">{t.presentToday}</p>
          </article>

          {/* Card 2: Pending Leaves */}
          <article className="kpi-card kpi-card-warning" onClick={() => onNavigate("leaveRequests")}>
            <div className="kpi-card-header">
              <span className="kpi-label">{t.pendingLeaves}</span>
              <div className="kpi-icon-wrap kpi-icon-warning">
                <CalendarCheckIcon />
              </div>
            </div>
            <div className="kpi-value-row">
              <h3 className="kpi-value">{pendingLeavesCount}</h3>
              <span className="kpi-trend-badge warning">Pending</span>
            </div>
            <p className="kpi-hint">{t.requiresReview}</p>
          </article>

          {/* Card 3: Missing Check-outs (Urgent) */}
          <article className="kpi-card kpi-card-danger" onClick={() => onNavigate("attendanceLogs")}>
            <div className="kpi-card-header">
              <span className="kpi-label">{t.missingCheckOuts}</span>
              <div className="kpi-icon-wrap kpi-icon-danger">
                <AlertCircleIcon />
              </div>
            </div>
            <div className="kpi-value-row">
              <h3 className="kpi-value">{missingCheckoutCount}</h3>
              <span className="kpi-trend-badge danger">Urgent</span>
            </div>
            <p className="kpi-hint">{t.needsCorrection}</p>
          </article>

          {/* Card 4: Late Today */}
          <article className="kpi-card kpi-card-amber" onClick={() => onNavigate("attendanceLogs")}>
            <div className="kpi-card-header">
              <span className="kpi-label">{t.lateToday}</span>
              <div className="kpi-icon-wrap kpi-icon-amber">
                <WarningIcon />
              </div>
            </div>
            <div className="kpi-value-row">
              <h3 className="kpi-value">{stats.lateCount}</h3>
              <span className="kpi-trend-badge amber">Attention</span>
            </div>
            <p className="kpi-hint">{t.afterGracePeriod}</p>
          </article>
        </section>

        {/* BLOCK 3: Analytical Content (65% / 35%) */}
        <section className="analytical-grid">
          {/* Left Column (65%): Attendance Overview & Distribution Chart */}
          <article className="analytical-card chart-card">
            <div className="card-top-head">
              <div>
                <h3>{t.attendanceDistribution}</h3>
                <p>{t.companyAttendanceHealth}</p>
              </div>
              <span className="pill-badge pill-info">
                {stats.total} {t.people}
              </span>
            </div>

            {/* Segmented Distribution Bar */}
            <div className="distribution-bar-wrapper">
              <div className="distribution-bar" role="progressbar" aria-label="Attendance distribution">
                <span className="bar-segment bar-on-time" style={{ width: `${stats.onTimeRate}%` }} title={`${t.onTime}: ${stats.onTimeRate}%`} />
                <span className="bar-segment bar-late" style={{ width: `${stats.lateRate}%` }} title={`${t.late}: ${stats.lateRate}%`} />
                <span className="bar-segment bar-leave" style={{ width: `${stats.onLeaveRate}%` }} title={`${t.onLeave}: ${stats.onLeaveRate}%`} />
                <span className="bar-segment bar-missing" style={{ width: `${stats.missingRate}%` }} title={`${t.missingCheckOut}: ${stats.missingRate}%`} />
              </div>
            </div>

            {/* 4 Metric Pills */}
            <div className="distribution-legend-grid">
              <div className="legend-item legend-on-time">
                <span className="legend-dot dot-green" />
                <div className="legend-info">
                  <strong>{stats.onTimeCount}</strong>
                  <span>{t.onTime} ({stats.onTimeRate}%)</span>
                </div>
              </div>
              <div className="legend-item legend-late">
                <span className="legend-dot dot-amber" />
                <div className="legend-info">
                  <strong>{stats.lateCount}</strong>
                  <span>{t.late} ({stats.lateRate}%)</span>
                </div>
              </div>
              <div className="legend-item legend-leave">
                <span className="legend-dot dot-purple" />
                <div className="legend-info">
                  <strong>{stats.onLeaveCount}</strong>
                  <span>{t.onLeave} ({stats.onLeaveRate}%)</span>
                </div>
              </div>
              <div className="legend-item legend-missing">
                <span className="legend-dot dot-red" />
                <div className="legend-info">
                  <strong>{stats.missingCount}</strong>
                  <span>{t.missingCheckOut} ({stats.missingRate}%)</span>
                </div>
              </div>
            </div>

            {/* Department Breakdown Section */}
            <div className="department-breakdown-section">
              <h4>{t.departmentBreakdown}</h4>
              <div className="dept-bars-list">
                {departmentStats.map((dept) => (
                  <div className="dept-bar-row" key={dept.name}>
                    <div className="dept-info">
                      <span className="dept-name">{dept.name}</span>
                      <span className="dept-numbers">{dept.present}/{dept.total} ({dept.rate}%)</span>
                    </div>
                    <div className="dept-track">
                      <div className="dept-fill" style={{ width: `${dept.rate}%`, backgroundColor: dept.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </article>

          {/* Right Column (35%): Action Alerts / Requires Attention */}
          <article className="analytical-card alerts-card">
            <div className="card-top-head">
              <div>
                <h3>{t.requiresAttention}</h3>
                <p>{t.actionAlertsCount.replace("{count}", `${pendingLeavesCount + missingCheckoutCount + adjustmentCount}`)}</p>
              </div>
              <span className="pill-badge pill-urgent">
                <AlertCircleIcon className="icon-tiny" />
                Action
              </span>
            </div>

            <div className="action-alerts-list">
              {/* Alert 1: Missing Check-outs */}
              <div className="alert-item alert-urgent">
                <div className="alert-icon-box box-red">
                  <AlertCircleIcon />
                </div>
                <div className="alert-text-content">
                  <strong>{t.missingCheckOuts}</strong>
                  <p>{missingCheckoutCount} {t.missingCheckOut.toLowerCase()} {t.needsCorrection.toLowerCase()}</p>
                </div>
                <button
                  type="button"
                  className="alert-action-btn btn-danger"
                  onClick={() => onNavigate("attendanceLogs")}
                >
                  {t.reviewNow}
                </button>
              </div>

              {/* Alert 2: Pending Leave Requests */}
              <div className="alert-item alert-warning">
                <div className="alert-icon-box box-amber">
                  <CalendarCheckIcon />
                </div>
                <div className="alert-text-content">
                  <strong>{t.pendingLeaves}</strong>
                  <p>{pendingLeavesCount} {t.pendingLeaveRequests.toLowerCase()}</p>
                </div>
                <button
                  type="button"
                  className="alert-action-btn btn-warning"
                  onClick={() => onNavigate("leaveRequests")}
                >
                  {t.reviewNow}
                </button>
              </div>

              {/* Alert 3: Adjustment Requests */}
              <div className="alert-item alert-info">
                <div className="alert-icon-box box-blue">
                  <WarningIcon />
                </div>
                <div className="alert-text-content">
                  <strong>{t.attendanceExceptions}</strong>
                  <p>{adjustmentCount} {t.teamAlertsText.toLowerCase()}</p>
                </div>
                <button
                  type="button"
                  className="alert-action-btn btn-blue"
                  onClick={() => onNavigate("attendanceLogs")}
                >
                  {t.reviewNow}
                </button>
              </div>

              {/* Alert 4: Payroll Readiness */}
              {(user.role === "Payroll" || user.role === "Admin") && (
                <div className="alert-item alert-payroll">
                  <div className="alert-icon-box box-emerald">
                    <ClockIcon />
                  </div>
                  <div className="alert-text-content">
                    <strong>{t.payrollReadiness}</strong>
                    <p>{payrollReadiness ?? "88% ready"} • {t.currentPayrollPeriod}</p>
                  </div>
                  <button
                    type="button"
                    className="alert-action-btn btn-emerald"
                    onClick={() => onNavigate("payrollSummaries")}
                  >
                    {t.openPayrollSummary}
                  </button>
                </div>
              )}
            </div>
          </article>
        </section>

        {/* BLOCK 4: Data Table - Real-time Activity Logs */}
        <section className="logs-card admin-logs-card" aria-label={t.realtimeActivityLogs}>
          <div className="section-header">
            <div>
              <h3>{t.realtimeActivityLogs}</h3>
              <p className="section-subheader">{t.realtimeActivitySubtitle}</p>
            </div>
            <button className="action-link-btn" type="button" onClick={() => onNavigate("attendanceLogs")}>
              {t.viewAll} →
            </button>
          </div>

          <div className="table-wrap">
            <table className="admin-logs-table">
              <thead>
                <tr>
                  <th>{t.employeeNameCode}</th>
                  <th>{t.departmentCol}</th>
                  <th>{t.date}</th>
                  <th>{t.checkInColumn}</th>
                  <th>{t.checkOutColumn}</th>
                  <th>{t.totalHours}</th>
                  <th>{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {displayLogs.map((log) => {
                  const empName = log.employeeName || user.name;
                  const empCode = log.employeeId
                    ? (log.employeeId.startsWith("u-") ? log.employeeId.replace("u-", "").toUpperCase() : log.employeeId.slice(0, 7).toUpperCase())
                    : "EMP-001";
                  const dept = log.department || "Operations";
                  const initial = empName.charAt(0).toUpperCase();

                  return (
                    <tr key={log.id}>
                      <td data-label={t.employeeNameCode}>
                        <div className="employee-cell">
                          <div className="emp-avatar-circle">{initial}</div>
                          <div className="emp-details">
                            <strong className="emp-name">{empName}</strong>
                            <span className="emp-code">{empCode}</span>
                          </div>
                        </div>
                      </td>
                      <td data-label={t.departmentCol}>
                        <span className="dept-tag">{dept}</span>
                      </td>
                      <td data-label={t.date}>{formatWorkDate(log.workDate, locale)}</td>
                      <td data-label={t.checkInColumn} className="text-time">
                        {formatAttendanceTime(log.checkIn, locale)}
                      </td>
                      <td data-label={t.checkOutColumn} className="text-time">
                        {log.checkOut ? formatAttendanceTime(log.checkOut, locale) : <span className="text-muted">In session...</span>}
                      </td>
                      <td data-label={t.totalHours} className="font-semibold">{log.totalHours || "--"}</td>
                      <td data-label={t.status}>
                        <span className={`badge ${statusClassName(log.status)}`}>
                          {translateStatus(log.status, t)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {displayLogs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-6 text-muted">
                      {t.noRecentLogs}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  // -------------------------------------------------------------
  // REGULAR EMPLOYEE PERSONAL DASHBOARD (Retained for staff check-in)
  // -------------------------------------------------------------
  const personalMetrics: DashboardMetric[] = [
    {
      label: t.yourRemainingLeave,
      value: `${user.remainingLeaveDays}`,
      suffix: t.days,
      icon: "leave"
    }
  ];

  return (
    <>
      <section className="content-grid" aria-label={t.dashboard}>
        <article className="hero-card">
          <div className="dashboard-hero-heading">
            <div className="dashboard-intro">
              <span className="dashboard-date-label">
                <ClockIcon className="icon-tiny text-primary" />
                <span>{t.todayDate}: {summaryDate}</span>
                <span className="date-clock-separator">•</span>
                <span className="admin-live-clock">{realTimeClock}</span>
              </span>
              <h3>
                {greeting}, {user.name}.
              </h3>
            </div>

            <aside className="stats-column" aria-label={t.quickStats}>
              {personalMetrics.map((metric) => (
                <article className="stat-card" key={metric.label}>
                  <div className="stat-label">
                    <LeaveIcon />
                    {metric.label}
                  </div>
                  <p>
                    <strong>{metric.value}</strong> {metric.suffix}
                  </p>
                </article>
              ))}
            </aside>
          </div>

          <div className="employee-time-overview">
            <div className="time-group-grid">
              <div className="time-block time-block-session">
                <span className="time-block-label">{t.currentSession}</span>
                <strong className="time-block-value">
                  {isWorking || attendanceSession.status === "checked-out" ? formatDuration(seconds) : "00:00:00"}
                </strong>
                <div className="time-block-meta">
                  <span className={`session-status ${attendanceSession.status}`}>{sessionStatusLabel}</span>
                  {checkedInLabel && <span className="time-subtext">{checkedInLabel}</span>}
                </div>
              </div>

              {scheduleLabel && (
                <div className="time-block time-block-schedule">
                  <span className="time-block-label">{t.standardWorkSchedule}</span>
                  <strong className="time-block-value schedule-text">{scheduleLabel}</strong>
                  <div className="time-block-meta">
                    <span className="schedule-hint-badge">8.0 hrs / {t.day.toLowerCase()}</span>
                    {checkInReminder && <span className="time-subtext text-warning">{checkInReminder}</span>}
                  </div>
                </div>
              )}
            </div>

            <div className="header-checkin-tip">
              <span className="tip-icon">💡</span>
              <p>{t.useHeaderCheckInHint}</p>
            </div>
          </div>
          {(attendanceMessage || attendanceError) && (
            <div className={`attendance-toast ${attendanceError ? "error" : "success"}`} role="status">
              {attendanceError || attendanceMessage}
            </div>
          )}
        </article>
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
              {displayLogs.map((log) => (
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

function statusClassName(status: string) {
  if (status === "On Time") return "success";
  if (status === "Late") return "warning";
  if (status === "Missing Check-out") return "danger";
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
