import { useState } from "react";
import { AttendanceLogsPage } from "./components/AttendanceLogsPage";
import { AuthPage } from "./components/AuthPage";
import { Dashboard } from "./components/Dashboard";
import { LeaveRequestsPage } from "./components/LeaveRequestsPage";
import { PayrollSummariesPage } from "./components/PayrollSummariesPage";
import { EmployeeManagementPage } from "./components/EmployeeManagementPage";
import { ProfilePage } from "./components/ProfilePage";
import { HelpCenterPage } from "./components/HelpCenterPage";
import { SettingsPage } from "./components/SettingsPage";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, retryNotificationEmail, loginWithPassword, registerAccount } from "./api";
import { dashboardData, demoUsers, helpArticles as initialHelpArticles, leaveRequests as initialLeaveRequests, leaveWorkflowConfig as initialLeaveWorkflowConfig, notifications as initialNotifications, payrollPeriods as initialPayrollPeriods, supportTickets as initialSupportTickets, systemSettings as initialSystemSettings } from "./data/mockData";
import type { Language, Translation } from "./i18n";
import { translations } from "./i18n";
import type { AppPage, AppNotification, AttendanceLog, AttendanceSession, HelpArticle, LeaveRequest, LeaveWorkflowConfig, PayrollPeriod, SupportTicket, SystemSettings, User } from "./types";
import { formatClockTime, formatLogDate, formatTotalHours } from "./utils/time";
import { canAccessPage } from "./utils/permissions";

