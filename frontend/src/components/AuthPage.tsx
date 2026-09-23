import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchQuickAttendanceEmployees } from "../api";
import type { QuickAttendanceEmployee, QuickAttendanceResult } from "../api";
import type { User } from "../types";
import { translateRole } from "../utils/localize";
import type { Language, Translation } from "../i18n";
import { BuildingIcon } from "./icons";

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
  const [selectedEmail, setSelectedEmail] = useState("");
  const [password, setPassword] = useState("");
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
        <div className="auth-brand">
          <div className="brand-mark">
            <BuildingIcon />
          </div>
          <div>
            <h1>Workforce Pro</h1>
            <p>{t.authSubtitle}</p>
          </div>
        </div>

        <div className="auth-top-row">
          <div className="language-switch auth-language" aria-label={t.language}>
            <button className={language === "en" ? "active" : ""} type="button" onClick={() => onLanguageChange("en")}>
              {t.english}
            </button>
            <button className={language === "vi" ? "active" : ""} type="button" onClick={() => onLanguageChange("vi")}>
              {t.vietnamese}
            </button>
          </div>
        </div>

        <div className="checkin-station">
            <div className="employee-section">
              <h2>{t.quickCheckIn}</h2>
              <p>{t.employeeListHint}</p>
              <label className="quick-employee-search">
                <span>{t.searchEmployee}</span>
                <input value={quickSearch} onChange={(event) => setQuickSearch(event.target.value)} placeholder={t.searchEmployeePlaceholder} />
              </label>
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
                {!filteredQuickUsers.length && <p className="quick-empty-state">{t.noEmployees}</p>}
              </div>
            </div>

            <form className="auth-form role-login-form" onSubmit={handleSubmit}>
              <div className="form-section-heading">
                <h2>{t.accountLogin}</h2>
              </div>
              <label>
                {t.email}
                <input type="email" value={selectedEmail} onChange={(event) => setSelectedEmail(event.target.value)} autoComplete="email" required />
              </label>
              <label>
                {t.password}
                <div className="password-input-control">
                  <input type={isPasswordVisible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
                  <button className="password-visibility-button" type="button" aria-label={isPasswordVisible ? "Hide password" : "Show password"} title={isPasswordVisible ? "Hide password" : "Show password"} onClick={() => setIsPasswordVisible((current) => !current)}>
                    {"\u{1F441}"}
                  </button>
                </div>
              </label>
              <div className="login-helper-row">
                <button className="link-button" type="button" onClick={() => setIsForgotOpen((current) => !current)}>
                  {t.forgotPasswordQuestion}
                </button>
              </div>
              {isForgotOpen && (
                <div className="modal-backdrop" role="presentation">
                  <section className="forgot-modal" role="dialog" aria-modal="true" aria-label={t.forgotPasswordQuestion}>
                    <div className="modal-header">
                      <div><h2>{t.forgotPasswordQuestion}</h2><p>{t.forgotPasswordHint}</p></div>
                      <button className="modal-close" type="button" aria-label={t.close} onClick={() => { if (!isForgotSubmitting) { setIsForgotOpen(false); setForgotError(""); } }}>x</button>
                    </div>
                    <form className="auth-form modal-form" onSubmit={handleForgotSubmit}>
                      <label>{t.email}<input type="email" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} placeholder={t.email} autoComplete="email" required /></label>
                      {forgotError && <p className="form-message auth-form-message error" role="alert">{forgotError}</p>}
                      <button className="primary-button" type="submit" disabled={isForgotSubmitting}>{isForgotSubmitting ? t.sendingResetLink : t.sendResetLink}</button>
                    </form>
                  </section>
                </div>
              )}              {message && <p className={`form-message auth-form-message ${messageTone}`} role="alert">{message}</p>}
              <button className="secondary-button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? `${t.login}...` : t.login}
              </button>
              <div className="auth-footer">
                <span>{t.noAccount}</span>
                <button className="link-button" type="button" onClick={() => setIsRegisterOpen(true)}>
                  {t.registerAccount}
                </button>
              </div>
            </form>

            {isRegisterOpen && (
              <div className="modal-backdrop" role="presentation">
                <section className="forgot-modal register-modal" role="dialog" aria-modal="true" aria-label={t.registerAccount}>
                  <div className="modal-header">
                    <div>
                      <h2>{t.registerAccount}</h2>
                      <p>{t.registerHint}</p>
                    </div>
                    <button className="modal-close" type="button" aria-label={t.close} onClick={() => setIsRegisterOpen(false)}>
                      x
                    </button>
                  </div>
                  <form className="auth-form modal-form" onSubmit={handleRegisterSubmit}>
                    <label>
                      {t.fullName}
                      <input value={registerForm.name} onChange={(event) => setRegisterForm((current) => ({ ...current, name: event.target.value }))} placeholder={t.fullNamePlaceholder} />
                    </label>
                    <label>
                      {t.email}
                      <input type="email" value={registerForm.email} onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@workforce.local" />
                    </label>
                    <label>
                      {t.department}
                      <input value={registerForm.department} onChange={(event) => setRegisterForm((current) => ({ ...current, department: event.target.value }))} placeholder={t.departmentPlaceholder} />
                    </label>
                    <label>
                      {t.password}
                      <input type="password" value={registerForm.password} onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))} />
                    </label>
                    <label>
                      {t.confirmPassword}
                      <input type="password" value={registerForm.confirmPassword} onChange={(event) => setRegisterForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
                    </label>
                    <button className="primary-button" type="submit">
                      {t.createAccount}
                    </button>
                  </form>
                </section>
              </div>
            )}
          </div>
      </section>
      {selectedQuickUser && (
        <div className="modal-backdrop" role="presentation">
          <section className="forgot-modal quick-checkin-modal" role="dialog" aria-modal="true" aria-labelledby="quick-attendance-title">
            <div className="modal-header">
              <div>
                <h2 id="quick-attendance-title">{quickResult ? t.quickAttendanceSuccessTitle : t.quickAttendanceConfirm}</h2>
                <p>{selectedQuickUser.name} - {selectedQuickUser.employeeCode}</p>
              </div>
              <button className="modal-close" type="button" aria-label={t.close} onClick={closeQuickAttendance}>x</button>
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
                  <input inputMode="numeric" autoComplete="off" maxLength={4} value={phoneLast4} onChange={(event) => setPhoneLast4(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" />
                </label>
                <label>
                  {t.personalPin}
                  <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="****" />
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
