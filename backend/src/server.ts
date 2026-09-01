import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { activeAttendanceSessions, attendanceLogs, auditLogs, leaveRequests, leaveWorkflowConfig, users } from "./data.js";
import type { AttendanceLog, LeaveAttachment, LeaveRequest, LeaveType, LeaveWorkflowConfig } from "./types.js";
import { getUserByToken, login, logout, publicUser, registerAccount } from "./auth.js";
import type { UserRole } from "./types.js";

const port = Number(process.env.PORT ?? 4000);
const uploadRoot = resolve(process.cwd(), "uploads", "leave-attachments");
const maxAttachmentBytes = 10 * 1024 * 1024;

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

    if (request.method === "POST" && request.url === "/api/auth/register") {
      const body = await readJsonBody<{ name?: string; email?: string; role?: UserRole; department?: string; password?: string; confirmPassword?: string }>(request);
      const validationError = validateRegisterBody(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const result = registerAccount({
        name: body.name ?? "",
        email: body.email ?? "",
        role: body.role ?? "Employee",
        department: body.department ?? roleDepartment(body.role ?? "Employee"),
        password: body.password ?? ""
      });

      if ("error" in result) {
        sendJson(response, result.status ?? 400, { error: result.error });
        return;
      }

      sendJson(response, 201, result);
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

    if (request.method === "GET" && request.url?.startsWith("/api/leave-attachments/")) {
      const user = requireUser(request, response);
      if (!user) return;

      const storageKey = decodeURIComponent(request.url.split("/").pop() ?? "");
      const leaveRequest = leaveRequests.find((item) => item.attachment?.storageKey === storageKey);
      if (!leaveRequest || !getRoleScopedLeaveRequests([leaveRequest], user).length) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      const filePath = resolve(uploadRoot, storageKey);
      if (!filePath.startsWith(uploadRoot) || !existsSync(filePath)) {
        sendJson(response, 404, { error: "Attachment not found" });
        return;
      }

      response.writeHead(200, {
        "Content-Type": leaveRequest.attachment?.mimeType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(leaveRequest.attachment?.name ?? "attachment")}"`
      });
      createReadStream(filePath).pipe(response);
      return;
    }

    if (request.method === "GET" && request.url === "/api/leave-workflow") {
      const user = requireUser(request, response);
      if (!user) return;

      sendJson(response, 200, { workflow: leaveWorkflowConfig });
      return;
    }

    if (request.method === "PUT" && request.url === "/api/leave-workflow") {
      const user = requireUser(request, response);
      if (!user) return;

      if (user.role !== "Admin") {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      const body = await readJsonBody<Partial<LeaveWorkflowConfig>>(request);
      updateLeaveWorkflowConfig(body);
      addAudit(user.id, "leave.workflow.updated", "leave-workflow");
      sendJson(response, 200, { workflow: leaveWorkflowConfig });
      return;
    }

    if (request.method === "GET" && request.url === "/api/leave-requests") {
      const user = requireUser(request, response);
      if (!user) return;

      sendJson(response, 200, { requests: getRoleScopedLeaveRequests(leaveRequests, user) });
      return;
    }

    if (request.method === "POST" && request.url === "/api/leave-requests") {
      const user = requireUser(request, response);
      if (!user) return;
      if (user.role === "Payroll") {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      const body = request.headers["content-type"]?.startsWith("multipart/form-data")
        ? await readMultipartLeaveBody(request, request.headers["content-type"], user.id)
        : await readJsonBody<{ type?: LeaveType; startDate?: string; endDate?: string; reason?: string; attachmentName?: string; attachment?: LeaveAttachment; submitMode?: "draft" | "submit" }>(request);
      const validationError = validateLeaveRequestBody(body, user.id, undefined, body.submitMode === "draft");
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const days = calculateLeaveDays(body.startDate ?? "", body.endDate ?? "");
      if (body.submitMode !== "draft" && leaveWorkflowConfig.annualLeaveRequiresBalance && body.type === "Annual Leave" && days > user.remainingLeaveDays) {
        sendJson(response, 409, { error: "Leave request exceeds remaining balance" });
        return;
      }

      if (body.submitMode !== "draft" && hasLeaveOverlap(leaveRequests, user.id, body.startDate ?? "", body.endDate ?? "")) {
        sendJson(response, 409, { error: "Leave request overlaps with an existing request" });
        return;
      }

      const requestItem: LeaveRequest = {
        id: `leave-${Date.now()}`,
        employeeId: user.id,
        employeeName: user.name,
        department: roleDepartment(user.role),
        managerId: user.role === "Manager" ? "u-admin" : "u-manager",
        type: body.type ?? "Annual Leave",
        startDate: body.startDate ?? "",
        endDate: body.endDate ?? "",
        days,
        reason: body.reason?.trim() ?? "",
        attachmentName: body.attachment?.name?.trim() || body.attachmentName?.trim() || "",
        attachment: normalizeAttachment(body.attachment, user.id),
        status: body.submitMode === "draft" ? "Draft" : "Pending Manager",
        createdAt: new Date().toISOString()
      };

      leaveRequests.unshift(requestItem);
      addAudit(user.id, requestItem.status === "Draft" ? "leave.request.draft_saved" : "leave.request.created", requestItem.id);
      sendJson(response, 201, { request: requestItem });
      return;
    }

    if (request.method === "POST" && request.url?.match(/^\/api\/leave-requests\/[^/]+\/submit$/)) {
      const user = requireUser(request, response);
      if (!user) return;

      const requestId = request.url.split("/")[3];
      const requestItem = leaveRequests.find((item) => item.id === requestId);
      if (!requestItem || requestItem.employeeId !== user.id || requestItem.status !== "Draft") {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      const validationError = validateLeaveRequestBody(requestItem, user.id, requestItem.id, false);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      if (leaveWorkflowConfig.annualLeaveRequiresBalance && requestItem.type === "Annual Leave" && requestItem.days > user.remainingLeaveDays) {
        sendJson(response, 409, { error: "Leave request exceeds remaining balance" });
        return;
      }

      if (hasLeaveOverlap(leaveRequests, user.id, requestItem.startDate, requestItem.endDate, requestItem.id)) {
        sendJson(response, 409, { error: "Leave request overlaps with an existing request" });
        return;
      }

      requestItem.status = "Pending Manager";
      addAudit(user.id, "leave.request.submitted", requestItem.id);
      sendJson(response, 200, { request: requestItem });
      return;
    }

    if (request.method === "POST" && request.url?.match(/^\/api\/leave-requests\/[^/]+\/cancel$/)) {
      const user = requireUser(request, response);
      if (!user) return;

      const requestId = request.url.split("/")[3];
      const requestItem = leaveRequests.find((item) => item.id === requestId);
      if (!requestItem || !canCancelLeaveRequest(user, requestItem)) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      requestItem.status = "Cancelled";
      addAudit(user.id, "leave.request.cancelled", requestItem.id);
      sendJson(response, 200, { request: requestItem });
      return;
    }

    if (request.method === "POST" && request.url?.match(/^\/api\/leave-requests\/[^/]+\/(approve|reject)$/)) {
      const user = requireUser(request, response);
      if (!user) return;

      const [, , , requestId, action] = request.url.split("/");
      const requestItem = leaveRequests.find((item) => item.id === requestId);
      if (!requestItem || !canApproveLeaveRequest(user, requestItem)) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      if (action === "reject") {
        requestItem.status = "Rejected";
        addAudit(user.id, "leave.request.rejected", requestItem.id);
        sendJson(response, 200, { request: requestItem });
        return;
      }

      if (requestItem.status === "Pending Manager" && user.role === "Manager" && leaveWorkflowConfig.requireHrApproval) {
        requestItem.status = "Pending HR";
        addAudit(user.id, "leave.request.manager_approved", requestItem.id);
        sendJson(response, 200, { request: requestItem });
        return;
      }

      requestItem.status = "Approved";
      const employee = users.find((item) => item.id === requestItem.employeeId);
      if (employee && leaveWorkflowConfig.annualLeaveRequiresBalance && requestItem.type === "Annual Leave") {
        employee.remainingLeaveDays = Math.max(0, employee.remainingLeaveDays - requestItem.days);
      }

      const generatedLogs = createLeaveAttendanceLogs(requestItem);
      attendanceLogs.unshift(...generatedLogs);
      addAudit(user.id, "leave.request.final_approved", requestItem.id);
      sendJson(response, 200, { request: requestItem, attendanceLog: generatedLogs[0], attendanceLogs: generatedLogs, employeeRemainingLeaveDays: employee?.remainingLeaveDays });
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

function validateRegisterBody(body: { name?: string; email?: string; role?: UserRole; department?: string; password?: string; confirmPassword?: string }) {
  const allowedRoles: UserRole[] = ["Employee", "Manager", "HR", "Payroll", "Admin"];
  if (!body.name?.trim() || !body.email?.trim() || !body.password || !body.confirmPassword) return "Required fields are missing";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return "Invalid email";
  if (!allowedRoles.includes(body.role ?? "Employee")) return "Invalid role";
  if (body.password.length < 6) return "Password must be at least 6 characters";
  if (body.password !== body.confirmPassword) return "Passwords do not match";
  return "";
}

function validateLeaveRequestBody(body: { type?: LeaveType; startDate?: string; endDate?: string; attachmentName?: string; attachment?: LeaveAttachment }, employeeId: string, ignoredRequestId?: string, allowDraft = false) {
  const allowedTypes: LeaveType[] = ["Annual Leave", "Sick Leave", "Unpaid Leave", "Compensatory Leave"];
  if (!body.type || !allowedTypes.includes(body.type)) return "Invalid leave type";
  if (!body.startDate || !body.endDate) return "Leave dates are required";
  if (calculateLeaveDays(body.startDate, body.endDate) <= 0) return "Invalid leave date range";
  if (leaveWorkflowConfig.attachmentRequiredForSickLeave && body.type === "Sick Leave" && !body.attachmentName && !body.attachment?.name) return "Attachment is required for sick leave";
  if (!allowDraft && hasLeaveOverlap(leaveRequests, employeeId, body.startDate, body.endDate, ignoredRequestId)) return "Leave request overlaps with an existing request";
  return "";
}

function getRoleScopedLeaveRequests(requests: LeaveRequest[], user: { id: string; role: string }) {
  if (user.role === "Employee") return requests.filter((request) => request.employeeId === user.id);
  if (user.role === "Manager") return requests.filter((request) => request.managerId === user.id || request.employeeId === user.id);
  if (user.role === "Payroll") return requests.filter((request) => request.status === "Approved");
  return requests;
}

function canCancelLeaveRequest(user: { id: string; role: string }, request: LeaveRequest) {
  if (user.role === "Admin") return request.status !== "Approved";
  if (request.employeeId !== user.id) return false;
  if (request.status === "Draft") return true;
  return leaveWorkflowConfig.allowEmployeeCancelBeforeManager && request.status === "Pending Manager";
}

function canApproveLeaveRequest(user: { id: string; role: string }, request: LeaveRequest) {
  if (user.role === "Admin") return request.status === "Pending Manager" || request.status === "Pending HR";
  if (request.status === "Pending Manager") return user.role === "Manager" && request.managerId === user.id;
  if (request.status === "Pending HR") return user.role === "HR";
  return false;
}

function calculateLeaveDays(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function hasLeaveOverlap(requests: LeaveRequest[], employeeId: string, startDate: string, endDate: string, ignoredRequestId?: string) {
  const start = new Date(`${startDate}T00:00:00`).getTime();
  const end = new Date(`${endDate}T00:00:00`).getTime();
  return requests.some((request) => {
    if (request.id === ignoredRequestId || request.employeeId !== employeeId || request.status === "Rejected" || request.status === "Cancelled") return false;
    const requestStart = new Date(`${request.startDate}T00:00:00`).getTime();
    const requestEnd = new Date(`${request.endDate}T00:00:00`).getTime();
    return start <= requestEnd && end >= requestStart;
  });
}

function createLeaveAttendanceLogs(request: LeaveRequest): AttendanceLog[] {
  return Array.from({ length: request.days }, (_, index) => {
    const date = new Date(`${request.startDate}T00:00:00`);
    date.setDate(date.getDate() + index);
    const workDate = date.toISOString().slice(0, 10);
    return {
      id: `leave-log-${request.id}-${index + 1}`,
      employeeId: request.employeeId,
      employeeName: request.employeeName,
      department: request.department,
      managerId: request.managerId,
      workDate,
      date: formatLogDate(date),
      checkIn: "--",
      checkOut: "--",
      totalHours: "0h 0m",
      overtime: "0h 0m",
      status: "On Leave",
      adjustmentStatus: "None",
      payrollLocked: false
    };
  });
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

function updateLeaveWorkflowConfig(body: Partial<LeaveWorkflowConfig>) {
  if (typeof body.requireHrApproval === "boolean") leaveWorkflowConfig.requireHrApproval = body.requireHrApproval;
  if (typeof body.annualLeaveRequiresBalance === "boolean") leaveWorkflowConfig.annualLeaveRequiresBalance = body.annualLeaveRequiresBalance;
  if (typeof body.allowEmployeeCancelBeforeManager === "boolean") leaveWorkflowConfig.allowEmployeeCancelBeforeManager = body.allowEmployeeCancelBeforeManager;
  if (typeof body.attachmentRequiredForSickLeave === "boolean") leaveWorkflowConfig.attachmentRequiredForSickLeave = body.attachmentRequiredForSickLeave;
  if (typeof body.defaultAnnualLeaveDays === "number" && Number.isFinite(body.defaultAnnualLeaveDays)) {
    leaveWorkflowConfig.defaultAnnualLeaveDays = Math.max(0, Math.floor(body.defaultAnnualLeaveDays));
  }
}

function normalizeAttachment(attachment: LeaveAttachment | undefined, actorId: string) {
  if (!attachment?.name) return undefined;
  return {
    name: attachment.name.trim(),
    mimeType: attachment.mimeType || "application/octet-stream",
    size: Math.max(0, Number(attachment.size) || 0),
    url: attachment.url,
    storageKey: attachment.storageKey,
    dataUrl: attachment.dataUrl,
    uploadedAt: attachment.uploadedAt || new Date().toISOString(),
    uploadedBy: attachment.uploadedBy || actorId
  };
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

async function readMultipartLeaveBody(request: IncomingMessage, contentType: string | undefined, actorId: string) {
  const boundary = contentType?.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/)?.[1] ?? contentType?.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/)?.[2];
  if (!boundary) throw new Error("Missing multipart boundary");

  const buffer = await readRawBody(request);
  if (buffer.length > maxAttachmentBytes + 1024 * 128) throw new Error("Request body is too large");

  const body: { type?: LeaveType; startDate?: string; endDate?: string; reason?: string; attachmentName?: string; attachment?: LeaveAttachment; submitMode?: "draft" | "submit" } = {};
  const raw = buffer.toString("latin1");
  const parts = raw.split(`--${boundary}`).slice(1, -1);

  for (const rawPart of parts) {
    const part = rawPart.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) continue;

    const headerText = part.slice(0, headerEnd);
    let value = part.slice(headerEnd + 4);
    if (value.endsWith("\r\n")) value = value.slice(0, -2);

    const name = headerText.match(/name="([^"]+)"/)?.[1];
    const filename = headerText.match(/filename="([^"]*)"/)?.[1];
    const mimeType = headerText.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() ?? "application/octet-stream";
    if (!name) continue;

    if (filename) {
      const fileBuffer = Buffer.from(value, "latin1");
      if (fileBuffer.length > maxAttachmentBytes) throw new Error("Attachment is too large");

      mkdirSync(uploadRoot, { recursive: true });
      const safeName = sanitizeFilename(filename);
      const storageKey = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
      const filePath = join(uploadRoot, storageKey);
      writeFileSync(filePath, fileBuffer);
      body.attachmentName = safeName;
      body.attachment = {
        name: safeName,
        mimeType,
        size: fileBuffer.length,
        storageKey,
        url: `/api/leave-attachments/${encodeURIComponent(storageKey)}`,
        uploadedAt: new Date().toISOString(),
        uploadedBy: actorId
      };
      continue;
    }

    const textValue = Buffer.from(value, "latin1").toString("utf8");
    if (name === "type") body.type = textValue as LeaveType;
    if (name === "startDate") body.startDate = textValue;
    if (name === "endDate") body.endDate = textValue;
    if (name === "reason") body.reason = textValue;
    if (name === "attachmentName") body.attachmentName = textValue;
    if (name === "submitMode") body.submitMode = textValue === "draft" ? "draft" : "submit";
  }

  return body;
}

function sanitizeFilename(filename: string) {
  const fallback = "attachment";
  return filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || fallback;
}

function readRawBody(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
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
