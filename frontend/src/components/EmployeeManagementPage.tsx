import { FormEvent, useEffect, useMemo, useState } from "react";
import { createEmployee, downloadEmployeeExport, fetchEmployees, importEmployees, setEmployeeLocked, updateEmployee } from "../api";
import type { AttendanceLog, User, UserRole } from "../types";
import type { Translation } from "../i18n";
import { translateDepartment, translateRole } from "../utils/localize";

const roleOptions: UserRole[] = ["Employee", "Manager", "HR", "Payroll", "Admin"];
const statusOptions: Array<NonNullable<User["employmentStatus"]>> = ["Active", "Locked", "Inactive"];
const defaultImportRows = "Nguyen Van A,a.nguyen@workforce.local,Employee,Product,Frontend Developer\nTran Thi B,b.tran@workforce.local,Employee,Operations,Operations Analyst";

type EmployeeManagementPageProps = {
  authToken: string | null;
  logs: AttendanceLog[];
  onUsersChange: (users: User[]) => void;
  t: Translation;
  user: User;
  users: User[];
};

type EmployeeForm = {
  id?: string;
  name: string;
  email: string;
  role: UserRole;
  subtitle: string;
  employeeCode: string;
  phone: string;
  position: string;
  managerId: string;
  hireDate: string;
  employmentStatus: NonNullable<User["employmentStatus"]>;
  schedulePolicy: string;
  attendancePolicy: string;
  leavePolicy: string;
  remainingLeaveDays: number;
};

