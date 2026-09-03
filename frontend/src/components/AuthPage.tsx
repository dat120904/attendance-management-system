import { FormEvent, useState } from "react";
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
  onNewEmployeeCheckIn: (name: string) => void;
  onQuickCheckIn: (user: User) => void;
  onRegister: (form: RegisterForm) => Promise<{ ok: boolean; message?: string }>;
  t: Translation;
  users: User[];
};

export function AuthPage({ language, onLanguageChange, onLogin, onNewEmployeeCheckIn, onQuickCheckIn, onRegister, t, users }: AuthPageProps) {
  const [selectedEmail, setSelectedEmail] = useState(users[0]?.email ?? "");
  const [password, setPassword] = useState("password");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [forgotEmail, setForgotEmail] = useState(users[0]?.email ?? "");
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    name: "",
    email: "",
    role: "Employee",
    department: "",
    password: "",
    confirmPassword: ""
  });
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const result = await onLogin(selectedEmail, password);
    if (!result.ok) {
      setMessage(result.message ?? "Login failed");
    }
  }

  function handleNewEmployeeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNewEmployeeCheckIn(newEmployeeName);
    setNewEmployeeName("");
  }

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await onRegister(registerForm);
    if (!result.ok) {
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
              <div className="employee-list">
                {users.map((user) => (
                  <article className="employee-row" key={user.id}>
                    <div className="employee-avatar">{user.name.charAt(0)}</div>
                    <div>
                      <strong>{user.name}</strong>
                      <span>{translateRole(user.role, t)} - {user.email}</span>
                    </div>
                    <button type="button" onClick={() => onQuickCheckIn(user)}>
                      {t.checkIn}
                    </button>
                  </article>
                ))}
              </div>
            </div>

            <form className="auth-form new-employee-form" onSubmit={handleNewEmployeeSubmit}>
              <label>
                {t.newEmployeeName}
                <input value={newEmployeeName} onChange={(event) => setNewEmployeeName(event.target.value)} placeholder={t.newEmployeePlaceholder} />
              </label>
              <button className="primary-button" type="submit">
                {t.checkInNewEmployee}
              </button>
            </form>

            <form className="auth-form role-login-form" onSubmit={handleSubmit}>
              <div className="form-section-heading">
                <h2>{t.accountLogin}</h2>
                <p>{t.accountLoginHint}</p>
              </div>
              <label>
                {t.email}
                <select value={selectedEmail} onChange={(event) => setSelectedEmail(event.target.value)}>
                  {users.map((user) => (
                    <option value={user.email} key={user.id}>
                      {user.email} - {translateRole(user.role, t)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t.password}
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
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
                      <div>
                        <h2>{t.forgotPasswordQuestion}</h2>
                        <p>{t.forgotPasswordHint}</p>
                      </div>
                      <button className="modal-close" type="button" aria-label={t.close} onClick={() => setIsForgotOpen(false)}>
                        ×
                      </button>
                    </div>
                    <label>
                      {t.email}
                      <input type="email" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} placeholder={t.email} />
                    </label>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        setMessage(t.resetReady);
                        setIsForgotOpen(false);
                      }}
                    >
                      {t.sendResetLink}
                    </button>
                  </section>
                </div>
              )}
              {message && <p className="form-message">{message}</p>}
              <button className="secondary-button" type="submit">
                {t.login}
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
                      ×
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
                      {t.role}
                      <select value={registerForm.role} onChange={(event) => setRegisterForm((current) => ({ ...current, role: event.target.value as User["role"] }))}>
                        <option value="Employee">{t.employeeRole}</option>
                        <option value="Manager">{t.managerRole}</option>
                        <option value="HR">{t.hrRole}</option>
                        <option value="Payroll">{t.payrollRole}</option>
                      </select>
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
    </main>
  );
}
