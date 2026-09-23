import { FormEvent, useState } from "react";
import type { Language, Translation } from "../i18n";
import { BuildingIcon } from "./icons";

type ResetPasswordPageProps = {
  language: Language;
  onLanguageChange: (language: Language) => void;
  onReset: (password: string, confirmPassword: string) => Promise<void>;
  onComplete: () => void;
  t: Translation;
};

export function ResetPasswordPage({ language, onLanguageChange, onReset, onComplete, t }: ResetPasswordPageProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 6) { setError(t.passwordMinLength); return; }
    if (password !== confirmPassword) { setError(t.passwordMismatch); return; }
    setError("");
    setIsSubmitting(true);
    try {
      await onReset(password, confirmPassword);
      setComplete(true);
      setPassword("");
      setConfirmPassword("");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : t.resetPasswordFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card reset-password-card">
        <div className="auth-brand">
          <div className="brand-mark"><BuildingIcon /></div>
          <div><h1>Workforce Pro</h1><p>{t.authSubtitle}</p></div>
        </div>
        <div className="auth-top-row">
          <div className="language-switch auth-language" aria-label={t.language}>
            <button className={language === "en" ? "active" : ""} type="button" onClick={() => onLanguageChange("en")}>{t.english}</button>
            <button className={language === "vi" ? "active" : ""} type="button" onClick={() => onLanguageChange("vi")}>{t.vietnamese}</button>
          </div>
        </div>
        {complete ? (
          <div className="reset-password-result" role="status">
            <h2>{t.resetPasswordComplete}</h2>
            <p>{t.resetPasswordCompleteHint}</p>
            <button className="primary-button" type="button" onClick={onComplete}>{t.backToLogin}</button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-section-heading"><h2>{t.createNewPassword}</h2><p>{t.createNewPasswordHint}</p></div>
            <label>{t.password}<div className="password-input-control"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required /><button className="password-visibility-button" type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((current) => !current)}>👁</button></div></label>
            <label>{t.confirmPassword}<input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></label>
            {error && <p className="form-message auth-form-message error" role="alert">{error}</p>}
            <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? t.resettingPassword : t.resetPassword}</button>
          </form>
        )}
      </section>
    </main>
  );
}