export function EmployeeManagementPage({ authToken, logs, onUsersChange, t, user, users }: EmployeeManagementPageProps) {
  const canAccess = user.role !== "Employee";
  const canManage = user.role === "HR" || user.role === "Admin";
  const canSeeSensitive = user.role === "HR" || user.role === "Payroll" || user.role === "Admin";
  const [sourceUsers, setSourceUsers] = useState<User[]>(users);
  const [selectedId, setSelectedId] = useState(users[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [form, setForm] = useState<EmployeeForm>(() => toForm(users[0], user));
  const [importText, setImportText] = useState(defaultImportRows);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSourceUsers(users);
  }, [users]);

  useEffect(() => {
    if (!authToken || !canAccess) return;
    fetchEmployees(authToken)
      .then((result) => {
        setSourceUsers(result.users);
        onUsersChange(mergeUsers(users, result.users));
      })
      .catch(() => undefined);
  }, [authToken, canAccess]);

  const scopedUsers = useMemo(() => scopeUsers(sourceUsers, user), [sourceUsers, user]);
  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return scopedUsers;
    return scopedUsers.filter((item) => [item.employeeCode, item.name, item.email, item.subtitle, item.position].some((value) => value?.toLowerCase().includes(normalized)));
  }, [query, scopedUsers]);
  const selectedUser = scopedUsers.find((item) => item.id === selectedId) ?? filteredUsers[0] ?? scopedUsers[0];
  const selectedLogs = logs.filter((log) => log.employeeId === selectedUser?.id).slice(0, 6);
  const managers = sourceUsers.filter((item) => item.role === "Manager" || item.role === "Admin");

  useEffect(() => {
    if (!selectedUser) return;
    setSelectedId(selectedUser.id);
    setForm(toForm(selectedUser, user));
  }, [selectedUser?.id]);

  if (!canAccess) {
    return <section className="placeholder-page"><h3>{t.employeeManagement}</h3><p>{t.employeeDenied}</p></section>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    const validation = validateForm(form, t);
    if (validation) {
      setError(validation);
      return;
    }

    const nextEmployee = fromForm(form);
    try {
      if (authToken) {
        const result = form.id ? await updateEmployee(authToken, form.id, nextEmployee) : await createEmployee(authToken, nextEmployee);
        upsertUsers(result.user);
      } else {
        upsertUsers({ ...nextEmployee, id: form.id || `u-employee-${Date.now()}` });
      }
      setNotice(t.employeeSaved);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.registerFailed);
    }
  }

  async function handleLockToggle(employee: User) {
    if (!canManage) return;
    const locked = !employee.locked;
    try {
      if (authToken) {
        const result = await setEmployeeLocked(authToken, employee.id, locked);
        upsertUsers(result.user);
      } else {
        upsertUsers({ ...employee, locked, employmentStatus: locked ? "Locked" : "Active" });
      }
      setNotice(t.employeeLocked);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.registerFailed);
    }
  }

  async function handleImport() {
    if (!canManage) return;
    const { validUsers, errors } = parseImportRows(importText, sourceUsers, t);
    setImportErrors(errors);
    if (errors.length) return;
    try {
      if (authToken) {
        const result = await importEmployees(authToken, importText);
        setImportErrors(result.errors);
        if (!result.errors.length) setAllUsers(mergeUsers(sourceUsers, result.users));
      } else {
        setAllUsers([...sourceUsers, ...validUsers]);
      }
      setNotice(t.employeeImported);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t.registerFailed);
    }
  }

  async function handleExport(format: "excel" | "pdf") {
    try {
      const blob = authToken ? await downloadEmployeeExport(authToken, format) : buildLocalEmployeeExport(filteredUsers, format, t);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `employees.${format === "excel" ? "xls" : "pdf"}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.registerFailed);
    }
  }

  function setAllUsers(nextUsers: User[]) {
    setSourceUsers(nextUsers);
    onUsersChange(nextUsers);
  }

  function upsertUsers(nextUser: User) {
    const nextUsers = sourceUsers.some((item) => item.id === nextUser.id) ? sourceUsers.map((item) => item.id === nextUser.id ? nextUser : item) : [...sourceUsers, nextUser];
    setAllUsers(nextUsers);
    setSelectedId(nextUser.id);
  }

  function handleNewForm() {
    const next = toForm(undefined, user);
    setForm(next);
    setSelectedId("");
  }

  return (
    <section className="leave-page employee-page">
      <div className="page-heading-row">
        <div>
          <h2>{t.employeeManagement}</h2>
          <p>{t.employeeManagementScope}</p>
        </div>
        <div className="export-actions">
          <button type="button" onClick={() => void handleExport("excel")}>Excel</button>
          <button type="button" onClick={() => void handleExport("pdf")}>PDF</button>
        </div>
      </div>

      {notice && <div className="attendance-toast success">{notice}</div>}
      {error && <div className="attendance-toast error">{error}</div>}

      <div className="employee-layout">
        <section className="employee-directory-panel">
          <div className="employee-toolbar">
            <label>{t.search}<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${t.employeeCode}, ${t.fullName}, ${t.department}`} /></label>
            {canManage && <button className="primary-button" type="button" onClick={handleNewForm}>{t.addEmployee}</button>}
          </div>
          <div className="employee-stats-grid">
            <Metric label={t.activeStatus} value={String(scopedUsers.filter((item) => !item.locked && item.employmentStatus !== "Inactive").length)} />
            <Metric label={t.lockedStatus} value={String(scopedUsers.filter((item) => item.locked || item.employmentStatus === "Locked").length)} />
            <Metric label={t.managerRole} value={String(scopedUsers.filter((item) => item.role === "Manager").length)} />
          </div>
          <div className="table-wrap employee-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.employeeCode}</th>
                  <th>{t.fullName}</th>
                  <th>{t.role}</th>
                  <th>{t.department}</th>
                  <th>{t.position}</th>
                  <th>{t.employmentStatus}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((item) => (
                  <tr className={selectedUser?.id === item.id ? "selected-row" : ""} key={item.id} onClick={() => setSelectedId(item.id)}>
                    <td>{item.employeeCode}</td>
                    <td><div className="employee-name-cell"><div className="employee-avatar small">{item.name.charAt(0)}</div><div><strong>{item.name}</strong><small>{translateRole(item.role, t)} - {item.email}</small></div></div></td>
                    <td>{translateRole(item.role, t)}</td>
                    <td>{translateDepartment(item.subtitle, t)}</td>
                    <td>{item.position}</td>
                    <td><span className={`badge ${item.locked || item.employmentStatus === "Locked" ? "danger" : "success"}`}>{translateEmploymentStatus(item, t)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="employee-detail-panel detail-card">
          <h3>{t.employeeProfile}</h3>
          {canManage ? (
            <form className="employee-form" onSubmit={handleSubmit}>
              <div className="two-column-fields">
                <label>{t.employeeCode}<input value={form.employeeCode} onChange={(event) => setFormField("employeeCode", event.target.value)} /></label>
                <label>{t.fullName}<input value={form.name} onChange={(event) => setFormField("name", event.target.value)} /></label>
                <label>{t.email}<input value={form.email} onChange={(event) => setFormField("email", event.target.value)} /></label>
                <label>{t.phone}<input value={form.phone} onChange={(event) => setFormField("phone", event.target.value)} /></label>
                <label>{t.role}<select value={form.role} onChange={(event) => setFormField("role", event.target.value as UserRole)}>{roleOptions.map((role) => <option value={role} key={role}>{translateRole(role, t)}</option>)}</select></label>
                <label>{t.department}<input value={form.subtitle} onChange={(event) => setFormField("subtitle", event.target.value)} /></label>
                <label>{t.position}<input value={form.position} onChange={(event) => setFormField("position", event.target.value)} /></label>
                <label>{t.directManager}<select value={form.managerId} onChange={(event) => setFormField("managerId", event.target.value)}><option value="">-</option>{managers.map((manager) => <option value={manager.id} key={manager.id}>{manager.name}</option>)}</select></label>
                <label>{t.hireDate}<input type="date" value={form.hireDate} onChange={(event) => setFormField("hireDate", event.target.value)} /></label>
                <label>{t.employmentStatus}<select value={form.employmentStatus} onChange={(event) => setFormField("employmentStatus", event.target.value as EmployeeForm["employmentStatus"])}>{statusOptions.map((status) => <option value={status} key={status}>{translateStatusOption(status, t)}</option>)}</select></label>
                <label>{t.schedulePolicy}<input value={form.schedulePolicy} onChange={(event) => setFormField("schedulePolicy", event.target.value)} /></label>
                <label>{t.attendancePolicy}<input value={form.attendancePolicy} onChange={(event) => setFormField("attendancePolicy", event.target.value)} /></label>
                <label>{t.leavePolicy}<input value={form.leavePolicy} onChange={(event) => setFormField("leavePolicy", event.target.value)} /></label>
                <label>{t.remainingLeave}<input type="number" min="0" value={form.remainingLeaveDays} onChange={(event) => setFormField("remainingLeaveDays", Number(event.target.value))} /></label>
              </div>
              <div className="detail-actions">
                <button type="submit">{form.id ? t.updateEmployee : t.addEmployee}</button>
                {selectedUser && <button type="button" onClick={() => void handleLockToggle(selectedUser)}>{selectedUser.locked ? t.unlockAccount : t.lockAccount}</button>}
              </div>
            </form>
          ) : selectedUser ? <ReadonlyProfile employee={selectedUser} managers={sourceUsers} t={t} canSeeSensitive={canSeeSensitive} /> : null}
        </aside>

        <section className="detail-card employee-history-panel">
          <h3>{t.attendanceHistory}</h3>
          {selectedLogs.length ? selectedLogs.map((log) => <p key={log.id}><strong>{log.date}</strong> {log.checkIn} - {log.checkOut} | {log.totalHours}</p>) : <p>{t.noEmployeeLogs}</p>}
        </section>

        {canManage && (
          <section className="detail-card employee-import-panel">
            <h3>{t.importEmployees}</h3>
            <p>{t.importEmployeesHint}</p>
            <textarea value={importText} onChange={(event) => setImportText(event.target.value)} rows={4} />
            <button className="primary-button" type="button" onClick={() => void handleImport()}>{t.importEmployees}</button>
            <h4>{t.importPreview}</h4>
            {importErrors.length ? importErrors.map((item) => <p className="error-line" key={item}>{item}</p>) : <p>{t.ready}</p>}
          </section>
        )}
      </div>
    </section>
  );

  function setFormField<K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="payroll-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function ReadonlyProfile({ employee, managers, t, canSeeSensitive }: { employee: User; managers: User[]; t: Translation; canSeeSensitive: boolean }) {
  const managerName = managers.find((item) => item.id === employee.managerId)?.name ?? "-";
  return (
    <dl className="detail-list">
      <div><dt>{t.employeeCode}</dt><dd>{employee.employeeCode}</dd></div>
      <div><dt>{t.fullName}</dt><dd>{employee.name}</dd></div>
      {canSeeSensitive && <div><dt>{t.email}</dt><dd>{employee.email}</dd></div>}
      <div><dt>{t.role}</dt><dd>{translateRole(employee.role, t)}</dd></div>
      <div><dt>{t.department}</dt><dd>{translateDepartment(employee.subtitle, t)}</dd></div>
      <div><dt>{t.position}</dt><dd>{employee.position}</dd></div>
      <div><dt>{t.directManager}</dt><dd>{managerName}</dd></div>
      <div><dt>{t.schedulePolicy}</dt><dd>{employee.schedulePolicy}</dd></div>
      <div><dt>{t.attendancePolicy}</dt><dd>{employee.attendancePolicy}</dd></div>
      <div><dt>{t.leavePolicy}</dt><dd>{employee.leavePolicy}</dd></div>
    </dl>
  );
}

function toForm(employee: User | undefined, currentUser: User): EmployeeForm {
  return {
    id: employee?.id,
    name: employee?.name ?? "",
    email: employee?.email ?? "",
    role: employee?.role ?? "Employee",
    subtitle: employee?.subtitle ?? "Product",
    employeeCode: employee?.employeeCode ?? `EMP-${Date.now().toString().slice(-4)}`,
    phone: employee?.phone ?? "",
    position: employee?.position ?? "",
    managerId: employee?.managerId ?? (currentUser.role === "Manager" ? currentUser.id : "u-manager"),
    hireDate: employee?.hireDate ?? new Date().toISOString().slice(0, 10),
    employmentStatus: employee?.employmentStatus ?? (employee?.locked ? "Locked" : "Active"),
    schedulePolicy: employee?.schedulePolicy ?? "Standard 8h",
    attendancePolicy: employee?.attendancePolicy ?? "Office check-in",
    leavePolicy: employee?.leavePolicy ?? "Annual 12 days",
    remainingLeaveDays: employee?.remainingLeaveDays ?? 12
  };
}

function fromForm(form: EmployeeForm): User {
  return {
    id: form.id ?? `u-employee-${Date.now()}`,
    name: form.name.trim(),
    email: form.email.trim().toLowerCase(),
    role: form.role,
    subtitle: form.subtitle.trim(),
    employeeCode: form.employeeCode.trim(),
    phone: form.phone.trim(),
    position: form.position.trim(),
    managerId: form.managerId,
    hireDate: form.hireDate,
    employmentStatus: form.employmentStatus,
    schedulePolicy: form.schedulePolicy.trim(),
    attendancePolicy: form.attendancePolicy.trim(),
    leavePolicy: form.leavePolicy.trim(),
    remainingLeaveDays: Number(form.remainingLeaveDays) || 0,
    locked: form.employmentStatus === "Locked"
  };
}

function validateForm(form: EmployeeForm, t: Translation) {
  if (!form.name.trim() || !form.email.trim() || !form.subtitle.trim()) return t.requiredFields;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return t.invalidEmail;
  return "";
}

function scopeUsers(users: User[], user: User) {
  if (user.role === "Manager") return users.filter((item) => item.id === user.id || item.managerId === user.id);
  if (user.role === "Payroll") return users.filter((item) => item.role !== "Admin");
  if (user.role === "Employee") return [];
  return users;
}

function parseImportRows(rows: string, existingUsers: User[], t: Translation) {
  const errors: string[] = [];
  const validUsers = rows.split(/\r?\n/).map((line, index) => {
    const [name = "", email = "", role = "Employee", department = "", position = ""] = line.split(",").map((item) => item.trim());
    if (!line.trim()) return null;
    if (!name || !email || !department || !roleOptions.includes(role as UserRole) || existingUsers.some((item) => item.email.toLowerCase() === email.toLowerCase())) {
      errors.push(t.invalidImportRow.replace("{row}", String(index + 1)));
      return null;
    }
    return {
      id: `u-import-${Date.now()}-${index}`,
      name,
      email: email.toLowerCase(),
      role: role as UserRole,
      subtitle: department,
      employeeCode: `IMP-${String(index + 1).padStart(3, "0")}`,
      position,
      phone: "",
      managerId: "u-manager",
      hireDate: new Date().toISOString().slice(0, 10),
      employmentStatus: "Active" as const,
      schedulePolicy: "Standard 8h",
      attendancePolicy: "Office check-in",
      leavePolicy: "Annual 12 days",
      remainingLeaveDays: 12,
      locked: false
    };
  }).filter(Boolean) as User[];
  return { validUsers, errors };
}

function mergeUsers(current: User[], incoming: User[]) {
  const map = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => map.set(item.id, item));
  return [...map.values()];
}

function translateEmploymentStatus(user: User, t: Translation) {
  if (user.locked || user.employmentStatus === "Locked") return t.lockedStatus;
  if (user.employmentStatus === "Inactive") return t.inactiveStatus;
  return t.activeStatus;
}

function translateStatusOption(status: NonNullable<User["employmentStatus"]>, t: Translation) {
  if (status === "Locked") return t.lockedStatus;
  if (status === "Inactive") return t.inactiveStatus;
  return t.activeStatus;
}

function buildLocalEmployeeExport(users: User[], format: "excel" | "pdf", t: Translation) {
  const rows = [[t.employeeCode, t.fullName, t.email, t.role, t.department, t.position, t.employmentStatus], ...users.map((item) => [item.employeeCode ?? "", item.name, item.email, translateRole(item.role, t), translateDepartment(item.subtitle, t), item.position ?? "", translateEmploymentStatus(item, t)])];
  if (format === "pdf") return new Blob([rows.map((row) => row.join(" | ")).join("\n")], { type: "application/pdf" });
  const html = `<table>${rows.map((row, index) => `<tr>${row.map((cell) => `<${index === 0 ? "th" : "td"}>${escapeHtml(cell)}</${index === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</table>`;
  return new Blob([html], { type: "application/vnd.ms-excel" });
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
