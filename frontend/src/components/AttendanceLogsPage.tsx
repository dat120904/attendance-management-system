import { useEffect, useMemo, useState } from "react";
import { decideAttendanceAdjustment, downloadAttendanceExport, fetchAttendanceLogs, fetchAuditLogs, requestAttendanceAdjustment } from "../api";
import type { AttendanceLog, User } from "../types";
import type { Translation } from "../i18n";

type DateRange = "day" | "week" | "month";
type StatusFilter = "All" | AttendanceLog["status"];

type AttendanceLogsPageProps = {
  authToken: string | null;
  logs: AttendanceLog[];
  onLogsChange: (logs: AttendanceLog[]) => void;
  t: Translation;
  user: User;
};

const statusFilters: StatusFilter[] = ["All", "On Time", "Late", "Early Leave", "On Leave", "Missing Check-out", "Holiday", "Weekend", "Adjusted"];

export function AttendanceLogsPage({ authToken, logs, onLogsChange, t, user }: AttendanceLogsPageProps) {
  const [dateRange, setDateRange] = useState<DateRange>("week");
  const [status, setStatus] = useState<StatusFilter>("All");
  const [query, setQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState<AttendanceLog | null>(logs[0] ?? null);
  const [notice, setNotice] = useState("");
  const [remoteLogs, setRemoteLogs] = useState<AttendanceLog[] | null>(null);
  const [remoteAuditLogs, setRemoteAuditLogs] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<string[]>([]);
  const [apiError, setApiError] = useState("");

  useEffect(() => {
    if (!authToken) {
      setRemoteLogs(null);
      setRemoteAuditLogs([]);
      setApiError("");
      return;
    }

    let isActive = true;
    setIsLoading(true);

    fetchAttendanceLogs(authToken, { dateRange, status, query })
      .then(({ logs }) => {
        if (!isActive) return;
        setRemoteLogs(logs);
        setSelectedLog((current) => logs.find((log) => log.id === current?.id) ?? logs[0] ?? null);
        setApiError("");
      })
      .catch((error) => {
        if (!isActive) return;
        setRemoteLogs(null);
        setApiError(error instanceof Error ? error.message : "Unable to load attendance logs");
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    fetchAuditLogs(authToken)
      .then(({ auditLogs }) => {
        if (!isActive) return;
        setRemoteAuditLogs(auditLogs.map((entry) => `${new Date(entry.createdAt).toLocaleString()} - ${entry.action} (${entry.targetId})`));
      })
      .catch(() => {
        if (isActive) setRemoteAuditLogs([]);
      });

    return () => {
      isActive = false;
    };
  }, [authToken, dateRange, query, refreshKey, status]);

  const localScopedLogs = useMemo(() => {
    const byRole = getRoleScopedLogs(logs, user);
    const normalizedQuery = query.trim().toLowerCase();
    const now = new Date();

    return byRole.filter((log) => {
      const matchesStatus = status === "All" || log.status === status;
      const matchesDateRange = isWithinDateRange(log.workDate, dateRange, now);
      const matchesQuery =
        !normalizedQuery ||
        log.employeeName.toLowerCase().includes(normalizedQuery) ||
        log.department.toLowerCase().includes(normalizedQuery) ||
        log.date.toLowerCase().includes(normalizedQuery);

      return matchesDateRange && matchesStatus && matchesQuery;
    });
  }, [dateRange, logs, query, status, user]);

  const scopedLogs = remoteLogs ?? localScopedLogs;
  const visibleAuditLogs = authToken ? remoteAuditLogs : auditLogs;

  async function handleAdjustment(log: AttendanceLog) {
    if (log.payrollLocked) {
      setNotice(t.lockedLogMessage);
      return;
    }

    if (authToken) {
      try {
        const { log: updatedLog } = await requestAttendanceAdjustment(authToken, log.id);
        setRemoteLogs((current) => updateLogList(current, updatedLog));
        setSelectedLog(updatedLog);
        setNotice(t.adjustmentRequested);
        setRefreshKey((current) => current + 1);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : t.noPermission);
      }
      return;
    }

    const nextLogs = logs.map((item) => (item.id === log.id ? { ...item, adjustmentStatus: "Pending" as const } : item));
    onLogsChange(nextLogs);
    setSelectedLog({ ...log, adjustmentStatus: "Pending" });
    setNotice(t.adjustmentRequested);
    addAudit(`${user.name} requested adjustment for ${log.employeeName} - ${log.workDate}`);
  }

  async function handleDecision(log: AttendanceLog, adjustmentStatus: "Approved" | "Rejected") {
    if (!canApprove(user, log)) {
      setNotice(t.noPermission);
      return;
    }

    if (log.payrollLocked) {
      setNotice(t.lockedLogMessage);
      return;
    }

    if (authToken) {
      try {
        const decision = adjustmentStatus === "Approved" ? "approve" : "reject";
        const { log: updatedLog } = await decideAttendanceAdjustment(authToken, log.id, decision);
        setRemoteLogs((current) => updateLogList(current, updatedLog));
        setSelectedLog(updatedLog);
        setNotice(adjustmentStatus === "Approved" ? t.adjustmentApproved : t.adjustmentRejected);
        setRefreshKey((current) => current + 1);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : t.noPermission);
      }
      return;
    }

    const nextLogs = logs.map((item) => (item.id === log.id ? { ...item, adjustmentStatus, status: adjustmentStatus === "Approved" ? "Adjusted" as const : item.status } : item));
    onLogsChange(nextLogs);
    setSelectedLog({ ...log, adjustmentStatus, status: adjustmentStatus === "Approved" ? "Adjusted" : log.status });
    setNotice(adjustmentStatus === "Approved" ? t.adjustmentApproved : t.adjustmentRejected);
    addAudit(`${user.name} ${adjustmentStatus.toLowerCase()} adjustment for ${log.employeeName} - ${log.workDate}`);
  }

  async function handleExport(format: "Excel" | "PDF") {
    if (authToken) {
      try {
        const blob = await downloadAttendanceExport(authToken, {
          format: format === "Excel" ? "excel" : "pdf",
          dateRange,
          status,
          query
        });
        downloadBlob(blob, format);
        setNotice(t.exportReady.replace("{format}", format).replace("{count}", `${scopedLogs.length}`));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : t.noPermission);
      }
      return;
    }

    downloadExport(format, scopedLogs, t);
    setNotice(t.exportReady.replace("{format}", format).replace("{count}", `${scopedLogs.length}`));
  }

  function addAudit(entry: string) {
    setAuditLogs((current) => [`${new Date().toLocaleString()} - ${entry}`, ...current].slice(0, 5));
  }

  return (
    <section className="page-stack">
      <div className="page-heading">
        <div>
          <h3>{t.attendanceLogs}</h3>
          <p>{getScopeText(user, t)}</p>
        </div>
        <div className="export-actions" aria-label={t.export}>
          <button type="button" onClick={() => handleExport("Excel")}>Excel</button>
          <button type="button" onClick={() => handleExport("PDF")}>PDF</button>
        </div>
      </div>

      <div className="filters-card">
        <div className="segmented-control" aria-label={t.dateRange}>
          {(["day", "week", "month"] as const).map((range) => (
            <button className={dateRange === range ? "active" : ""} type="button" key={range} onClick={() => setDateRange(range)}>
              {range === "day" ? t.day : range === "week" ? t.week : t.month}
            </button>
          ))}
        </div>
        <label className="field">
          {t.status}
          <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
            {statusFilters.map((item) => (
              <option value={item} key={item}>
                {item === "All" ? t.all : translateStatus(item, t)}
              </option>
            ))}
          </select>
        </label>
        <label className="field search-field">
          {t.search}
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchAttendancePlaceholder} />
        </label>
      </div>

      {isLoading && <div className="attendance-toast success">Loading attendance logs...</div>}
      {apiError && <div className="attendance-toast warning">Backend unavailable, showing demo data. {apiError}</div>}
      {notice && <div className="attendance-toast success">{notice}</div>}

      <div className="logs-layout">
        <section className="logs-card page-table" aria-label={t.attendanceLogs}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t.date}</th>
                  <th>{t.employee}</th>
                  <th>{t.department}</th>
                  <th>{t.checkInColumn}</th>
                  <th>{t.checkOutColumn}</th>
                  <th>{t.totalHours}</th>
                  <th>{t.overtime}</th>
                  <th>{t.status}</th>
                  <th>{t.adjustmentStatus}</th>
                </tr>
              </thead>
              <tbody>
                {scopedLogs.map((log) => (
                  <tr className={selectedLog?.id === log.id ? "selected-row" : ""} key={log.id} onClick={() => setSelectedLog(log)}>
                    <td data-label={t.date}>{log.date}</td>
                    <td data-label={t.employee}>{log.employeeName}</td>
                    <td data-label={t.department}>{log.department}</td>
                    <td data-label={t.checkInColumn}>{log.checkIn}</td>
                    <td data-label={t.checkOutColumn}>{log.checkOut}</td>
                    <td data-label={t.totalHours}>{log.totalHours}</td>
                    <td data-label={t.overtime}>{log.overtime}</td>
                    <td data-label={t.status}><span className={`badge ${statusClassName(log.status)}`}>{translateStatus(log.status, t)}</span></td>
                    <td data-label={t.adjustmentStatus}><span className={`badge ${adjustmentClassName(log.adjustmentStatus)}`}>{translateAdjustment(log.adjustmentStatus, t)}</span></td>
                  </tr>
                ))}
                {scopedLogs.length === 0 && (
                  <tr>
                    <td colSpan={9}>{t.noLogsFound}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="detail-card">
          <span>{t.logDetail}</span>
          {selectedLog ? (
            <>
              <h3>{selectedLog.employeeName}</h3>
              <dl>
                <div><dt>{t.date}</dt><dd>{selectedLog.date}</dd></div>
                <div><dt>{t.department}</dt><dd>{selectedLog.department}</dd></div>
                <div><dt>{t.checkInColumn}</dt><dd>{selectedLog.checkIn}</dd></div>
                <div><dt>{t.checkOutColumn}</dt><dd>{selectedLog.checkOut}</dd></div>
                <div><dt>{t.totalHours}</dt><dd>{selectedLog.totalHours}</dd></div>
                <div><dt>{t.overtime}</dt><dd>{selectedLog.overtime}</dd></div>
              </dl>
              <div className="detail-actions">
                <button type="button" onClick={() => handleAdjustment(selectedLog)} disabled={selectedLog.adjustmentStatus === "Pending"}>
                  {t.requestAdjustment}
                </button>
                {canApprove(user, selectedLog) && (
                  <>
                    <button type="button" onClick={() => handleDecision(selectedLog, "Approved")}>{t.approve}</button>
                    <button type="button" onClick={() => handleDecision(selectedLog, "Rejected")}>{t.reject}</button>
                  </>
                )}
              </div>
            </>
          ) : (
            <p>{t.noLogsFound}</p>
          )}
          <div className="audit-panel">
            <h4>{t.auditLog}</h4>
            {visibleAuditLogs.length > 0 ? visibleAuditLogs.map((entry) => <p key={entry}>{entry}</p>) : <p>{t.noAuditLogs}</p>}
          </div>
        </aside>
      </div>
    </section>
  );
}

