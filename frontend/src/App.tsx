import { useState } from "react";
import { AttendanceLogsPage } from "./components/AttendanceLogsPage";
import { AuthPage } from "./components/AuthPage";
import { Dashboard } from "./components/Dashboard";
import { ProfilePage } from "./components/ProfilePage";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { loginWithPassword, registerAccount } from "./api";
import { dashboardData, demoUsers } from "./data/mockData";
import type { Language } from "./i18n";
import { translations } from "./i18n";
import type { AppPage, AttendanceLog, AttendanceSession, User } from "./types";
import { formatClockTime, formatLogDate, formatTotalHours } from "./utils/time";

export default function App() {
  const [users, setUsers] = useState<User[]>(demoUsers);
  const [localPasswords, setLocalPasswords] = useState<Record<string, string>>({});
  const [user, setUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [language, setLanguage] = useState<Language>("en");
  const [activePage, setActivePage] = useState<AppPage>("dashboard");
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
  }

  function handleQuickCheckIn(nextUser: User) {
    startSessionForUser(nextUser);
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

  function handleLogout() {
    setAuthToken(null);
    setUser(null);
    setActivePage("dashboard");
  }

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onLogout={handleLogout} onNavigate={setActivePage} user={user} t={t} />
      <main className="workspace">
        <Topbar
          activePage={activePage}
          attendanceSession={attendanceSession}
          isAttendanceBusy={isAttendanceBusy}
          language={language}
          onAttendanceAction={attendanceSession.status === "working" ? handleCheckOut : handleCheckIn}
          onLanguageChange={setLanguage}
          onLogout={handleLogout}
          onOpenProfile={() => setActivePage("profile")}
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
          />
        )}
        {activePage === "attendanceLogs" && <AttendanceLogsPage authToken={authToken} logs={logs} onLogsChange={setLogs} t={t} user={user} />}
        {activePage === "profile" && <ProfilePage t={t} user={user} />}
        {activePage !== "dashboard" && activePage !== "attendanceLogs" && activePage !== "profile" && (
          <section className="placeholder-page">
            <h3>{t[activePage]}</h3>
            <p>{t.pageComingSoon}</p>
          </section>
        )}
      </main>
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
