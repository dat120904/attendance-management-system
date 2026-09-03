import { FormEvent, useEffect, useMemo, useState } from "react";
import { fetchSettings, updateSettings } from "../api";
import type { HolidaySetting, SystemSettings, User, UserRole, WorkScheduleSetting } from "../types";
import type { Translation } from "../i18n";
import { translateRole } from "../utils/localize";

type SettingsPageProps = {
  authToken: string | null;
  settings: SystemSettings;
  onSettingsChange: (settings: SystemSettings) => void;
  t: Translation;
  user: User;
};

const roleOptions: UserRole[] = ["Employee", "Manager", "HR", "Payroll", "Admin"];
const tabKeys = ["attendance", "leave", "schedules", "holidays", "roles", "notifications", "payroll", "security", "integrations", "audit"] as const;
type SettingsTab = (typeof tabKeys)[number];

type SectionProps = {
  draft: SystemSettings;
  setDraft: (settings: SystemSettings) => void;
  t: Translation;
  disabled: boolean;
};

export function SettingsPage({ authToken, settings, onSettingsChange, t, user }: SettingsPageProps) {
  const [draft, setDraft] = useState<SystemSettings>(settings);
  const [activeTab, setActiveTab] = useState<SettingsTab>(firstAllowedTab(user.role));
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const visibleTabs = useMemo(() => tabKeys.filter((tab) => canViewTab(user.role, tab)), [user.role]);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    if (visibleTabs.includes(activeTab)) return;
    setActiveTab(visibleTabs[0] ?? "notifications");
  }, [activeTab, visibleTabs]);

  useEffect(() => {
    if (!authToken) return;
    let active = true;
    setIsLoading(true);
    fetchSettings(authToken)
      .then(({ settings }) => {
        if (!active) return;
        setDraft(settings);
        onSettingsChange(settings);
        setError("");
      })
      .catch((err) => {
        if (!active) return;
        setError(`${t.settingsBackendFallback} ${err instanceof Error ? err.message : ""}`.trim());
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authToken, user.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEditTab(user.role, activeTab)) {
      setError(t.settingsDenied);
      return;
    }
    const validation = validateSettings(draft, t);
    if (validation) {
      setError(validation);
      return;
    }

    const normalized = normalizeSettings(draft);
    try {
      const nextSettings = authToken ? (await updateSettings(authToken, normalized)).settings : normalized;
      setDraft(nextSettings);
      onSettingsChange(nextSettings);
      setNotice(t.settingsSaved);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.settingsDenied);
    }
  }

  function addSchedule() {
    const schedule: WorkScheduleSetting = { id: `schedule-${Date.now()}`, name: "Standard", startTime: draft.attendancePolicy.standardStartTime, endTime: draft.attendancePolicy.standardEndTime, breakMinutes: 60, workDays: [1, 2, 3, 4, 5] };
    setDraft((current) => ({ ...current, workSchedules: [...current.workSchedules, schedule] }));
  }

  function addHoliday() {
    const today = new Date().toISOString().slice(0, 10);
    const holiday: HolidaySetting = { id: `holiday-${Date.now()}`, name: t.holidayName, startDate: today, endDate: today, paid: true };
    setDraft((current) => ({ ...current, holidays: [...current.holidays, holiday] }));
  }

  const editable = canEditTab(user.role, activeTab);

  return (
    <section className="settings-page page-stack">
      <div className="page-heading">
        <div>
          <h3>{t.settings}</h3>
          <p>{t.settingsScope}</p>
        </div>
      </div>

      {isLoading && <div className="attendance-toast success">{t.loadingSettings}</div>}
      {notice && <div className="attendance-toast success">{notice}</div>}
      {error && <div className="attendance-toast warning">{error}</div>}

      <div className="settings-layout">
        <aside className="settings-tabs detail-card">
          {visibleTabs.map((tab) => <button className={activeTab === tab ? "active" : ""} key={tab} type="button" onClick={() => setActiveTab(tab)}>{tabLabel(tab, t)}</button>)}
        </aside>

        <form className="settings-panel" onSubmit={handleSubmit}>
          <div className="payroll-summary-head">
            <div>
              <span>{t.settings}</span>
              <h4>{tabLabel(activeTab, t)}</h4>
              <p>{editable ? t.saveSettings : t.readOnlySettings}</p>
            </div>
            <strong className="payroll-status">{translateRole(user.role, t)}</strong>
          </div>

          {activeTab === "attendance" && <AttendancePolicySection draft={draft} setDraft={setDraft} t={t} disabled={!editable} />}
          {activeTab === "leave" && <LeavePolicySection draft={draft} setDraft={setDraft} t={t} disabled={!editable} />}
          {activeTab === "schedules" && <SchedulesSection draft={draft} setDraft={setDraft} t={t} disabled={!editable} onAdd={addSchedule} />}
          {activeTab === "holidays" && <HolidaysSection draft={draft} setDraft={setDraft} t={t} disabled={!editable} onAdd={addHoliday} />}
          {activeTab === "roles" && <RolesSection draft={draft} setDraft={setDraft} t={t} disabled={!editable} />}
          {activeTab === "notifications" && <NotificationsSection draft={draft} setDraft={setDraft} t={t} disabled={!editable} />}
          {activeTab === "payroll" && <PayrollExportSection draft={draft} setDraft={setDraft} t={t} disabled={!editable} />}
          {activeTab === "security" && <SecuritySection draft={draft} setDraft={setDraft} t={t} disabled={!editable} />}
          {activeTab === "integrations" && <IntegrationsSection draft={draft} setDraft={setDraft} t={t} disabled={!editable} />}
          {activeTab === "audit" && <AuditSection draft={draft} setDraft={setDraft} t={t} disabled={!editable} />}

          <div className="detail-actions settings-actions">
            <button type="submit" disabled={!editable}>{t.saveSettings}</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function AttendancePolicySection({ draft, setDraft, t, disabled }: SectionProps) {
  return <div className="settings-grid">
    <Field label={t.standardStartTime}><input disabled={disabled} type="time" value={draft.attendancePolicy.standardStartTime} onChange={(e) => setDraft({ ...draft, attendancePolicy: { ...draft.attendancePolicy, standardStartTime: e.target.value } })} /></Field>
    <Field label={t.standardEndTime}><input disabled={disabled} type="time" value={draft.attendancePolicy.standardEndTime} onChange={(e) => setDraft({ ...draft, attendancePolicy: { ...draft.attendancePolicy, standardEndTime: e.target.value } })} /></Field>
    <Field label={t.lateGraceMinutes}><input disabled={disabled} type="number" min="0" value={draft.attendancePolicy.lateGraceMinutes} onChange={(e) => setDraft({ ...draft, attendancePolicy: { ...draft.attendancePolicy, lateGraceMinutes: Number(e.target.value) } })} /></Field>
    <Field label={t.earlyLeaveGraceMinutes}><input disabled={disabled} type="number" min="0" value={draft.attendancePolicy.earlyLeaveGraceMinutes} onChange={(e) => setDraft({ ...draft, attendancePolicy: { ...draft.attendancePolicy, earlyLeaveGraceMinutes: Number(e.target.value) } })} /></Field>
    <Field label={t.overtimeAfterHoursSetting}><input disabled={disabled} type="number" min="1" value={draft.attendancePolicy.overtimeAfterHours} onChange={(e) => setDraft({ ...draft, attendancePolicy: { ...draft.attendancePolicy, overtimeAfterHours: Number(e.target.value) } })} /></Field>
    <Toggle label={t.requireLocation} checked={draft.attendancePolicy.requireLocation} disabled={disabled} onChange={(checked) => setDraft({ ...draft, attendancePolicy: { ...draft.attendancePolicy, requireLocation: checked } })} />
  </div>;
}

function LeavePolicySection({ draft, setDraft, t, disabled }: SectionProps) {
  return <div className="settings-grid">
    <Field label={t.defaultAnnualLeaveDays}><input disabled={disabled} type="number" min="0" value={draft.leavePolicy.defaultAnnualLeaveDays} onChange={(e) => setDraft({ ...draft, leavePolicy: { ...draft.leavePolicy, defaultAnnualLeaveDays: Number(e.target.value) } })} /></Field>
    <Toggle label={t.requireSickAttachment} checked={draft.leavePolicy.attachmentRequiredForSickLeave} disabled={disabled} onChange={(checked) => setDraft({ ...draft, leavePolicy: { ...draft.leavePolicy, attachmentRequiredForSickLeave: checked } })} />
    <Toggle label={t.requireHrApproval} checked={draft.leavePolicy.requireHrApproval} disabled={disabled} onChange={(checked) => setDraft({ ...draft, leavePolicy: { ...draft.leavePolicy, requireHrApproval: checked } })} />
    <Toggle label={t.blockAnnualLeaveOverBalance} checked={draft.leavePolicy.blockAnnualLeaveOverBalance} disabled={disabled} onChange={(checked) => setDraft({ ...draft, leavePolicy: { ...draft.leavePolicy, blockAnnualLeaveOverBalance: checked } })} />
  </div>;
}

function SchedulesSection({ draft, setDraft, t, disabled, onAdd }: SectionProps & { onAdd: () => void }) {
  return <div className="settings-list">
    {draft.workSchedules.map((schedule, index) => <div className="settings-row-card" key={schedule.id}>
      <Field label={t.scheduleName}><input disabled={disabled} value={schedule.name} onChange={(e) => updateSchedule(draft, setDraft, index, { name: e.target.value })} /></Field>
      <Field label={t.standardStartTime}><input disabled={disabled} type="time" value={schedule.startTime} onChange={(e) => updateSchedule(draft, setDraft, index, { startTime: e.target.value })} /></Field>
      <Field label={t.standardEndTime}><input disabled={disabled} type="time" value={schedule.endTime} onChange={(e) => updateSchedule(draft, setDraft, index, { endTime: e.target.value })} /></Field>
      <Field label={t.breakMinutes}><input disabled={disabled} type="number" min="0" value={schedule.breakMinutes} onChange={(e) => updateSchedule(draft, setDraft, index, { breakMinutes: Number(e.target.value) })} /></Field>
      <Field label={t.workDays}><input disabled={disabled} value={schedule.workDays.join(",")} onChange={(e) => updateSchedule(draft, setDraft, index, { workDays: parseWorkDays(e.target.value) })} /></Field>
    </div>)}
    <button className="secondary-button" type="button" disabled={disabled} onClick={onAdd}>{t.addSchedule}</button>
  </div>;
}

function HolidaysSection({ draft, setDraft, t, disabled, onAdd }: SectionProps & { onAdd: () => void }) {
  return <div className="settings-list">
    {draft.holidays.map((holiday, index) => <div className="settings-row-card" key={holiday.id}>
      <Field label={t.holidayName}><input disabled={disabled} value={holiday.name} onChange={(e) => updateHoliday(draft, setDraft, index, { name: e.target.value })} /></Field>
      <Field label={t.startDate}><input disabled={disabled} type="date" value={holiday.startDate} onChange={(e) => updateHoliday(draft, setDraft, index, { startDate: e.target.value })} /></Field>
      <Field label={t.endDate}><input disabled={disabled} type="date" value={holiday.endDate} onChange={(e) => updateHoliday(draft, setDraft, index, { endDate: e.target.value })} /></Field>
      <Toggle label={t.paidHoliday} checked={holiday.paid} disabled={disabled} onChange={(checked) => updateHoliday(draft, setDraft, index, { paid: checked })} />
    </div>)}
    <button className="secondary-button" type="button" disabled={disabled} onClick={onAdd}>{t.addHoliday}</button>
  </div>;
}

function RolesSection({ draft, setDraft, t, disabled }: SectionProps) {
  return <div className="settings-list">
    {roleOptions.map((role) => <Field label={translateRole(role, t)} key={role}><textarea disabled={disabled} rows={3} value={draft.roles[role].join(", ")} onChange={(e) => setDraft({ ...draft, roles: { ...draft.roles, [role]: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) } })} /></Field>)}
  </div>;
}

function NotificationsSection({ draft, setDraft, t, disabled }: SectionProps) {
  return <div className="settings-grid">
    <Toggle label={t.inAppNotifications} checked={draft.notifications.inAppEnabled} disabled={disabled} onChange={(checked) => setDraft({ ...draft, notifications: { ...draft.notifications, inAppEnabled: checked } })} />
    <Toggle label={t.emailNotifications} checked={draft.notifications.emailEnabled} disabled={disabled} onChange={(checked) => setDraft({ ...draft, notifications: { ...draft.notifications, emailEnabled: checked } })} />
    <Toggle label={t.managerDigest} checked={draft.notifications.managerDigestEnabled} disabled={disabled} onChange={(checked) => setDraft({ ...draft, notifications: { ...draft.notifications, managerDigestEnabled: checked } })} />
    <Toggle label={t.payrollReminder} checked={draft.notifications.payrollReminderEnabled} disabled={disabled} onChange={(checked) => setDraft({ ...draft, notifications: { ...draft.notifications, payrollReminderEnabled: checked } })} />
  </div>;
}

function PayrollExportSection({ draft, setDraft, t, disabled }: SectionProps) {
  return <div className="settings-grid">
    <Field label={t.defaultExportFormat}><select disabled={disabled} value={draft.payrollExport.defaultFormat} onChange={(e) => setDraft({ ...draft, payrollExport: { ...draft.payrollExport, defaultFormat: e.target.value as "excel" | "pdf" } })}><option value="excel">Excel</option><option value="pdf">PDF</option></select></Field>
    <Toggle label={t.includeWarningsInExport} checked={draft.payrollExport.includeWarnings} disabled={disabled} onChange={(checked) => setDraft({ ...draft, payrollExport: { ...draft.payrollExport, includeWarnings: checked } })} />
    <Toggle label={t.lockRequiresResolvedLogs} checked={draft.payrollExport.lockRequiresResolvedLogs} disabled={disabled} onChange={(checked) => setDraft({ ...draft, payrollExport: { ...draft.payrollExport, lockRequiresResolvedLogs: checked } })} />
  </div>;
}

function SecuritySection({ draft, setDraft, t, disabled }: SectionProps) {
  return <div className="settings-grid">
    <Field label={t.minimumPasswordLength}><input disabled={disabled} type="number" min="6" value={draft.security.minPasswordLength} onChange={(e) => setDraft({ ...draft, security: { ...draft.security, minPasswordLength: Number(e.target.value) } })} /></Field>
    <Field label={t.sessionTimeoutMinutes}><input disabled={disabled} type="number" min="15" value={draft.security.sessionTimeoutMinutes} onChange={(e) => setDraft({ ...draft, security: { ...draft.security, sessionTimeoutMinutes: Number(e.target.value) } })} /></Field>
    <Toggle label={t.allowSelfRegistration} checked={draft.security.allowSelfRegistration} disabled={disabled} onChange={(checked) => setDraft({ ...draft, security: { ...draft.security, allowSelfRegistration: checked } })} />
    <Toggle label={t.requireTwoFactor} checked={draft.security.requireTwoFactor} disabled={disabled} onChange={(checked) => setDraft({ ...draft, security: { ...draft.security, requireTwoFactor: checked } })} />
  </div>;
}

function IntegrationsSection({ draft, setDraft, t, disabled }: SectionProps) {
  return <div className="settings-grid">
    <Field label={t.calendarProvider}><input disabled={disabled} value={draft.integrations.calendarProvider} onChange={(e) => setDraft({ ...draft, integrations: { ...draft.integrations, calendarProvider: e.target.value } })} /></Field>
    <Field label={t.payrollProvider}><input disabled={disabled} value={draft.integrations.payrollProvider} onChange={(e) => setDraft({ ...draft, integrations: { ...draft.integrations, payrollProvider: e.target.value } })} /></Field>
    <Field label={t.webhookUrl}><input disabled={disabled} value={draft.integrations.webhookUrl} onChange={(e) => setDraft({ ...draft, integrations: { ...draft.integrations, webhookUrl: e.target.value } })} /></Field>
  </div>;
}

function AuditSection({ draft, setDraft, t, disabled }: SectionProps) {
  return <div className="settings-grid">
    <Toggle label={t.auditEnabled} checked={draft.audit.enabled} disabled={disabled} onChange={(checked) => setDraft({ ...draft, audit: { ...draft.audit, enabled: checked } })} />
    <Field label={t.auditRetentionDays}><input disabled={disabled} type="number" min="30" value={draft.audit.retentionDays} onChange={(e) => setDraft({ ...draft, audit: { ...draft.audit, retentionDays: Number(e.target.value) } })} /></Field>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field settings-field"><span>{label}</span>{children}</label>;
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <label className="toggle-row settings-toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>;
}

function tabLabel(tab: SettingsTab, t: Translation) {
  const map: Record<SettingsTab, string> = { attendance: t.attendancePolicies, leave: t.leavePolicies, schedules: t.workSchedules, holidays: t.holidaysSettings, roles: t.rolesPermissions, notifications: t.notificationChannels, payroll: t.payrollExportFormat, security: t.securitySettings, integrations: t.integrationsSettings, audit: t.auditSettings };
  return map[tab];
}

function firstAllowedTab(role: UserRole): SettingsTab {
  return tabKeys.find((tab) => canViewTab(role, tab)) ?? "notifications";
}

function canViewTab(role: UserRole, tab: SettingsTab) {
  if (role === "Admin") return true;
  if (role === "HR") return ["attendance", "leave", "schedules", "holidays", "notifications"].includes(tab);
  if (role === "Payroll") return ["payroll", "notifications"].includes(tab);
  if (role === "Manager") return tab === "notifications";
  return tab === "notifications" || tab === "security";
}

function canEditTab(role: UserRole, tab: SettingsTab) {
  if (role === "Admin") return true;
  if (role === "HR") return ["attendance", "leave", "schedules", "holidays", "notifications"].includes(tab);
  if (role === "Payroll") return tab === "payroll" || tab === "notifications";
  if (role === "Manager") return tab === "notifications";
  return tab === "notifications";
}

function updateSchedule(draft: SystemSettings, setDraft: (settings: SystemSettings) => void, index: number, patch: Partial<WorkScheduleSetting>) {
  setDraft({ ...draft, workSchedules: draft.workSchedules.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
}

function updateHoliday(draft: SystemSettings, setDraft: (settings: SystemSettings) => void, index: number, patch: Partial<HolidaySetting>) {
  setDraft({ ...draft, holidays: draft.holidays.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
}

function parseWorkDays(value: string) {
  return value.split(",").map((item) => Number(item.trim())).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
}

function validateSettings(settings: SystemSettings, t: Translation) {
  if (settings.attendancePolicy.standardEndTime <= settings.attendancePolicy.standardStartTime) return t.invalidLeaveDates;
  if (settings.leavePolicy.defaultAnnualLeaveDays < 0 || settings.security.minPasswordLength < 6 || settings.security.sessionTimeoutMinutes < 15) return t.requiredFields;
  if (settings.holidays.some((holiday) => !holiday.name.trim() || holiday.endDate < holiday.startDate)) return t.invalidLeaveDates;
  return "";
}

function normalizeSettings(settings: SystemSettings): SystemSettings {
  return {
    ...settings,
    attendancePolicy: {
      ...settings.attendancePolicy,
      lateGraceMinutes: Math.max(0, Math.floor(settings.attendancePolicy.lateGraceMinutes)),
      earlyLeaveGraceMinutes: Math.max(0, Math.floor(settings.attendancePolicy.earlyLeaveGraceMinutes)),
      overtimeAfterHours: Math.max(1, Number(settings.attendancePolicy.overtimeAfterHours) || 8)
    },
    leavePolicy: { ...settings.leavePolicy, defaultAnnualLeaveDays: Math.max(0, Math.floor(settings.leavePolicy.defaultAnnualLeaveDays)) },
    workSchedules: settings.workSchedules.map((schedule) => ({ ...schedule, breakMinutes: Math.max(0, Math.floor(schedule.breakMinutes)), workDays: schedule.workDays.length ? schedule.workDays : [1, 2, 3, 4, 5] })),
    security: { ...settings.security, minPasswordLength: Math.max(6, Math.floor(settings.security.minPasswordLength)), sessionTimeoutMinutes: Math.max(15, Math.floor(settings.security.sessionTimeoutMinutes)) },
    audit: { ...settings.audit, retentionDays: Math.max(30, Math.floor(settings.audit.retentionDays)) }
  };
}
