import { useState } from "react";
import { AttendanceLogsPage } from "./components/AttendanceLogsPage";
import { AuthPage } from "./components/AuthPage";
import { ResetPasswordPage } from "./components/ResetPasswordPage";
import { Dashboard } from "./components/Dashboard";
import { LeaveRequestsPage } from "./components/LeaveRequestsPage";
import { PayrollSummariesPage } from "./components/PayrollSummariesPage";
import { EmployeeManagementPage } from "./components/EmployeeManagementPage";
import { ProfilePage } from "./components/ProfilePage";
import { HelpCenterPage } from "./components/HelpCenterPage";
import { SettingsPage } from "./components/SettingsPage";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { checkIn, checkOut, fetchDashboard, fetchNotifications, fetchSettings, logoutSession, markAllNotificationsRead, markNotificationRead, retryNotificationEmail, loginWithPassword, registerAccount, requestPasswordReset, resetPassword, submitQuickAttendance } from "./api";
import { emptyLeaveWorkflow, emptySystemSettings } from "./data/defaults";
import type { Language, Translation } from "./i18n";
import { translations } from "./i18n";
import type { AppPage, AppNotification, AttendanceLog, AttendanceSession, HelpArticle, LeaveRequest, LeaveWorkflowConfig, PayrollPeriod, SupportTicket, SystemSettings, User } from "./types";
import { canAccessPage } from "./utils/permissions";

