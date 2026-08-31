import { FormEvent, useState } from "react";
import type { User } from "../types";
import type { Language, Translation } from "../i18n";
import { BuildingIcon } from "./icons";

type AuthMode = "login" | "profile" | "password";

type AuthPageProps = {
  language: Language;
  onLanguageChange: (language: Language) => void;
  onLogin: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  onNewEmployeeCheckIn: (name: string) => void;
  onQuickCheckIn: (user: User) => void;
  t: Translation;
  users: User[];
};

export function AuthPage({ language, onLanguageChange, onLogin, onNewEmployeeCheckIn, onQuickCheckIn, t, users }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [selectedEmail, setSelectedEmail] = useState(users[0]?.email ?? "");
  const [password, setPassword] = useState("password");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [forgotEmail, setForgotEmail] = useState(users[0]?.email ?? "");
  const [isForgotOpen, setIsForgotOpen] = useState(false);
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

        <div className="auth-tabs" role="tablist" aria-label={t.accountActions}>
          <button className={mode === "login" ? "selected" : ""} type="button" onClick={() => setMode("login")}>
            {t.login}
          </button>
          <button className={mode === "profile" ? "selected" : ""} type="button" onClick={() => setMode("profile")}>
            {t.profile}
          </button>
        </div>

        {mode === "login" && (
          <div className="checkin-station">
            <div className="employee-section">
              <h2>{t.employeeList}</h2>
              <p>{t.employeeListHint}</p>
              <div className="employee-list">
                {users.map((user) => (
                  <article className="employee-row" key={user.id}>
                    <div className="employee-avatar">{user.name.charAt(0)}</div>
                    <div>
                      <strong>{user.name}</strong>
                      <span>{user.role} - {user.email}</span>
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
              <label>
                {t.email}
                <select value={selectedEmail} onChange={(event) => setSelectedEmail(event.target.value)}>
                  {users.map((user) => (
                    <option value={user.email} key={user.id}>
                      {user.email} - {user.role}
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
            </form>
          </div>
        )}

        {mode === "profile" && (
          <div className="profile-preview">
            <h2>{t.myProfile}</h2>
            <p>{t.profilePreview}</p>
            <button className="primary-button" type="button" onClick={() => setMode("password")}>
              {t.changePassword}
            </button>
          </div>
        )}

        {mode === "password" && (
          <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              {t.currentPassword}
              <input type="password" />
            </label>
            <label>
              {t.newPassword}
              <input type="password" />
            </label>
            <button className="primary-button" type="button" onClick={() => setMode("profile")}>
              {t.savePassword}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
