import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchQuickAttendanceEmployees } from "../api";
import type { QuickAttendanceEmployee, QuickAttendanceResult } from "../api";
import type { User } from "../types";
import { translateRole } from "../utils/localize";
import type { Language, Translation } from "../i18n";
import { DocumentIcon, SearchIcon, EyeIcon, EyeOffIcon } from "./icons";

type RegisterForm = {
  name: string;
  email: string;
  role: User["role"];
  department: string;
  password: string;
  confirmPassword: string;
};

type AuthPageProps = {
  language: Language;
  onLanguageChange: (language: Language) => void;
  onLogin: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  onQuickAttendance: (employeeId: string, action: "check-in" | "check-out", phoneLast4: string, pin: string) => Promise<QuickAttendanceResult>;
  onForgotPassword: (email: string) => Promise<void>;
  onRegister: (form: RegisterForm) => Promise<{ ok: boolean; message?: string }>;
  t: Translation;
};

export function AuthPage({ language, onLanguageChange, onLogin, onQuickAttendance, onForgotPassword, onRegister, t }: AuthPageProps) {
  const [authTab, setAuthTab] = useState<"checkin" | "login">("login");
  const [selectedEmail, setSelectedEmail] = useState(() => {
    return localStorage.getItem("ams_remembered_email") || "";
  });
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem("ams_remember_me") === "true";
  });
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [quickUsers, setQuickUsers] = useState<QuickAttendanceEmployee[]>([]);
  const [quickSearch, setQuickSearch] = useState("");
  const [selectedQuickUser, setSelectedQuickUser] = useState<QuickAttendanceEmployee | null>(null);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [pin, setPin] = useState("");
  const [isQuickSubmitting, setIsQuickSubmitting] = useState(false);
  const [quickResult, setQuickResult] = useState<QuickAttendanceResult | null>(null);
  const [forgotEmail, setForgotEmail] = useState("");
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickCheckInError, setQuickCheckInError] = useState("");
  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    name: "",
    email: "",
    role: "Employee",
    department: "",
    password: "",
    confirmPassword: ""
  });
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setMessageTone("error");
    setIsSubmitting(true);

    try {
      const result = await onLogin(selectedEmail, password);
      if (!result.ok) {
        setMessageTone("error");
        setMessage(result.message ?? "Login failed");
      } else {
        if (rememberMe) {
          localStorage.setItem("ams_remember_me", "true");
          localStorage.setItem("ams_remembered_email", selectedEmail);
        } else {
          localStorage.removeItem("ams_remember_me");
          localStorage.removeItem("ams_remembered_email");
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchQuickAttendanceEmployees()
      .then((result) => {
        if (!cancelled) setQuickUsers(result.users);
      })
      .catch(() => {
        if (!cancelled) setQuickUsers([]);
      });
    return () => { cancelled = true; };
  }, []);

  const filteredQuickUsers = useMemo(() => {
    const query = quickSearch.trim().toLocaleLowerCase(language === "vi" ? "vi-VN" : "en-US");
    if (!query) return quickUsers;
    return quickUsers.filter((employee) => `${employee.name} ${employee.employeeCode}`.toLocaleLowerCase(language === "vi" ? "vi-VN" : "en-US").includes(query));
  }, [language, quickSearch, quickUsers]);

  function openQuickAttendance(employee: QuickAttendanceEmployee) {
    setSelectedQuickUser(employee);
    setPhoneLast4("");
    setPin("");
    setQuickCheckInError("");
    setQuickResult(null);
  }

  function closeQuickAttendance() {
    if (isQuickSubmitting) return;
    setSelectedQuickUser(null);
    setPhoneLast4("");
    setPin("");
    setQuickCheckInError("");
    setQuickResult(null);
  }

  async function handleQuickAttendanceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedQuickUser) return;
    if (!/^\d{4}$/.test(phoneLast4) || !/^\d{4,6}$/.test(pin)) {
      setQuickCheckInError(t.quickAttendanceValidation);
      return;
    }

    const action = selectedQuickUser.attendanceStatus === "working" ? "check-out" : "check-in";
    setQuickCheckInError("");
    setIsQuickSubmitting(true);
    try {
      const result = await onQuickAttendance(selectedQuickUser.id, action, phoneLast4, pin);
      setQuickResult(result);
      setQuickUsers((current) => current.map((employee) => employee.id === selectedQuickUser.id
        ? { ...employee, attendanceStatus: action === "check-in" ? "working" : "not-started" }
        : employee));
      setPhoneLast4("");
      setPin("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setQuickCheckInError(localizeQuickAttendanceError(message, t));
    } finally {
      setIsQuickSubmitting(false);
    }
  }

  async function handleForgotSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForgotError("");
    setIsForgotSubmitting(true);
    try {
      await onForgotPassword(forgotEmail.trim());
      setMessageTone("success");
      setMessage(t.resetReady);
      setForgotEmail("");
      setIsForgotOpen(false);
    } catch (error) {
      setForgotError(error instanceof Error ? error.message : t.resetRequestFailed);
    } finally {
      setIsForgotSubmitting(false);
    }
  }

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await onRegister(registerForm);
    if (!result.ok) {
      setMessageTone("error");
      setMessage(result.message ?? t.registerFailed);
      return;
    }

    setMessage("");
    setIsRegisterOpen(false);
    setRegisterForm({
      name: "",
      email: "",
      role: "Employee",
      department: "",
      password: "",
      confirmPassword: ""
    });
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        {/* Header */}
        <div className="auth-header">
          <div className="auth-header-left">
            <div className="auth-brand-icon">
              <DocumentIcon />
            </div>
            <div className="auth-brand-info">
              <h1>Workforce Pro</h1>
              <p>{t.authSubtitle}</p>
            </div>
          </div>
          <div className="auth-lang-pill" role="group" aria-label={t.language}>
            <button
              type="button"
              className={language === "en" ? "active" : ""}
              onClick={() => onLanguageChange("en")}
            >
              EN
            </button>
            <button
              type="button"
              className={language === "vi" ? "active" : ""}
              onClick={() => onLanguageChange("vi")}
            >
              VI
            </button>
          </div>
        </div>

        {/* Tab navigation bar */}
        <div className="auth-nav-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={authTab === "checkin"}
            className={`auth-nav-tab ${authTab === "checkin" ? "active" : ""}`}
            onClick={() => setAuthTab("checkin")}
          >
            {t.quickCheckIn}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={authTab === "login"}
            className={`auth-nav-tab ${authTab === "login" ? "active" : ""}`}
            onClick={() => setAuthTab("login")}
          >
            {t.accountLogin}
          </button>
        </div>

        {/* Tab content: Quick Check-in */}
        {authTab === "checkin" && (
          <div className="auth-panel" role="tabpanel">
            <p className="auth-panel-intro">{t.quickCheckInDesc}</p>
            <div className="auth-field-group">
              <label htmlFor="quick-search-input" className="auth-label">
                {t.findEmployeeRecord}
              </label>
              <div className="auth-search-wrapper">
                <SearchIcon className="auth-search-icon" />
                <input
                  id="quick-search-input"
                  type="text"
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  placeholder={t.searchEmployeePlaceholder}
                  autoComplete="off"
                />
              </div>
            </div>

            {!quickSearch.trim() ? (
              <div className="auth-empty-container">
                <p>{t.enterDetailsToFindRecord}</p>
              </div>
            ) : (
              <div className="employee-list">
                {filteredQuickUsers.map((employee) => (
                  <article className="employee-row" key={employee.id}>
                    <div className="employee-avatar">{employee.name.charAt(0)}</div>
                    <div>
                      <strong>{employee.name}</strong>
                      <span>{translateRole(employee.role, t)}{employee.employeeCode ? ` - ${employee.employeeCode}` : ""}</span>
                    </div>
                    <button type="button" onClick={() => openQuickAttendance(employee)}>
                      {employee.attendanceStatus === "working" ? t.checkOut : t.checkIn}
                    </button>
                  </article>
                ))}
                {!filteredQuickUsers.length && (
                  <div className="auth-empty-container">
                    <p>{t.noEmployees}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab content: Account Login */}
        {authTab === "login" && (
          <div className="auth-panel" role="tabpanel">
            <form className="auth-form-card" onSubmit={handleSubmit}>
              <div className="auth-field-group">
                <label htmlFor="login-email" className="auth-label">
                  {t.emailAddress}
                </label>
                <input
                  id="login-email"
                  type="email"
                  value={selectedEmail}
                  onChange={(e) => setSelectedEmail(e.target.value)}
                  placeholder="admin@workforce.com"
                  autoComplete="email"
                  className="auth-input"
                  required
                />
              </div>

              <div className="auth-field-group">
                <label htmlFor="login-password" className="auth-label">
                  {t.password}
                </label>
                <div className="auth-password-wrapper">
                  <input
                    id="login-password"
                    type={isPasswordVisible ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="auth-input auth-password-input"
                    required
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                    onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                  >
                    {isPasswordVisible ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>

              <div className="auth-actions-row">
                <label className="auth-remember-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>{t.rememberMe}</span>
                </label>
                <button
                  type="button"
                  className="auth-forgot-link"
                  onClick={() => setIsForgotOpen(true)}
                >
                  {t.forgotPasswordQuestion}
                </button>
              </div>

              {message && (
                <p className={`form-message auth-form-message ${messageTone}`} role="alert">
                  {message}
                </p>
              )}

              <button
                type="submit"
                className="auth-login-button"
                disabled={isSubmitting}
              >
                {isSubmitting ? `${t.login}...` : t.login}
              </button>

              <div className="auth-footer-link">
                <span>{t.needAnAccount} </span>
                <button
                  type="button"
                  className="auth-contact-hr-btn"
                  onClick={() => setIsRegisterOpen(true)}
                >
                  {t.contactHr}
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      {/* Forgot Password Modal */}
      {isForgotOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="forgot-modal" role="dialog" aria-modal="true" aria-label={t.forgotPasswordQuestion}>
            <div className="modal-header">
              <div>
                <h2>{t.forgotPasswordQuestion}</h2>
                <p>{t.forgotPasswordHint}</p>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label={t.close}
                onClick={() => {
                  if (!isForgotSubmitting) {
                    setIsForgotOpen(false);
                    setForgotError("");
                  }
                }}
              >
                ×
              </button>
            </div>
            <form className="auth-form modal-form" onSubmit={handleForgotSubmit}>
              <label>
                {t.email}
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  placeholder={t.email}
                  autoComplete="email"
                  required
                />
              </label>
              {forgotError && <p className="form-message auth-form-message error" role="alert">{forgotError}</p>}
              <button className="primary-button" type="submit" disabled={isForgotSubmitting}>
                {isForgotSubmitting ? t.sendingResetLink : t.sendResetLink}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* Register / Contact HR Modal */}
      {isRegisterOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="forgot-modal register-modal" role="dialog" aria-modal="true" aria-label={t.registerAccount}>
            <div className="modal-header">
              <div>
                <h2>{t.registerAccount}</h2>
                <p>{t.registerHint}</p>
              </div>
              <button className="modal-close" type="button" aria-label={t.close} onClick={() => setIsRegisterOpen(false)}>
                ×
              </button>
            </div>
            <form className="auth-form modal-form" onSubmit={handleRegisterSubmit}>
              <label>
                {t.fullName}
                <input value={registerForm.name} onChange={(event) => setRegisterForm((current) => ({ ...current, name: event.target.value }))} placeholder={t.fullNamePlaceholder} required />
              </label>
              <label>
                {t.email}
                <input type="email" value={registerForm.email} onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@workforce.local" required />
              </label>
              <label>
                {t.department}
                <input value={registerForm.department} onChange={(event) => setRegisterForm((current) => ({ ...current, department: event.target.value }))} placeholder={t.departmentPlaceholder} required />
              </label>
              <label>
                {t.password}
                <input type="password" value={registerForm.password} onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))} required />
              </label>
              <label>
                {t.confirmPassword}
                <input type="password" value={registerForm.confirmPassword} onChange={(event) => setRegisterForm((current) => ({ ...current, confirmPassword: event.target.value }))} required />
              </label>
              <button className="primary-button" type="submit">
                {t.createAccount}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* Quick Check-in Verification Modal */}
      {selectedQuickUser && (
        <div className="modal-backdrop" role="presentation">
          <section className="forgot-modal quick-checkin-modal" role="dialog" aria-modal="true" aria-labelledby="quick-attendance-title">
            <div className="modal-header">
              <div>
                <h2 id="quick-attendance-title">{quickResult ? t.quickAttendanceSuccessTitle : t.quickAttendanceConfirm}</h2>
                <p>{selectedQuickUser.name} - {selectedQuickUser.employeeCode}</p>
              </div>
              <button className="modal-close" type="button" aria-label={t.close} onClick={closeQuickAttendance}>×</button>
            </div>
            {quickResult ? (
              <div className="quick-attendance-success" role="status">
                <strong>{quickResult.data.action === "check-in" ? t.checkInSuccess : t.checkOutSuccess}</strong>
                <span>{new Intl.DateTimeFormat(language === "vi" ? "vi-VN" : "en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(quickResult.data.occurredAt))}</span>
                <button className="primary-button" type="button" onClick={closeQuickAttendance}>{t.done}</button>
              </div>
            ) : (
              <form className="auth-form quick-attendance-form" onSubmit={handleQuickAttendanceSubmit}>
                <label>
                  {t.phoneLast4}
                  <input inputMode="numeric" autoComplete="off" maxLength={4} value={phoneLast4} onChange={(event) => setPhoneLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" required />
                </label>
                <label>
                  {t.personalPin}
                  <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="****" required />
                </label>
                {quickCheckInError && <p className="form-message quick-checkin-error" role="alert">{quickCheckInError}</p>}
                <div className="confirmation-actions">
                  <button className="secondary-button" type="button" onClick={closeQuickAttendance} disabled={isQuickSubmitting}>{t.cancel}</button>
                  <button className="primary-button" type="submit" disabled={isQuickSubmitting}>
                    {isQuickSubmitting ? t.quickAttendanceSubmitting : selectedQuickUser.attendanceStatus === "working" ? t.confirmCheckOut : t.confirmCheckIn}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </main>
  );
}

function localizeQuickAttendanceError(message: string, t: Translation) {
  if (message.includes("Too many attempts")) return t.quickAttendanceRateLimited;
  if (message.includes("Active attendance session")) return t.duplicateCheckIn;
  if (message.includes("No active attendance session")) return t.checkOutWithoutCheckIn;
  if (message.includes("opens at")) return t.checkInTooEarly.replace("{time}", message.split("opens at ")[1] ?? "");
  if (message.includes("closed after")) return t.checkInClosed.replace("{time}", message.split("after ")[1] ?? "");
  if (message.includes("scheduled workday")) return t.checkInDayOff;
  if (message.includes("holiday")) return t.checkInHoliday;
  return t.quickAttendanceInvalid;
}
