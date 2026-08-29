import { FormEvent, useState } from "react";
import type { User } from "../types";
import { demoUsers } from "../data/mockData";
import type { Language, Translation } from "../i18n";
import { BuildingIcon } from "./icons";

type AuthMode = "login" | "forgot" | "reset" | "profile" | "password";

type AuthPageProps = {
  language: Language;
  onLanguageChange: (language: Language) => void;
  onLogin: (user: User) => void;
  t: Translation;
};

export function AuthPage({ language, onLanguageChange, onLogin, t }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [selectedEmail, setSelectedEmail] = useState(demoUsers[4].email);
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const user = demoUsers.find((item) => item.email === selectedEmail) ?? demoUsers[0];
    setMessage("");
    onLogin(user);
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
          <button className={mode === "forgot" ? "selected" : ""} type="button" onClick={() => setMode("forgot")}>
            {t.forgot}
          </button>
          <button className={mode === "profile" ? "selected" : ""} type="button" onClick={() => setMode("profile")}>
            {t.profile}
          </button>
        </div>

        {mode === "login" && (
          <form className="auth-form" onSubmit={handleSubmit}>
            <label>
              {t.email}
              <select value={selectedEmail} onChange={(event) => setSelectedEmail(event.target.value)}>
                {demoUsers.map((user) => (
                  <option value={user.email} key={user.id}>
                    {user.email} - {user.role}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t.password}
              <input type="password" defaultValue="password" />
            </label>
            <button className="primary-button" type="submit">
              {t.login}
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form
            className="auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              setMessage(t.resetReady);
              setMode("reset");
            }}
          >
            <label>
              {t.email}
              <input type="email" defaultValue={selectedEmail} />
            </label>
            <button className="primary-button" type="submit">
              {t.sendResetLink}
            </button>
          </form>
        )}

        {mode === "reset" && (
          <form className="auth-form" onSubmit={(event) => event.preventDefault()}>
            <p className="form-message">{message}</p>
            <label>
              {t.newPassword}
              <input type="password" placeholder={t.enterNewPassword} />
            </label>
            <button className="primary-button" type="button" onClick={() => setMode("login")}>
              {t.resetPassword}
            </button>
          </form>
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
