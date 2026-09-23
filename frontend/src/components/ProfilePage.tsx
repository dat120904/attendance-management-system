import { FormEvent, useState } from "react";
import { changePassword } from "../api";
import type { Translation } from "../i18n";
import type { User } from "../types";
import { translateDepartment, translateRole } from "../utils/localize";

type ProfilePageProps = { authToken: string; t: Translation; user: User };

export function ProfilePage({ authToken, t, user }: ProfilePageProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [isError, setIsError] = useState(false);

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword.length < 6) { setIsError(true); setNotice(t.passwordMinLength); return; }
    if (newPassword !== confirmPassword) { setIsError(true); setNotice(t.passwordMismatch); return; }
    setIsSubmitting(true); setNotice(""); setIsError(false);
    try {
      await changePassword(authToken, currentPassword, newPassword, confirmPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setNotice(t.passwordChanged);
    } catch (error) {
      setIsError(true);
      setNotice(error instanceof Error ? error.message : t.changePasswordFailed);
    } finally { setIsSubmitting(false); }
  }

  return (
    <section className="profile-page page-stack">
      <div className="page-heading"><div><h3>{t.myProfile}</h3><p>{t.profilePreview}</p></div></div>
      <div className="profile-grid">
        <section className="profile-panel"><div className="profile-avatar-large">{user.name.charAt(0)}</div><div><h4>{user.name}</h4><p>{user.email}</p><span className="badge muted">{translateRole(user.role, t)}</span></div></section>
        <section className="profile-panel profile-form-panel">
          <h4>{t.accountInformation}</h4>
          <div className="profile-fields">
            <label>{t.fullName}<input value={user.name} readOnly /></label>
            <label>{t.email}<input value={user.email} readOnly /></label>
            <label>{t.role}<input value={translateRole(user.role, t)} readOnly /></label>
            <label>{t.department}<input value={translateDepartment(user.subtitle, t)} readOnly /></label>
          </div>
        </section>
        <section className="profile-panel profile-form-panel">
          <h4>{t.changePassword}</h4>
          <form className="profile-password-form" onSubmit={handlePasswordChange}>
            <div className="profile-fields">
              <label>{t.currentPassword}<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label>
              <label>{t.newPassword}<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required /></label>
              <label>{t.confirmPassword}<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></label>
            </div>
            {notice && <p className={`form-message auth-form-message ${isError ? "error" : "success"}`} role="status">{notice}</p>}
            <button className="primary-button" type="submit" disabled={isSubmitting}>{isSubmitting ? t.savingChanges : t.savePassword}</button>
          </form>
        </section>
      </div>
    </section>
  );
}