function updateLogList(logs: AttendanceLog[] | null, updatedLog: AttendanceLog) {
  if (!logs) return [updatedLog];
  return logs.map((log) => (log.id === updatedLog.id ? updatedLog : log));
}

function downloadBlob(blob: Blob, format: "Excel" | "PDF") {
  const extension = format === "Excel" ? "xls" : format.toLowerCase();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance-logs.${extension}`;
  link.click();
  URL.revokeObjectURL(url);
}

function canApprove(user: User, log: AttendanceLog) {
  if (log.payrollLocked) return false;
  if (user.role === "Admin" || user.role === "HR") return true;
  return user.role === "Manager" && log.managerId === user.id;
}

function getRoleScopedLogs(logs: AttendanceLog[], user: User) {
  if (user.role === "Employee") {
    return logs.filter((log) => log.employeeId === user.id || log.employeeName === user.name);
  }

  if (user.role === "Manager") {
    return logs.filter((log) => log.managerId === user.id || log.employeeId === user.id);
  }

  if (user.role === "Payroll") {
    return logs.filter((log) => log.payrollLocked);
  }

  return logs;
}

function isWithinDateRange(workDate: string, dateRange: DateRange, now: Date) {
  const date = new Date(`${workDate}T00:00:00`);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (dateRange === "day") {
    return date.getTime() === start.getTime();
  }

  if (dateRange === "week") {
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    return date >= start;
  }

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function downloadExport(format: "Excel" | "PDF", logs: AttendanceLog[], t: Translation) {
  const headers = [t.date, t.employee, t.department, t.checkInColumn, t.checkOutColumn, t.totalHours, t.overtime, t.status, t.adjustmentStatus];
  const rows = logs.map((log) => [
    log.date,
    log.employeeName,
    log.department,
    log.checkIn,
    log.checkOut,
    log.totalHours,
    log.overtime,
    translateStatus(log.status, t),
    translateAdjustment(log.adjustmentStatus, t)
  ]);
  const exportRows = [headers, ...rows];
  const extension = format === "Excel" ? "xls" : format.toLowerCase();
  const blob = format === "PDF" ? buildSimplePdfBlob("Attendance Logs", exportRows) : buildExcelBlob("Attendance Logs", exportRows);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `attendance-logs.${extension}`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildExcelBlob(title: string, rows: string[][]) {
  const columns = [95, 110, 125, 90, 90, 95, 85, 105, 145]
    .map((width) => `<Column ss:Width="${width}" />`)
    .join("");
  const titleRow = `<Row ss:Height="24"><Cell ss:MergeAcross="8" ss:StyleID="Title"><Data ss:Type="String">${escapeXml(title)}</Data></Cell></Row>`;
  const emptyRow = "<Row />";
  const dataRows = rows
    .map((row, rowIndex) => {
      const styleId = rowIndex === 0 ? "Header" : "Cell";
      const cells = row.map((cell) => `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");
  const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Title"><Font ss:Bold="1" ss:Size="16" /></Style>
    <Style ss:ID="Header"><Font ss:Bold="1" /><Interior ss:Color="#EAF0FF" ss:Pattern="Solid" /></Style>
    <Style ss:ID="Cell" />
  </Styles>
  <Worksheet ss:Name="attendance-logs">
    <Table>
      ${columns}
      ${titleRow}
      ${emptyRow}
      ${dataRows}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
      <FreezePanes />
      <FrozenNoSplit />
      <SplitHorizontal>3</SplitHorizontal>
      <TopRowBottomPane>3</TopRowBottomPane>
      <ActivePane>2</ActivePane>
    </WorksheetOptions>
  </Worksheet>
</Workbook>`;

  return new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSimplePdfBlob(title: string, rows: string[][]) {
  const tableRows = rows.slice(0, 24);
  const columns = [70, 82, 82, 62, 62, 65, 55, 62, 82];
  const startX = 24;
  const startY = 520;
  const rowHeight = 22;
  const tableWidth = columns.reduce((sum, width) => sum + width, 0);
  const tableHeight = rowHeight * tableRows.length;
  let currentX = startX;
  const verticalLines = columns
    .map((width) => {
      const command = `${currentX} ${startY} m ${currentX} ${startY - tableHeight} l S`;
      currentX += width;
      return command;
    })
    .concat(`${startX + tableWidth} ${startY} m ${startX + tableWidth} ${startY - tableHeight} l S`)
    .join("\n");
  const horizontalLines = Array.from({ length: tableRows.length + 1 }, (_, index) => {
    const y = startY - index * rowHeight;
    return `${startX} ${y} m ${startX + tableWidth} ${y} l S`;
  }).join("\n");
  const textCommands = tableRows
    .map((row, rowIndex) => {
      let x = startX + 4;
      const y = startY - rowIndex * rowHeight - 15;
      const fontSize = rowIndex === 0 ? 7 : 6;
      return row
        .map((cell, cellIndex) => {
          const command = `BT /F1 ${fontSize} Tf ${x} ${y} Td (${escapePdfText(cell).slice(0, cellIndex === 8 ? 18 : 14)}) Tj ET`;
          x += columns[cellIndex];
          return command;
        })
        .join("\n");
    })
    .join("\n");
  const drawingCommands = [
    "0.85 w",
    "BT /F1 18 Tf 24 560 Td (Attendance Logs) Tj ET",
    "BT /F1 9 Tf 24 542 Td (Exported attendance records) Tj ET",
    verticalLines,
    horizontalLines,
    textCommands
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${drawingCommands.length} >>\nstream\n${drawingCommands}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function escapePdfText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function getScopeText(user: User, t: Translation) {
  if (user.role === "Employee") return t.employeeLogScope;
  if (user.role === "Manager") return t.managerLogScope;
  if (user.role === "Payroll") return t.payrollLogScope;
  return t.companyLogScope;
}

function statusClassName(status: AttendanceLog["status"]) {
  if (status === "On Time" || status === "Adjusted") return "success";
  if (status === "Late" || status === "Early Leave" || status === "Missing Check-out") return "warning";
  return "muted";
}

function adjustmentClassName(status: AttendanceLog["adjustmentStatus"]) {
  if (status === "Approved") return "success";
  if (status === "Pending") return "warning";
  if (status === "Rejected") return "danger";
  return "muted";
}

function translateStatus(status: AttendanceLog["status"], t: Translation) {
  if (status === "On Time") return t.onTime;
  if (status === "Late") return t.late;
  if (status === "Early Leave") return t.earlyLeave;
  if (status === "On Leave") return t.onLeave;
  if (status === "Missing Check-out") return t.missingSession;
  if (status === "Holiday") return t.holiday;
  if (status === "Weekend") return t.weekend;
  return t.adjusted;
}

function translateAdjustment(status: AttendanceLog["adjustmentStatus"], t: Translation) {
  if (status === "Pending") return t.pending;
  if (status === "Approved") return t.approved;
  if (status === "Rejected") return t.rejected;
  return t.none;
}