export default function App() {
  const [users, setUsers] = useState<User[]>(demoUsers);
  const [localPasswords, setLocalPasswords] = useState<Record<string, string>>({});
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [activePage, setActivePage] = useState<AppPage>("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] = useState(false);
  const [attendanceSession, setAttendanceSession] = useState<AttendanceSession>({
    status: "not-started",
    checkInAt: null,
    checkOutAt: null,
    elapsedSeconds: 0,
    device: "",
    ipAddress: "",
    location: ""
  });
  const [logs, setLogs] = useState<AttendanceLog[]>(dashboardData.logs);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(initialLeaveRequests);
  const [leaveWorkflowConfig, setLeaveWorkflowConfig] = useState<LeaveWorkflowConfig>(initialLeaveWorkflowConfig);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>(initialPayrollPeriods);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(initialSystemSettings);
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications);
  const [helpArticles] = useState<HelpArticle[]>(initialHelpArticles);
  const [, setSupportTickets] = useState<SupportTicket[]>(initialSupportTickets);
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [attendanceError, setAttendanceError] = useState("");
  const [isAttendanceBusy, setIsAttendanceBusy] = useState(false);
  const t = translations[language];

  async function handleLogin(email: string, password: string) {
    const fallbackUser = users.find((item) => item.email === email) ?? users[0];
    const expectedPassword = localPasswords[email] ?? "password";

    try {
      const result = await loginWithPassword(email, password);
      setAuthToken(result.token);
      setUser(result.user);
      setActivePage("dashboard");
      return { ok: true };
    } catch (error) {
      if (fallbackUser && password === expectedPassword) {
        setAuthToken(null);
        setUser(fallbackUser);
        setActivePage("dashboard");
        return { ok: true };
      }

      return { ok: false, message: error instanceof Error ? error.message : "Login failed" };
    }
  }

  async function handleRegister(form: { name: string; email: string; role: User["role"]; department: string; password: string; confirmPassword: string }) {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const department = form.department.trim() || roleDepartment(form.role);

    if (!name || !email || !form.password || !form.confirmPassword) {
      return { ok: false, message: t.requiredFields };
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, message: t.invalidEmail };
    }

    if (form.password.length < 6) {
      return { ok: false, message: t.passwordMinLength };
    }

    if (form.password !== form.confirmPassword) {
      return { ok: false, message: t.passwordMismatch };
    }

    if (users.some((item) => item.email.toLowerCase() === email)) {
      return { ok: false, message: t.emailAlreadyExists };
    }

    const fallbackUser: User = {
      id: `u-register-${Date.now()}`,
      name,
      email,
      role: form.role,
      subtitle: department,
      remainingLeaveDays: 12
    };

    try {
      const result = await registerAccount({ ...form, name, email, department });
      setUsers((current) => [...current, result.user]);
      setLocalPasswords((current) => ({ ...current, [email]: form.password }));
      setAuthToken(result.token);
      setUser(result.user);
      setActivePage("dashboard");
      return { ok: true };
    } catch {
      setUsers((current) => [...current, fallbackUser]);
      setLocalPasswords((current) => ({ ...current, [email]: form.password }));
      setAuthToken(null);
      setUser(fallbackUser);
      setActivePage("dashboard");
      return { ok: true };
    }
  }

  function startSessionForUser(nextUser: User) {
    const scheduleError = getCheckInRestriction(new Date(), nextUser, systemSettings, t);
    if (scheduleError) {
      setAttendanceError(scheduleError);
      setAttendanceMessage("");
      return scheduleError;
    }
    const now = new Date();
    setAuthToken(null);
    setUser(nextUser);
    setActivePage("dashboard");
    setAttendanceSession({
      status: "working",
      checkInAt: now,
      checkOutAt: null,
      elapsedSeconds: 0,
      device: t.browserDevice,
      ipAddress: t.officeNetwork,
      location: t.headquarters
    });
    setAttendanceMessage(t.checkInSuccess);
    setAttendanceError("");
    return "";
  }

  function handleQuickCheckIn(nextUser: User) {
    return startSessionForUser(nextUser);
  }

  function handleNewEmployeeCheckIn(name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const existingUser = users.find((item) => item.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingUser) {
      startSessionForUser(existingUser);
      return;
    }

    const newUser: User = {
      id: `u-new-${Date.now()}`,
      name: trimmedName,
      email: `${slugify(trimmedName)}@workforce.local`,
      role: "Employee",
      subtitle: "Employee",
      remainingLeaveDays: 12
    };

    setUsers((current) => [...current, newUser]);
    startSessionForUser(newUser);
  }

  function handleCheckIn() {
    if (attendanceSession.status === "working") {
      setAttendanceError(t.duplicateCheckIn);
      return;
    }

    const scheduleError = getCheckInRestriction(new Date(), user, systemSettings, t);
    if (scheduleError) {
      setAttendanceError(scheduleError);
      return;
    }

    setIsAttendanceBusy(true);
    const now = new Date();
    window.setTimeout(() => {
      setAttendanceSession({
        status: "working",
        checkInAt: now,
        checkOutAt: null,
        elapsedSeconds: 0,
        device: t.browserDevice,
        ipAddress: t.officeNetwork,
        location: t.headquarters
      });
      setAttendanceMessage(t.checkInSuccess);
      setAttendanceError("");
      setIsAttendanceBusy(false);
    }, 300);
  }

  function handleCheckOut() {
    if (attendanceSession.status !== "working" || !attendanceSession.checkInAt) {
      setAttendanceError(t.checkOutWithoutCheckIn);
      return;
    }

    setIsAttendanceBusy(true);
    const now = new Date();
    const totalSeconds = Math.max(0, Math.floor((now.getTime() - attendanceSession.checkInAt.getTime()) / 1000));
    const newLog: AttendanceLog = {
      id: `log-${now.getTime()}`,
      employeeId: user?.id,
      employeeName: user?.name ?? "Unknown",
      department: roleDepartment(user?.role),
      managerId: "u-admin",
      workDate: now.toISOString().slice(0, 10),
      date: formatLogDate(now),
      checkIn: formatClockTime(attendanceSession.checkInAt),
      checkOut: formatClockTime(now),
      totalHours: formatTotalHours(totalSeconds),
      overtime: "0h 0m",
      status: "On Time",
      adjustmentStatus: "None",
      payrollLocked: false
    };

    window.setTimeout(() => {
      setAttendanceSession((current) => ({
        ...current,
        status: "checked-out",
        checkOutAt: now,
        elapsedSeconds: totalSeconds
      }));
      setLogs((current) => [newLog, ...current].slice(0, 5));
      setAttendanceMessage(t.checkOutSuccess);
      setAttendanceError("");
      setIsAttendanceBusy(false);
    }, 300);
  }

  if (!user) {
    return <AuthPage language={language} onLanguageChange={setLanguage} onLogin={handleLogin} onNewEmployeeCheckIn={handleNewEmployeeCheckIn} onQuickCheckIn={handleQuickCheckIn} onRegister={handleRegister} t={t} users={users} />;
  }

  function scopedLocalNotifications(currentUser: User | null = user) {
    if (!currentUser) return [];
    return notifications.filter((notification) => currentUser.role === "Admin" || notification.recipientId === currentUser.id || notification.recipientRole === currentUser.role);
  }

  async function loadNotifications(token: string) {
    try {
      const result = await fetchNotifications(token);
      setNotifications(result.notifications);
    } catch {
      // Keep local demo notifications when backend is not running.
    }
  }

  async function handleMarkNotificationRead(notificationId: string) {
    setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, read: true } : item));
    if (authToken) {
      try {
        const result = await markNotificationRead(authToken, notificationId);
        setNotifications((current) => current.map((item) => item.id === notificationId ? result.notification : item));
      } catch {
        // Local state already reflects the intended UI action.
      }
    }
  }

  async function handleMarkAllNotificationsRead() {
    setNotifications((current) => current.map((item) => scopedLocalNotifications().some((visible) => visible.id === item.id) ? { ...item, read: true } : item));
    if (authToken) {
      try {
        const result = await markAllNotificationsRead(authToken);
        setNotifications(result.notifications);
      } catch {
        // Local state already reflects the intended UI action.
      }
    }
  }

  async function handleRetryNotificationEmail(notificationId: string) {
    setNotifications((current) => current.map((item) => item.id === notificationId ? { ...item, emailStatus: "Sent", retryCount: item.retryCount + 1 } : item));
    if (authToken) {
      try {
        const result = await retryNotificationEmail(authToken, notificationId);
        setNotifications((current) => current.map((item) => item.id === notificationId ? result.notification : item));
      } catch {
        // Local retry state is enough for demo mode.
      }
    }
  }

  function handleSupportTicketCreated(ticket: SupportTicket) {
    setSupportTickets((current) => [ticket, ...current]);
    const notification: AppNotification = { id: "notif-ticket-local-" + Date.now(), recipientRole: "Admin", title: "New support request", message: ticket.requesterName + ": " + ticket.subject, category: "system", read: false, createdAt: new Date().toISOString(), emailStatus: "Sent", retryCount: 0 };
    setNotifications((current) => [notification, ...current]);
  }
  function requestLogout() {
    setIsMobileMenuOpen(false);
    setIsLogoutConfirmationOpen(true);
  }

  function handleLogout() {
    setIsLogoutConfirmationOpen(false);
    setAuthToken(null);
    setUser(null);
    setActivePage("dashboard");
  }

  function handleNavigate(page: AppPage) {
    if (!user || canAccessPage(user.role, page)) {
      setActivePage(page);
      return;
    }

    setActivePage("dashboard");
  }

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onLogout={requestLogout} onNavigate={handleNavigate} user={user} t={t} isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
      {isMobileMenuOpen && <button className="sidebar-backdrop" type="button" aria-label={t.close} onClick={() => setIsMobileMenuOpen(false)} />}
      <main className="workspace">
        <Topbar
          activePage={activePage}
          attendanceSession={attendanceSession}
          isAttendanceBusy={isAttendanceBusy}
          language={language}
          onAttendanceAction={attendanceSession.status === "working" ? handleCheckOut : handleCheckIn}
          onLanguageChange={setLanguage}
          notifications={scopedLocalNotifications()}
          onLogout={requestLogout}
          onMarkAllNotificationsRead={() => void handleMarkAllNotificationsRead()}
          onMarkNotificationRead={(notificationId) => void handleMarkNotificationRead(notificationId)}
          onRetryNotificationEmail={(notificationId) => void handleRetryNotificationEmail(notificationId)}
          onOpenProfile={() => setActivePage("profile")}
          onMenuClick={() => setIsMobileMenuOpen((current) => !current)}
          t={t}
          user={user}
        />
        {activePage === "dashboard" && (
          <Dashboard
            attendanceError={attendanceError}
            attendanceMessage={attendanceMessage}
            attendanceSession={attendanceSession}
            isAttendanceBusy={isAttendanceBusy}
            logs={logs}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            t={t}
            user={user}
            onNavigate={handleNavigate}
          />
        )}
        {activePage === "attendanceLogs" && <AttendanceLogsPage authToken={authToken} logs={logs} onLogsChange={setLogs} t={t} user={user} />}
        {activePage === "leaveRequests" && (
          <LeaveRequestsPage
            authToken={authToken}
            requests={leaveRequests}
            workflowConfig={leaveWorkflowConfig}
            onRequestsChange={setLeaveRequests}
            onWorkflowConfigChange={setLeaveWorkflowConfig}
            onAttendanceLogsCreated={(createdLogs) => setLogs((current) => [...createdLogs, ...current])}
            onUserChange={setUser}
            t={t}
            user={user}
          />
        )}
        {activePage === "payrollSummaries" && (
          <PayrollSummariesPage
            authToken={authToken}
            logs={logs}
            periods={payrollPeriods}
            onLogsChange={setLogs}
            onPeriodsChange={setPayrollPeriods}
            settings={systemSettings}
            t={t}
            user={user}
          />
        )}
        {activePage === "employeeManagement" && (
          <EmployeeManagementPage
            authToken={authToken}
            logs={logs}
            onUsersChange={setUsers}
            t={t}
            user={user}
            users={users}
          />
        )}
        {activePage === "settings" && <SettingsPage authToken={authToken} settings={systemSettings} onSettingsChange={setSystemSettings} t={t} user={user} />}
        {activePage === "helpCenter" && <HelpCenterPage articles={helpArticles} authToken={authToken} onTicketCreated={handleSupportTicketCreated} t={t} user={user} />}
        {activePage === "profile" && <ProfilePage t={t} user={user} />}
        {activePage !== "dashboard" && activePage !== "attendanceLogs" && activePage !== "leaveRequests" && activePage !== "payrollSummaries" && activePage !== "employeeManagement" && activePage !== "settings" && activePage !== "helpCenter" && activePage !== "profile" && (
          <section className="placeholder-page">
            <h3>{t[activePage]}</h3>
            <p>{t.pageComingSoon}</p>
          </section>
        )}
      </main>
      {isLogoutConfirmationOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="forgot-modal confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="logout-confirmation-title">
            <div className="modal-header">
              <div>
                <h2 id="logout-confirmation-title">{t.confirmLogout}</h2>
                <p>{t.confirmLogoutMessage}</p>
              </div>
              <button className="modal-close" type="button" aria-label={t.close} onClick={() => setIsLogoutConfirmationOpen(false)}>x</button>
            </div>
            <div className="confirmation-actions">
              <button className="secondary-button" type="button" onClick={() => setIsLogoutConfirmationOpen(false)}>{t.cancel}</button>
              <button className="primary-button" type="button" onClick={handleLogout}>{t.logout}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function roleDepartment(role?: User["role"]) {
  if (role === "HR") return "People";
  if (role === "Payroll") return "Finance";
  if (role === "Manager") return "Operations";
  if (role === "Admin") return "Administration";
  return "Product";
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/(^\.|\.$)/g, "");
}


function getCheckInRestriction(now: Date, currentUser: User | null, settings: SystemSettings, t: Translation) {
  if (!currentUser) return "";
  const isoDate = now.toISOString().slice(0, 10);
  if (settings.holidays.some((holiday) => isoDate >= holiday.startDate && isoDate <= holiday.endDate)) return t.checkInHoliday;
  const schedule = settings.workSchedules[0];
  if (!schedule || !schedule.workDays.includes(now.getDay())) return t.checkInDayOff;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = toMinutes(schedule.startTime);
  const endMinutes = toMinutes(schedule.endTime);
  if (currentMinutes < startMinutes) return t.checkInTooEarly.replace("{time}", schedule.startTime);
  if (currentMinutes > endMinutes) return t.checkInClosed.replace("{time}", schedule.endTime);
  return "";
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