export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(() => new URLSearchParams(window.location.search).get("resetToken"));
  const [language, setLanguage] = useState<Language>("en");
  const [activePage, setActivePage] = useState<AppPage>("dashboard");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] = useState(false);
  const [pendingAttendanceAction, setPendingAttendanceAction] = useState<"check-in" | "check-out" | null>(null);
  const [attendanceSession, setAttendanceSession] = useState<AttendanceSession>({
    status: "not-started",
    checkInAt: null,
    checkOutAt: null,
    elapsedSeconds: 0,
    device: "",
    ipAddress: "",
    location: ""
  });
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [leaveWorkflowConfig, setLeaveWorkflowConfig] = useState<LeaveWorkflowConfig>(emptyLeaveWorkflow);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(emptySystemSettings);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [helpArticles] = useState<HelpArticle[]>([]);
  const [, setSupportTickets] = useState<SupportTicket[]>([]);
  const [managerAlerts, setManagerAlerts] = useState<string[]>([]);
  const [payrollReadiness, setPayrollReadiness] = useState<string | null>(null);
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [attendanceError, setAttendanceError] = useState("");
  const [isAttendanceBusy, setIsAttendanceBusy] = useState(false);
  const t = translations[language];

  async function loadDashboard(token: string, authenticatedUser?: User) {
    const result = await fetchDashboard(token);
    setLogs(result.logs);
    setManagerAlerts(result.managerAlerts);
    setPayrollReadiness(result.payrollReadiness);
    const settingsResult = await fetchSettings(token);
    setSystemSettings(settingsResult.settings);
    if (authenticatedUser) setUser({ ...authenticatedUser, remainingLeaveDays: result.remainingLeaveDays });
    setAttendanceSession(result.session ? { status: "working", checkInAt: new Date(result.session.checkInAt), checkOutAt: null, elapsedSeconds: result.sessionSeconds, device: result.session.device, ipAddress: result.session.ipAddress, location: result.session.location } : { status: "not-started", checkInAt: null, checkOutAt: null, elapsedSeconds: 0, device: "", ipAddress: "", location: "" });
  }

  async function handleLogin(email: string, password: string) {
    try {
      const result = await loginWithPassword(email.trim().toLowerCase(), password);
      setAuthToken(result.token);
      setUser(result.user);
      setActivePage("dashboard");
      await loadDashboard(result.token, result.user);
      return { ok: true };
    } catch (error) {
      setAuthToken(null);
      setUser(null);
      return { ok: false, message: error instanceof Error ? error.message : "Login failed" };
    }
  }

  async function handleRegister(form: { name: string; email: string; role: User["role"]; department: string; password: string; confirmPassword: string }) {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const department = form.department.trim() || roleDepartment(form.role);
    if (!name || !email || !form.password || !form.confirmPassword) return { ok: false, message: t.requiredFields };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: t.invalidEmail };
    if (form.password.length < 6) return { ok: false, message: t.passwordMinLength };
    if (form.password !== form.confirmPassword) return { ok: false, message: t.passwordMismatch };
    try {
      const result = await registerAccount({ ...form, name, email, department });
      setUsers((current) => [...current.filter((item) => item.id !== result.user.id), result.user]);
      setAuthToken(result.token);
      setUser(result.user);
      setActivePage("dashboard");
      await loadDashboard(result.token, result.user);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : t.registerFailed };
    }
  }
  async function handleForgotPassword(email: string) {
    await requestPasswordReset(email);
  }

  async function handlePasswordReset(password: string, confirmPassword: string) {
    if (!resetToken) throw new Error("Invalid or expired reset link");
    await resetPassword(resetToken, password, confirmPassword);
  }

  function finishPasswordReset() {
    window.history.replaceState({}, "", window.location.pathname);
    setResetToken(null);
  }
  async function handleQuickAttendance(employeeId: string, action: "check-in" | "check-out", phoneLast4: string, pin: string) {
    return submitQuickAttendance({ employeeId, action, phoneLast4, pin });
  }

  async function handleCheckIn() {
    if (!authToken) { setAttendanceError("Authentication is required"); return; }
    setIsAttendanceBusy(true); setAttendanceError(""); setAttendanceMessage("");
    try {
      const result = await checkIn(authToken);
      setAttendanceSession({ status: "working", checkInAt: new Date(result.session.checkInAt), checkOutAt: null, elapsedSeconds: 0, device: result.session.device, ipAddress: result.session.ipAddress, location: result.session.location });
      setAttendanceMessage(t.checkInSuccess);
    } catch (error) { setAttendanceError(error instanceof Error ? error.message : t.duplicateCheckIn); }
    finally { setIsAttendanceBusy(false); }
  }

  async function handleCheckOut() {
    if (!authToken) { setAttendanceError("Authentication is required"); return; }
    setIsAttendanceBusy(true); setAttendanceError(""); setAttendanceMessage("");
    try {
      const result = await checkOut(authToken);
      setAttendanceSession((current) => ({ ...current, status: "checked-out", checkOutAt: new Date(), elapsedSeconds: current.checkInAt ? Math.max(0, Math.floor((Date.now() - current.checkInAt.getTime()) / 1000)) : 0 }));
      setLogs((current) => [result.log, ...current.filter((log) => log.id !== result.log.id)].slice(0, 50));
      setAttendanceMessage(t.checkOutSuccess);
    } catch (error) { setAttendanceError(error instanceof Error ? error.message : t.checkOutWithoutCheckIn); }
    finally { setIsAttendanceBusy(false); }
  }
  if (!user && resetToken) {
    return <ResetPasswordPage language={language} onLanguageChange={setLanguage} onReset={handlePasswordReset} onComplete={finishPasswordReset} t={t} />;
  }

  if (!user) {
    return <AuthPage language={language} onLanguageChange={setLanguage} onLogin={handleLogin} onQuickAttendance={handleQuickAttendance} onForgotPassword={handleForgotPassword} onRegister={handleRegister} t={t} />;
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
      setNotifications([]);
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
        await loadNotifications(authToken);
      }
    }
  }

  function handleSupportTicketCreated(ticket: SupportTicket) {
    setSupportTickets((current) => [ticket, ...current]);
    const notification: AppNotification = { id: "notif-ticket-local-" + Date.now(), recipientRole: "Admin", title: "New support request", message: ticket.requesterName + ": " + ticket.subject, category: "system", read: false, createdAt: new Date().toISOString(), emailStatus: "Sent", retryCount: 0 };
    setNotifications((current) => [notification, ...current]);
  }
  function requestAttendanceAction() {
    setPendingAttendanceAction(attendanceSession.status === "working" ? "check-out" : "check-in");
  }

  function confirmAttendanceAction() {
    const action = pendingAttendanceAction;
    setPendingAttendanceAction(null);
    if (action === "check-out") void handleCheckOut();
    if (action === "check-in") void handleCheckIn();
  }

  function requestLogout() {
    setIsMobileMenuOpen(false);
    setIsLogoutConfirmationOpen(true);
  }

  async function handleLogout() {
    setIsLogoutConfirmationOpen(false);
    if (authToken) {
      try { await logoutSession(authToken); } catch { /* Clear local authentication even if the request fails. */ }
    }
    setAuthToken(null);
    setUser(null);
    setActivePage("dashboard");
    setAttendanceSession({ status: "not-started", checkInAt: null, checkOutAt: null, elapsedSeconds: 0, device: "", ipAddress: "", location: "" });
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
          onAttendanceAction={requestAttendanceAction}
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
            language={language}
            logs={logs}
            managerAlerts={managerAlerts}
            payrollReadiness={payrollReadiness}
            settings={systemSettings}
            onCheckIn={requestAttendanceAction}
            onCheckOut={requestAttendanceAction}
            t={t}
            user={user}
            onNavigate={handleNavigate}
          />
        )}
        {activePage === "attendanceLogs" && <AttendanceLogsPage authToken={authToken} language={language} logs={logs} onLogsChange={setLogs} t={t} user={user} />}
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
            language={language}
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
            language={language}
            logs={logs}
            onUsersChange={setUsers}
            t={t}
            user={user}
            users={users}
          />
        )}
        {activePage === "settings" && <SettingsPage authToken={authToken} settings={systemSettings} onSettingsChange={setSystemSettings} t={t} user={user} />}
        {activePage === "helpCenter" && <HelpCenterPage articles={helpArticles} authToken={authToken} onTicketCreated={handleSupportTicketCreated} t={t} user={user} />}
        {activePage === "profile" && <ProfilePage authToken={authToken ?? ""} t={t} user={user} />}
        {activePage !== "dashboard" && activePage !== "attendanceLogs" && activePage !== "leaveRequests" && activePage !== "payrollSummaries" && activePage !== "employeeManagement" && activePage !== "settings" && activePage !== "helpCenter" && activePage !== "profile" && (
          <section className="placeholder-page">
            <h3>{t[activePage]}</h3>
            <p>{t.pageComingSoon}</p>
          </section>
        )}
      </main>
      {pendingAttendanceAction && (
        <div className="modal-backdrop" role="presentation">
          <section className="forgot-modal confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="attendance-confirmation-title">
            <div className="modal-header">
              <div>
                <h2 id="attendance-confirmation-title">{pendingAttendanceAction === "check-in" ? t.confirmCheckIn : t.confirmCheckOut}</h2>
                <p>{pendingAttendanceAction === "check-in" ? t.confirmCheckInMessage : t.confirmCheckOutMessage}</p>
              </div>
              <button className="modal-close" type="button" aria-label={t.close} onClick={() => setPendingAttendanceAction(null)}>x</button>
            </div>
            <div className="confirmation-actions">
              <button className="secondary-button" type="button" onClick={() => setPendingAttendanceAction(null)}>{t.cancel}</button>
              <button className="primary-button" type="button" onClick={confirmAttendanceAction}>{t.confirmAction}</button>
            </div>
          </section>
        </div>
      )}
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
