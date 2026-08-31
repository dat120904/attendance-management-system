import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { activeAttendanceSessions, attendanceLogs, auditLogs, users } from "./data.js";
import type { AttendanceLog } from "./types.js";
import { getUserByToken, login, logout, publicUser } from "./auth.js";

const port = Number(process.env.PORT ?? 4000);

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    if (request.method === "POST" && request.url === "/api/auth/login") {
      const body = await readJsonBody<{ email?: string; password?: string }>(request);
      const result = login(body.email ?? "", body.password ?? "");

      if ("error" in result) {
        sendJson(response, result.status ?? 401, { error: result.error });
        return;
      }

      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && request.url === "/api/auth/logout") {
      const token = getBearerToken(request);
      if (token) logout(token);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && request.url === "/api/auth/forgot-password") {
      sendJson(response, 200, { ok: true, message: "Reset link generated for demo flow." });
      return;
    }

    if (request.method === "POST" && request.url === "/api/auth/reset-password") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && request.url === "/api/me") {
      const user = requireUser(request, response);
      if (!user) return;
      sendJson(response, 200, { user });
      return;
    }

    if (request.method === "GET" && request.url === "/api/dashboard") {
      const user = requireUser(request, response);
      if (!user) return;

      const logs = user.role === "Employee" ? attendanceLogs.filter((log) => log.employeeId === user.id) : attendanceLogs;
      const today = new Date();
      const nextThanksgiving = getNextThanksgiving(today);

      sendJson(response, 200, {
        greeting: "Good morning",
        summaryDate: formatSummaryDate(today),
        checkedInAt: "08:30 AM",
        sessionSeconds: 13515,
        weeklyHours: 32.5,
        weeklyTarget: 40,
        remainingLeaveDays: user.remainingLeaveDays,
        nextHoliday: {
          name: "Thanksgiving",
          dateRange: nextThanksgiving.toISOString()
        },
        logs,
        managerAlerts: canViewTeamDashboard(user.role) ? ["3 late arrivals this week", "1 missing check-out needs review"] : [],
        payrollReadiness: user.role === "Payroll" || user.role === "Admin" ? "92% ready" : null
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/attendance/check-in") {
      const user = requireUser(request, response);
      if (!user) return;

      const currentSession = activeAttendanceSessions.get(user.id);
      if (currentSession) {
        sendJson(response, 409, { error: "Active attendance session already exists", session: currentSession });
        return;
      }

      const session = {
        id: `session-${Date.now()}`,
        employeeId: user.id,
        checkInAt: new Date().toISOString(),
        device: request.headers["user-agent"] ?? "Browser device",
        ipAddress: request.socket.remoteAddress ?? "Office network",
        location: "Headquarters"
      };

      activeAttendanceSessions.set(user.id, session);
      sendJson(response, 201, { session });
      return;
    }

    if (request.method === "POST" && request.url === "/api/attendance/check-out") {
      const user = requireUser(request, response);
      if (!user) return;

      const session = activeAttendanceSessions.get(user.id);
      if (!session) {
        sendJson(response, 400, { error: "Check-in is required before check-out" });
        return;
      }

      const checkInAt = new Date(session.checkInAt);
      const checkOutAt = new Date();
      const totalSeconds = Math.max(0, Math.floor((checkOutAt.getTime() - checkInAt.getTime()) / 1000));
      const log = {
        id: `log-${Date.now()}`,
        employeeId: user.id,
        employeeName: user.name,
        department: roleDepartment(user.role),
        managerId: "u-admin",
        workDate: checkOutAt.toISOString().slice(0, 10),
        date: formatLogDate(checkOutAt),
        checkIn: formatClockTime(checkInAt),
        checkOut: formatClockTime(checkOutAt),
        totalHours: formatTotalHours(totalSeconds),
        overtime: "0h 0m",
        status: "On Time" as const,
        adjustmentStatus: "None" as const,
        payrollLocked: false
      };

      attendanceLogs.unshift(log);
      activeAttendanceSessions.delete(user.id);
      sendJson(response, 200, { log });
      return;
    }

    if (request.method === "GET" && request.url === "/api/users") {
      const user = requireUser(request, response);
      if (!user) return;

      if (user.role !== "Admin" && user.role !== "HR") {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      sendJson(response, 200, { users: users.map(publicUser) });
      return;
    }

    if (request.method === "GET" && request.url?.startsWith("/api/attendance/logs")) {
      const user = requireUser(request, response);
      if (!user) return;

      const url = new URL(request.url, `http://${request.headers.host}`);
      const scopedLogs = filterAttendanceLogs(getRoleScopedLogs(attendanceLogs, user), url.searchParams);
      sendJson(response, 200, { logs: scopedLogs });
      return;
    }

    if (request.method === "GET" && request.url?.startsWith("/api/attendance/export")) {
      const user = requireUser(request, response);
      if (!user) return;

      const url = new URL(request.url, `http://${request.headers.host}`);
      const format = url.searchParams.get("format") ?? "excel";
      if (format !== "excel" && format !== "pdf") {
        sendJson(response, 400, { error: "Unsupported export format" });
        return;
      }
      const scopedLogs = filterAttendanceLogs(getRoleScopedLogs(attendanceLogs, user), url.searchParams);
      const rows = toExportRows(scopedLogs);
      const body = format === "pdf" ? buildSimplePdf("Attendance Logs", rows) : buildExcelWorkbook("Attendance Logs", rows);
      response.writeHead(200, {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="attendance-logs.${format === "excel" ? "xls" : "pdf"}"`
      });
      response.end(body);
      return;
    }

    if (request.method === "POST" && request.url?.match(/^\/api\/attendance\/logs\/[^/]+\/adjustment$/)) {
      const user = requireUser(request, response);
      if (!user) return;

      const logId = request.url.split("/")[4];
      const log = attendanceLogs.find((item) => item.id === logId);
      if (!log || !canViewLog(user, log)) {
        sendJson(response, 404, { error: "Log not found" });
        return;
      }

      if (log.payrollLocked) {
        sendJson(response, 409, { error: "Payroll period is locked" });
        return;
      }

      log.adjustmentStatus = "Pending";
      addAudit(user.id, "attendance.adjustment.requested", log.id);
      sendJson(response, 200, { log });
      return;
    }

    if (request.method === "POST" && request.url?.match(/^\/api\/attendance\/logs\/[^/]+\/(approve|reject)$/)) {
      const user = requireUser(request, response);
      if (!user) return;

      const [, , , , logId, action] = request.url.split("/");
      const log = attendanceLogs.find((item) => item.id === logId);
      if (!log || !canApproveAdjustment(user, log)) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      if (log.payrollLocked) {
        sendJson(response, 409, { error: "Payroll period is locked" });
        return;
      }

      log.adjustmentStatus = action === "approve" ? "Approved" : "Rejected";
      if (action === "approve") log.status = "Adjusted";
      addAudit(user.id, `attendance.adjustment.${action}d`, log.id);
      sendJson(response, 200, { log });
      return;
    }

    if (request.method === "GET" && request.url === "/api/audit-logs") {
      const user = requireUser(request, response);
      if (!user) return;

      if (user.role !== "Admin" && user.role !== "HR" && user.role !== "Payroll") {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      sendJson(response, 200, { auditLogs });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the old backend process or run with another PORT.`);
    console.error(`Windows check: netstat -ano | findstr :${port}`);
    console.error("Windows stop: taskkill /PID <PID> /F");
    process.exit(1);
  }

  throw error;
});

server.listen(port, () => {
  console.log(`Workforce Pro API listening on http://localhost:${port}`);
});

function canViewTeamDashboard(role: string) {
  return role === "Manager" || role === "HR" || role === "Admin";
}

function roleDepartment(role: string) {
  if (role === "HR") return "People";
  if (role === "Payroll") return "Finance";
  if (role === "Manager") return "Operations";
  if (role === "Admin") return "Administration";
  return "Product";
}

function getRoleScopedLogs(logs: AttendanceLog[], user: { id: string; name: string; role: string }) {
  if (user.role === "Employee") return logs.filter((log) => log.employeeId === user.id);
  if (user.role === "Manager") return logs.filter((log) => log.managerId === user.id || log.employeeId === user.id);
  if (user.role === "Payroll") return logs.filter((log) => log.payrollLocked);
  return logs;
}

function canViewLog(user: { id: string; role: string }, log: AttendanceLog) {
  if (user.role === "Admin" || user.role === "HR" || user.role === "Payroll") return true;
  if (user.role === "Manager") return log.managerId === user.id || log.employeeId === user.id;
  return log.employeeId === user.id;
}

function canApproveAdjustment(user: { id: string; role: string }, log: AttendanceLog) {
  if (log.payrollLocked) return false;
  if (user.role === "Admin" || user.role === "HR") return true;
  return user.role === "Manager" && log.managerId === user.id;
}

function filterAttendanceLogs(logs: AttendanceLog[], params: URLSearchParams) {
  const status = params.get("status");
  const query = params.get("query")?.trim().toLowerCase();
  const dateRange = params.get("dateRange");
  const now = new Date();

  return logs.filter((log) => {
    const matchesStatus = !status || status === "All" || log.status === status;
    const matchesQuery =
      !query ||
      log.employeeName.toLowerCase().includes(query) ||
      log.department.toLowerCase().includes(query) ||
      log.date.toLowerCase().includes(query);
    const matchesDate = !dateRange || isWithinDateRange(log.workDate, dateRange, now);
    return matchesStatus && matchesQuery && matchesDate;
  });
}

function isWithinDateRange(workDate: string, dateRange: string, now: Date) {
  const date = new Date(`${workDate}T00:00:00`);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (dateRange === "day") return date.getTime() === start.getTime();
  if (dateRange === "week") {
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    return date >= start;
  }
  if (dateRange === "month") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  return true;
}

function toExportRows(logs: AttendanceLog[]) {
  const headers = ["Date", "Employee", "Department", "Check-in", "Check-out", "Total hours", "Overtime", "Status", "Adjustment status"];
  const rows = logs.map((log) => [log.date, log.employeeName, log.department, log.checkIn, log.checkOut, log.totalHours, log.overtime, log.status, log.adjustmentStatus]);
  return [headers, ...rows];
}

function buildExcelWorkbook(title: string, rows: string[][]) {
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

  return `<?xml version="1.0" encoding="UTF-8"?>
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
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSimplePdf(title: string, rows: string[][]) {
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
    `BT /F1 18 Tf 24 560 Td (${escapePdfText(title)}) Tj ET`,
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

  return pdf;
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

function addAudit(actorId: string, action: string, targetId: string) {
  auditLogs.unshift({
    id: `audit-${Date.now()}`,
    actorId,
    action,
    targetId,
    createdAt: new Date().toISOString()
  });
}

function requireUser(request: IncomingMessage, response: ServerResponse) {
  const token = getBearerToken(request);
  const user = token ? getUserByToken(token) : null;

  if (!user) {
    sendJson(response, 401, { error: "Unauthorized" });
    return null;
  }

  return user;
}

function getBearerToken(request: IncomingMessage) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length);
}

function setCorsHeaders(response: ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function formatClockTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatLogDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    weekday: "short"
  });
}

function formatSummaryDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  });
}

function getThanksgivingDate(year: number) {
  const novemberFirst = new Date(year, 10, 1);
  const dayOfWeek = novemberFirst.getDay();
  const firstThursdayDate = 1 + ((4 - dayOfWeek + 7) % 7);
  return new Date(year, 10, firstThursdayDate + 21);
}

function getNextThanksgiving(baseDate: Date) {
  const currentYearThanksgiving = getThanksgivingDate(baseDate.getFullYear());
  if (baseDate <= currentYearThanksgiving) {
    return currentYearThanksgiving;
  }

  return getThanksgivingDate(baseDate.getFullYear() + 1);
}

function formatTotalHours(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return `${hours}h ${minutes}m`;
}

function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
    });

    request.on("end", () => {
      if (!raw) {
        resolve({} as T);
        return;
      }

      try {
        resolve(JSON.parse(raw) as T);
      } catch (error) {
        reject(error);
      }
    });
  });
}
