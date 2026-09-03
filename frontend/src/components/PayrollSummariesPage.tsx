import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  confirmPayrollPeriod,
  createPayrollPeriod,
  downloadPayrollExport,
  fetchPayrollPeriods,
  lockPayrollPeriod,
  recalculatePayrollPeriod,
  unlockPayrollPeriod
} from "../api";
import type { AttendanceLog, PayrollPeriod, PayrollSummaryRow, SystemSettings, User } from "../types";
import type { Translation } from "../i18n";
import { translateDepartment, translatePayrollStatus } from "../utils/localize";

type PayrollSummariesPageProps = {
  authToken: string | null;
  logs: AttendanceLog[];
  periods: PayrollPeriod[];
  onLogsChange: (logs: AttendanceLog[]) => void;
  onPeriodsChange: (periods: PayrollPeriod[]) => void;
  settings: SystemSettings;
  t: Translation;
  user: User;
};

export function PayrollSummariesPage({ authToken, logs, periods, onLogsChange, onPeriodsChange, settings, t, user }: PayrollSummariesPageProps) {
  const labels = {
    title: t.payrollSummaries,
    scopeEmployee: t.payrollScopeEmployee,
    scopeManager: t.payrollScopeManager,
    scopeCompany: t.payrollScopeCompany,
    createPeriod: t.createPayrollPeriod,
    periodName: t.payrollPeriodName,
    startDate: t.payrollStartDate,
    endDate: t.payrollEndDate,
    create: t.createPeriod,
    recalculate: t.recalculatePayroll,
    confirm: t.confirmPayroll,
    lock: t.lockPayroll,
    unlock: t.unlockPayroll,
    warnings: t.payrollWarnings,
    versions: t.payrollVersions,
    noWarnings: t.noPayrollWarnings,
    noVersions: t.noPayrollVersions,
    noPeriods: t.noPayrollPeriods,
    payrollDenied: t.payrollDenied,
    currentDemoPeriod: t.currentDemoPeriod,
    standard: t.standardHours,
    worked: t.workedHours,
    overtime: t.overtimeHours,
    paidLeave: t.paidLeaveHours,
    unpaidLeave: t.unpaidLeaveHours,
    missingHours: t.missingHours,
    late: t.lateCount,
    early: t.earlyLeaveCount,
    missing: t.missingLogCount,
    payable: t.totalPayableHours,
    status: t.payrollStatus,
    exportReady: t.payrollExportReady,
    saved: t.payrollSaved,
    lockedBlocked: t.payrollLockBlocked,
    loading: t.loadingPayroll,
    backendFallback: t.payrollBackendFallback
  };
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const [form, setForm] = useState({
    name: `Payroll ${monthStart.toISOString().slice(0, 7)}`,
    startDate: monthStart.toISOString().slice(0, 10),
    endDate: monthEnd.toISOString().slice(0, 10)
  });
  const [remotePeriods, setRemotePeriods] = useState<PayrollPeriod[] | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState(periods[0]?.id ?? "");
  const [notice, setNotice] = useState("");
  const [apiError, setApiError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!authToken || !canViewPayroll(user)) {
      setRemotePeriods(null);
      return;
    }

    let active = true;
    setIsLoading(true);
    fetchPayrollPeriods(authToken)
      .then(({ periods }) => {
        if (!active) return;
        setRemotePeriods(periods);
        setSelectedPeriodId((current) => periods.find((period) => period.id === current)?.id ?? periods[0]?.id ?? "");
        setApiError("");
      })
      .catch((error) => {
        if (!active) return;
        setRemotePeriods(null);
        setApiError(error instanceof Error ? error.message : "Unable to load payroll periods");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [authToken, user]);

  const sourcePeriods = remotePeriods ?? periods;
  const displayPeriods = useMemo(() => {
    if (sourcePeriods.length > 0) return sourcePeriods;
    return [buildLocalPayrollPeriod({ name: labels.currentDemoPeriod, startDate: form.startDate, endDate: form.endDate }, logs, settings, "system", "seeded", t, "payroll-current-demo")];
  }, [form.endDate, form.startDate, logs, settings, sourcePeriods]);
  const scopedPeriods = useMemo(() => displayPeriods.map((period) => scopePayrollPeriod(period, logs, user)), [displayPeriods, logs, user]);
  const selectedPeriod = scopedPeriods.find((period) => period.id === selectedPeriodId) ?? scopedPeriods[0] ?? null;
  const totals = selectedPeriod ? totalRows(selectedPeriod.rows) : null;

  if (!canViewPayroll(user)) {
    return (
      <section className="page-stack">
        <div className="placeholder-page">
          <h3>{labels.title}</h3>
          <p>{labels.payrollDenied}</p>
        </div>
      </section>
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (authToken) {
      try {
        const { period } = await createPayrollPeriod(authToken, form);
        setRemotePeriods((current) => [period, ...(current ?? [])]);
        setSelectedPeriodId(period.id);
        setNotice(labels.saved);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : t.noPermission);
      }
      return;
    }

    const period = buildLocalPayrollPeriod(form, logs, settings, user.id, "created", t);
    onPeriodsChange([period, ...periods]);
    setSelectedPeriodId(period.id);
    setNotice(labels.saved);
  }

  async function handleAction(action: "recalculate" | "confirm" | "lock" | "unlock") {
    if (!selectedPeriod) return;
    if (authToken) {
      try {
        const { period } = await runRemoteAction(action, authToken, selectedPeriod.id);
        setRemotePeriods((current) => updatePeriodList(current, period));
        setSelectedPeriodId(period.id);
        setNotice(labels.saved);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : t.noPermission);
      }
      return;
    }

    const nextPeriod = runLocalAction(action, selectedPeriod, logs, settings, user, t);
    if (action === "lock" && nextPeriod.warnings.length > 0) {
      setNotice(labels.lockedBlocked);
      return;
    }
    onPeriodsChange(updatePeriodList(periods, nextPeriod));
    if (action === "lock") onLogsChange(setPayrollLock(logs, nextPeriod, true));
    if (action === "unlock") onLogsChange(setPayrollLock(logs, nextPeriod, false));
    setSelectedPeriodId(nextPeriod.id);
    setNotice(labels.saved);
  }

  async function handleExport(format: "excel" | "pdf") {
    if (!selectedPeriod) return;
    if (authToken) {
      try {
        const blob = await downloadPayrollExport(authToken, selectedPeriod.id, format);
        downloadBlob(blob, `payroll-summary.${format === "excel" ? "xls" : "pdf"}`);
        setNotice(labels.exportReady);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : t.noPermission);
      }
      return;
    }

    const blob = format === "excel" ? buildPayrollExcel(selectedPeriod, t) : buildPayrollTextReport(selectedPeriod, t);
    downloadBlob(blob, `payroll-summary.${format === "excel" ? "xls" : "txt"}`);
    setNotice(labels.exportReady);
  }

  return (
    <section className="payroll-page page-stack">
      <div className="page-heading">
        <div>
          <h3>{labels.title}</h3>
          <p>{getScopeText(user, t)}</p>
        </div>
        <div className="export-actions">
          <button type="button" onClick={() => void handleExport("excel")} disabled={!selectedPeriod}>Excel</button>
          <button type="button" onClick={() => void handleExport("pdf")} disabled={!selectedPeriod}>PDF</button>
        </div>
      </div>

      {isLoading && <div className="attendance-toast success">{labels.loading}</div>}
      {apiError && <div className="attendance-toast warning">{labels.backendFallback} {apiError}</div>}
      {notice && <div className="attendance-toast success">{notice}</div>}

      <div className="payroll-layout">
        <aside className="payroll-side">
          {(user.role === "Payroll" || user.role === "Admin") && (
            <form className="leave-form-panel" onSubmit={handleCreate}>
              <h4>{labels.createPeriod}</h4>
              <label>{labels.periodName}<input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
              <label>{labels.startDate}<input type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></label>
              <label>{labels.endDate}<input type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></label>
              <button className="primary-button" type="submit">{labels.create}</button>
            </form>
          )}

          <section className="leave-list-panel period-list-panel">
            {scopedPeriods.length === 0 && <p>{labels.noPeriods}</p>}
            {scopedPeriods.map((period) => (
              <button className={`period-row ${selectedPeriod?.id === period.id ? "active" : ""}`} type="button" key={period.id} onClick={() => setSelectedPeriodId(period.id)}>
                <strong>{translatePeriodName(period, t)}</strong>
                <span>{period.startDate} - {period.endDate}</span>
                <small>{translatePayrollStatus(period.status, t)}</small>
              </button>
            ))}
          </section>
            <section className="detail-card payroll-detail-card">
            <div className="audit-panel payroll-version-panel">
              <h4>{labels.versions}</h4>
              {selectedPeriod?.versions.length ? selectedPeriod.versions.map((version) => <p key={`${version.version}-${version.createdAt}`}>v{version.version} - {translateVersionAction(version.action, t)} - {new Date(version.createdAt).toLocaleString()}</p>) : <p>{labels.noVersions}</p>}
            </div>
          </section>
        </aside>

        <section className="payroll-main-panel">
          {selectedPeriod ? (
            <>
              <div className="payroll-summary-head">
                <div>
                  <span>{labels.status}</span>
                  <h4>{translatePeriodName(selectedPeriod, t)}</h4>
                  <p>{selectedPeriod.startDate} - {selectedPeriod.endDate}</p>
                </div>
                <strong className={`payroll-status ${selectedPeriod.status.toLowerCase()}`}>{translatePayrollStatus(selectedPeriod.status, t)}</strong>
              </div>

              {totals && (
                <div className="payroll-metrics-grid">
                  <Metric label={labels.standard} value={totals.standardHours} />
                  <Metric label={labels.worked} value={totals.workedHours} />
                  <Metric label={labels.overtime} value={totals.overtimeHours} />
                  <Metric label={labels.paidLeave} value={totals.paidLeaveHours} />
                  <Metric label={labels.unpaidLeave} value={totals.unpaidLeaveHours} />
                  <Metric label={labels.missing} value={totals.missingLogCount} plain />
                </div>
              )}

              <section className={`payroll-warning-panel ${selectedPeriod.warnings.length ? "has-warning" : "is-clear"}`}>
                <div>
                  <span>{labels.warnings}</span>
                  <strong>{selectedPeriod.warnings.length ? `${selectedPeriod.warnings.length} ${t.items}` : labels.noWarnings}</strong>
                </div>
                {selectedPeriod.warnings.length ? (
                  <div className="payroll-warning-list">
                    {selectedPeriod.warnings.map((warning) => <p className="warning-line" key={warning}>{translatePayrollWarning(warning, t)}</p>)}
                  </div>
                ) : <p>{labels.noWarnings}</p>}
              </section>

              <div className="detail-actions payroll-actions">
                {(user.role === "Payroll" || user.role === "HR" || user.role === "Admin") && selectedPeriod.status !== "Locked" && <button type="button" onClick={() => void handleAction("recalculate")}>{labels.recalculate}</button>}
                {(user.role === "Payroll" || user.role === "HR" || user.role === "Admin") && selectedPeriod.status !== "Locked" && <button type="button" onClick={() => void handleAction("confirm")}>{labels.confirm}</button>}
                {(user.role === "Payroll" || user.role === "Admin") && selectedPeriod.status !== "Locked" && <button type="button" onClick={() => void handleAction("lock")}>{labels.lock}</button>}
                {user.role === "Admin" && selectedPeriod.status === "Locked" && <button type="button" onClick={() => void handleAction("unlock")}>{labels.unlock}</button>}
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t.employee}</th>
                      <th>{t.department}</th>
                      <th>{labels.standard}</th>
                      <th>{labels.worked}</th>
                      <th>{labels.overtime}</th>
                      <th>{labels.paidLeave}</th>
                      <th>{labels.unpaidLeave}</th>
                      <th>{labels.missing}</th>
                      <th>{labels.payable}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPeriod.rows.map((row) => (
                      <tr key={row.employeeId}>
                        <td data-label={t.employee}>{row.employeeName}</td>
                        <td data-label={t.department}>{translateDepartment(row.department, t)}</td>
                        <td data-label={labels.standard}>{formatNumber(row.standardHours)}</td>
                        <td data-label={labels.worked}>{formatNumber(row.workedHours)}</td>
                        <td data-label={labels.overtime}>{formatNumber(row.overtimeHours)}</td>
                        <td data-label={labels.paidLeave}>{formatNumber(row.paidLeaveHours)}</td>
                        <td data-label={labels.unpaidLeave}>{formatNumber(row.unpaidLeaveHours)}</td>
                        <td data-label={labels.missing}>{row.missingLogCount}</td>
                        <td data-label={labels.payable}>{formatNumber(row.totalPayableHours)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : <p>{labels.noPeriods}</p>}
        </section>
      </div>
    </section>
  );
}


function translatePeriodName(period: PayrollPeriod, t: Translation) {
  if (period.id === "payroll-current-demo" || period.name === "Current payroll period" || period.name === "Kỳ công hiện tại") return t.currentDemoPeriod;
  return period.name;
}

function translatePayrollWarning(warning: string, t: Translation) {
  const pendingAdjustmentMatch = warning.match(/^(\d+) pending attendance adjustment\(s\) must be resolved before locking$/) ?? warning.match(/^Cần xử lý (\d+) yêu cầu điều chỉnh công trước khi khóa kỳ$/);
  if (pendingAdjustmentMatch) return t.pendingAdjustmentWarningTemplate.replace("{count}", pendingAdjustmentMatch[1]);

  const englishMatch = warning.match(/^(.+) has (\d+) unresolved attendance item\(s\)$/) ?? warning.match(/^(.+) has (\d+) log\(s\) to resolve$/);
  const vietnameseMatch = warning.match(/^(.+) còn (\d+) log cần xử lý$/);
  const match = englishMatch ?? vietnameseMatch;
  if (!match) return warning;
  return t.payrollWarningTemplate.replace("{name}", match[1]).replace("{count}", match[2]);
}

function translateVersionAction(action: string, t: Translation) {
  if (action === "seeded") return t.versionSeeded;
  if (action === "created") return t.versionCreated;
  if (action === "recalculated") return t.versionRecalculated;
  if (action === "confirmed") return t.versionConfirmed;
  if (action === "locked") return t.versionLocked;
  if (action === "unlocked") return t.versionUnlocked;
  return action;
}

function Metric({ label, value, plain = false }: { label: string; value: number; plain?: boolean }) {
  return <div className="payroll-metric"><span>{label}</span><strong>{plain ? value : `${formatNumber(value)}h`}</strong></div>;
}

async function runRemoteAction(action: "recalculate" | "confirm" | "lock" | "unlock", token: string, periodId: string) {
  if (action === "recalculate") return recalculatePayrollPeriod(token, periodId);
  if (action === "confirm") return confirmPayrollPeriod(token, periodId);
  if (action === "lock") return lockPayrollPeriod(token, periodId);
  return unlockPayrollPeriod(token, periodId);
}

function runLocalAction(action: "recalculate" | "confirm" | "lock" | "unlock", period: PayrollPeriod, logs: AttendanceLog[], settings: SystemSettings, user: User, t: Translation) {
  const next = { ...period, rows: calculatePayrollRows(period.startDate, period.endDate, logs, settings), versions: [...period.versions] };
  next.warnings = calculateWarnings(next, t);
  if (action === "confirm") next.status = "Confirmed";
  if (action === "lock" && next.warnings.length === 0) next.status = "Locked";
  if (action === "unlock") next.status = "Draft";
  next.versions = [{ version: next.versions.length + 1, action, actorId: user.id, createdAt: new Date().toISOString(), notes: `${action} payroll period` }, ...next.versions];
  return next;
}

function buildLocalPayrollPeriod(form: { name: string; startDate: string; endDate: string }, logs: AttendanceLog[], settings: SystemSettings, actorId: string, action: string, t: Translation, id = `payroll-${Date.now()}`): PayrollPeriod {
  const period: PayrollPeriod = { id, name: form.name, startDate: form.startDate, endDate: form.endDate, status: "Draft", createdBy: actorId, createdAt: new Date().toISOString(), warnings: [], rows: [], versions: [] };
  period.rows = calculatePayrollRows(period.startDate, period.endDate, logs, settings);
  period.warnings = calculateWarnings(period, t);
  period.versions = [{ version: 1, action, actorId, createdAt: new Date().toISOString(), notes: "created payroll period" }];
  return period;
}

function calculatePayrollRows(startDate: string, endDate: string, logs: AttendanceLog[], settings: SystemSettings): PayrollSummaryRow[] {
  const businessDays = countBusinessDays(startDate, endDate, settings);
  const map = new Map<string, PayrollSummaryRow>();
  const periodLogs = logs.filter((log) => log.workDate >= startDate && log.workDate <= endDate);
  for (const log of periodLogs) {
    const employeeId = log.employeeId ?? log.employeeName;
    const row = map.get(employeeId) ?? { employeeId, employeeName: log.employeeName, department: log.department, standardHours: businessDays * 8, workedHours: 0, overtimeHours: 0, paidLeaveHours: 0, unpaidLeaveHours: 0, missingHours: 0, lateCount: 0, earlyLeaveCount: 0, missingLogCount: 0, totalPayableHours: 0 };
    if (log.status === "On Leave") row.paidLeaveHours += 8;
    else row.workedHours += parseHourText(log.totalHours);
    row.overtimeHours += parseHourText(log.overtime);
    if (log.status === "Late") row.lateCount += 1;
    if (log.status === "Early Leave") row.earlyLeaveCount += 1;
    if (log.status === "Missing Check-out" || log.adjustmentStatus === "Pending") row.missingLogCount += 1;
    row.totalPayableHours = roundHours(row.workedHours + row.overtimeHours + row.paidLeaveHours);
    row.missingHours = Math.max(0, roundHours(row.standardHours - row.workedHours - row.paidLeaveHours - row.unpaidLeaveHours));
    map.set(employeeId, row);
  }
  return [...map.values()];
}

function calculateWarnings(period: PayrollPeriod, t: Translation) {
  return period.rows
    .filter((row) => row.missingLogCount > 0)
    .map((row) => t.payrollWarningTemplate.replace("{name}", row.employeeName).replace("{count}", String(row.missingLogCount)));
}

function scopePayrollPeriod(period: PayrollPeriod, logs: AttendanceLog[], user: User): PayrollPeriod {
  if (user.role !== "Manager") return period;
  const ids = new Set(logs.filter((log) => log.managerId === user.id || log.employeeId === user.id).map((log) => log.employeeId ?? log.employeeName));
  return { ...period, rows: period.rows.filter((row) => ids.has(row.employeeId)) };
}

function setPayrollLock(logs: AttendanceLog[], period: PayrollPeriod, locked: boolean) {
  return logs.map((log) => log.workDate >= period.startDate && log.workDate <= period.endDate ? { ...log, payrollLocked: locked } : log);
}

function updatePeriodList(periods: PayrollPeriod[] | null, updated: PayrollPeriod) {
  if (!periods) return [updated];
  return periods.map((period) => period.id === updated.id ? updated : period);
}

function totalRows(rows: PayrollSummaryRow[]): PayrollSummaryRow {
  return rows.reduce((total, row) => ({ ...total, standardHours: roundHours(total.standardHours + row.standardHours), workedHours: roundHours(total.workedHours + row.workedHours), overtimeHours: roundHours(total.overtimeHours + row.overtimeHours), paidLeaveHours: roundHours(total.paidLeaveHours + row.paidLeaveHours), unpaidLeaveHours: roundHours(total.unpaidLeaveHours + row.unpaidLeaveHours), missingHours: roundHours(total.missingHours + row.missingHours), lateCount: total.lateCount + row.lateCount, earlyLeaveCount: total.earlyLeaveCount + row.earlyLeaveCount, missingLogCount: total.missingLogCount + row.missingLogCount, totalPayableHours: roundHours(total.totalPayableHours + row.totalPayableHours) }), { employeeId: "total", employeeName: "Total", department: "", standardHours: 0, workedHours: 0, overtimeHours: 0, paidLeaveHours: 0, unpaidLeaveHours: 0, missingHours: 0, lateCount: 0, earlyLeaveCount: 0, missingLogCount: 0, totalPayableHours: 0 });
}

function canViewPayroll(user: User) {
  return user.role === "Manager" || user.role === "HR" || user.role === "Payroll" || user.role === "Admin";
}

function getScopeText(user: User, t: Translation) {
  if (user.role === "Employee") return t.payrollScopeEmployee;
  if (user.role === "Manager") return t.payrollScopeManager;
  return t.payrollScopeCompany;
}

function countBusinessDays(startDate: string, endDate: string, settings: SystemSettings) {
  let count = 0;
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cursor <= end) {
    const day = cursor.getDay();
    const isoDate = cursor.toISOString().slice(0, 10);
    const isHoliday = settings.holidays.some((holiday) => isoDate >= holiday.startDate && isoDate <= holiday.endDate);
    if (day !== 0 && day !== 6 && !isHoliday) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function parseHourText(value: string) {
  const match = value.match(/(\d+)h\s*(\d+)m/);
  if (!match) return 0;
  return Number(match[1]) + Number(match[2]) / 60;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildPayrollExcel(period: PayrollPeriod, t: Translation) {
  const rows = [[t.employee, t.department, t.standardHours, t.workedHours, t.overtimeHours, t.paidLeaveHours, t.unpaidLeaveHours, t.missingLogCount, t.totalPayableHours], ...period.rows.map((row) => [row.employeeName, translateDepartment(row.department, t), row.standardHours, row.workedHours, row.overtimeHours, row.paidLeaveHours, row.unpaidLeaveHours, row.missingLogCount, row.totalPayableHours])];
  const html = `<table><tr><th colspan="9">${translatePeriodName(period, t)}</th></tr>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</table>`;
  return new Blob([html], { type: "application/vnd.ms-excel" });
}

function buildPayrollTextReport(period: PayrollPeriod, t: Translation) {
  const lines = [translatePeriodName(period, t), `${period.startDate} - ${period.endDate}`, ...period.rows.map((row) => `${row.employeeName}: ${t.totalPayableHours} ${row.totalPayableHours}h, ${t.missingLogCount} ${row.missingLogCount}`)];
  return new Blob([lines.join("\n")], { type: "text/plain" });
}
