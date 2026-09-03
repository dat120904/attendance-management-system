import type { Translation } from "../i18n";
import type { User } from "../types";
import { translateDepartment, translateRole } from "../utils/localize";

type ProfilePageProps = {
  t: Translation;
  user: User;
};

export function ProfilePage({ t, user }: ProfilePageProps) {
  return (
    <section className="profile-page page-stack">
      <div className="page-heading">
        <div>
          <h3>{t.myProfile}</h3>
          <p>{t.profilePreview}</p>
        </div>
      </div>

      <div className="profile-grid">
        <section className="profile-panel">
          <div className="profile-avatar-large">{user.name.charAt(0)}</div>
          <div>
            <h4>{user.name}</h4>
            <p>{user.email}</p>
            <span className="badge muted">{translateRole(user.role, t)}</span>
          </div>
        </section>

        <section className="profile-panel profile-form-panel">
          <h4>{t.accountInformation}</h4>
          <div className="profile-fields">
            <label>
              {t.fullName}
              <input value={user.name} readOnly />
            </label>
            <label>
              {t.email}
              <input value={user.email} readOnly />
            </label>
            <label>
              {t.role}
              <input value={translateRole(user.role, t)} readOnly />
            </label>
            <label>
              {t.department}
              <input value={translateDepartment(user.subtitle, t)} readOnly />
            </label>
          </div>
        </section>

        <section className="profile-panel profile-form-panel">
          <h4>{t.changePassword}</h4>
          <div className="profile-fields">
            <label>
              {t.currentPassword}
              <input type="password" />
            </label>
            <label>
              {t.newPassword}
              <input type="password" />
            </label>
          </div>
          <button className="primary-button" type="button">
            {t.savePassword}
          </button>
        </section>
      </div>
    </section>
  );
}
