import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { activeAttendanceSessions, attendanceLogs, auditLogs, leaveRequests, leaveWorkflowConfig, payrollPeriods, systemSettings, users } from "./data.js";
import type { AttendanceLog, LeaveAttachment, LeaveRequest, LeaveType, LeaveWorkflowConfig, PayrollPeriod, PayrollSummaryRow, SystemSettings, User } from "./types.js";
import { getUserByToken, login, logout, publicUser, registerAccount, setUserPassword } from "./auth.js";
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


    if (request.method === "GET" && request.url === "/api/employees") {
      const user = requireUser(request, response);
      if (!user) return;
      if (!canViewEmployees(user.role)) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      sendJson(response, 200, { users: getRoleScopedEmployees(users, user).map(publicEmployee) });
      return;
    }

    if (request.method === "POST" && request.url === "/api/employees") {
      const user = requireUser(request, response);
      if (!user) return;
      if (!canManageEmployees(user.role)) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      const body = await readJsonBody<Partial<User> & { password?: string }>(request);
      const validationError = validateEmployeeBody(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      if (users.some((item) => item.email.toLowerCase() === body.email?.trim().toLowerCase())) {
        sendJson(response, 409, { error: "Email already exists" });
        return;
      }

      const employee = buildEmployee(body);
      users.push(employee);
      setUserPassword(employee.email, body.password || "password");
      addAudit(user.id, "employee.created", employee.id);
      sendJson(response, 201, { user: publicEmployee(employee) });
      return;
    }

    if (request.method === "PUT" && request.url?.match(/^\/api\/employees\/[^/]+$/)) {
      const user = requireUser(request, response);
      if (!user) return;
      if (!canManageEmployees(user.role)) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      const employeeId = request.url.split("/")[3];
      const employee = users.find((item) => item.id === employeeId);
      if (!employee) {
        sendJson(response, 404, { error: "Employee not found" });
        return;
      }

      const body = await readJsonBody<Partial<User>>(request);
      const validationError = validateEmployeeBody({ ...employee, ...body });
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }
      const nextEmail = body.email?.trim().toLowerCase();
      if (nextEmail && users.some((item) => item.id !== employee.id && item.email.toLowerCase() === nextEmail)) {
        sendJson(response, 409, { error: "Email already exists" });
        return;
      }

      updateEmployee(employee, body);
      addAudit(user.id, "employee.updated", employee.id);
      sendJson(response, 200, { user: publicEmployee(employee) });
      return;
    }

    if (request.method === "POST" && request.url?.match(/^\/api\/employees\/[^/]+\/lock$/)) {
      const user = requireUser(request, response);
      if (!user) return;
      if (!canManageEmployees(user.role)) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      const employeeId = request.url.split("/")[3];
      if (employeeId === user.id) {
        sendJson(response, 409, { error: "You cannot lock your own account" });
        return;
      }
      const employee = users.find((item) => item.id === employeeId);
      if (!employee) {
        sendJson(response, 404, { error: "Employee not found" });
        return;
      }

      const body = await readJsonBody<{ locked?: boolean }>(request);
      employee.locked = Boolean(body.locked);
      employee.employmentStatus = employee.locked ? "Locked" : "Active";
      addAudit(user.id, employee.locked ? "employee.locked" : "employee.unlocked", employee.id);
      sendJson(response, 200, { user: publicEmployee(employee) });
      return;
    }

    if (request.method === "POST" && request.url === "/api/employees/import") {
      const user = requireUser(request, response);
      if (!user) return;
      if (!canManageEmployees(user.role)) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      const body = await readJsonBody<{ rows?: string }>(request);
      const result = parseEmployeeImportRows(body.rows ?? "");
      if (result.errors.length) {
        sendJson(response, 400, result);
        return;
      }

      users.push(...result.users);
      result.users.forEach((employee) => setUserPassword(employee.email, "password"));
      addAudit(user.id, "employee.imported", "employees");
      sendJson(response, 201, { users: result.users.map(publicEmployee), errors: [] });
      return;
    }

    if (request.method === "GET" && request.url?.startsWith("/api/employees/export")) {
      const user = requireUser(request, response);
      if (!user) return;
      if (!canViewEmployees(user.role)) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      const url = new URL(request.url, `http://${request.headers.host}`);
      const format = url.searchParams.get("format") ?? "excel";
      if (format !== "excel" && format !== "pdf") {
        sendJson(response, 400, { error: "Unsupported export format" });
        return;
      }
      const rows = toEmployeeExportRows(getRoleScopedEmployees(users, user));
      const body = format === "pdf" ? buildSimplePdf("Employee Management", rows) : buildExcelWorkbook("Employee Management", rows);
      response.writeHead(200, {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="employees.${format === "excel" ? "xls" : "pdf"}"`
      });
      response.end(body);
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


    if (request.method === "GET" && request.url === "/api/settings") {
      const user = requireUser(request, response);
      if (!user) return;

      sendJson(response, 200, { settings: systemSettings });
      return;
    }

    if (request.method === "PUT" && request.url === "/api/settings") {
      const user = requireUser(request, response);
      if (!user) return;

      const body = await readJsonBody<Partial<SystemSettings>>(request);
      const validationError = validateSystemSettings(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const disallowedGroups = getChangedSettingGroups(systemSettings, body).filter((group) => !canEditSettingGroup(user.role, group));
      if (disallowedGroups.length > 0) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      updateSystemSettings(body);
      addAudit(user.id, "settings.updated", disallowedGroups.length ? disallowedGroups.join(",") : "settings");
      sendJson(response, 200, { settings: systemSettings });
      return;
    }

    if (request.method === "GET" && request.url === "/api/payroll/periods") {
      const user = requireUser(request, response);
      if (!user) return;
      if (!canViewPayroll(user.role)) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      ensureDefaultPayrollPeriod();
      sendJson(response, 200, { periods: payrollPeriods.map((period) => scopePayrollPeriod(period, user)) });
      return;
    }

    if (request.method === "POST" && request.url === "/api/payroll/periods") {
      const user = requireUser(request, response);
      if (!user) return;
      if (user.role !== "Payroll" && user.role !== "Admin") {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      const body = await readJsonBody<{ name?: string; startDate?: string; endDate?: string }>(request);
      const validationError = validatePayrollPeriodBody(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const period: PayrollPeriod = {
        id: `payroll-${Date.now()}`,
        name: body.name?.trim() || `Payroll ${body.startDate} - ${body.endDate}`,
        startDate: body.startDate ?? "",
        endDate: body.endDate ?? "",
        status: "Draft",
        createdBy: user.id,
        createdAt: new Date().toISOString(),
        warnings: [],
        rows: [],
        versions: []
      };
      refreshPayrollPeriod(period, user.id, "created");
      payrollPeriods.unshift(period);
      addAudit(user.id, "payroll.period.created", period.id);
      sendJson(response, 201, { period: scopePayrollPeriod(period, user) });
      return;
    }

    if (request.url?.match(/^\/api\/payroll\/periods\/[^/]+\/(recalculate|confirm|lock|unlock)$/) && request.method === "POST") {
      const user = requireUser(request, response);
      if (!user) return;

      const [, , , , periodId, action] = request.url.split("/");
      const period = payrollPeriods.find((item) => item.id === periodId);
      if (!period) {
        sendJson(response, 404, { error: "Payroll period not found" });
        return;
      }

      if (action === "recalculate") {
        if (user.role !== "Payroll" && user.role !== "HR" && user.role !== "Admin") {
          sendJson(response, 403, { error: "Forbidden" });
          return;
        }
        if (period.status === "Locked") {
          sendJson(response, 409, { error: "Payroll period is locked" });
          return;
        }
        refreshPayrollPeriod(period, user.id, "recalculated");
        addAudit(user.id, "payroll.period.recalculated", period.id);
        sendJson(response, 200, { period: scopePayrollPeriod(period, user) });
        return;
      }

      if (action === "confirm") {
        if (user.role !== "HR" && user.role !== "Admin" && user.role !== "Payroll") {
          sendJson(response, 403, { error: "Forbidden" });
          return;
        }
        if (period.status === "Locked") {
          sendJson(response, 409, { error: "Payroll period is locked" });
          return;
        }
        refreshPayrollPeriod(period, user.id, "confirmed");
        period.status = "Confirmed";
        period.confirmedBy = user.id;
        period.confirmedAt = new Date().toISOString();
        addAudit(user.id, "payroll.period.confirmed", period.id);
        sendJson(response, 200, { period: scopePayrollPeriod(period, user) });
        return;
      }

      if (action === "lock") {
        if (user.role !== "Payroll" && user.role !== "Admin") {
          sendJson(response, 403, { error: "Forbidden" });
          return;
        }
        refreshPayrollPeriod(period, user.id, "pre-lock check");
        if (systemSettings.payrollExport.lockRequiresResolvedLogs && period.warnings.length > 0) {
          sendJson(response, 409, { error: "Payroll period has unresolved warnings", warnings: period.warnings });
          return;
        }
        period.status = "Locked";
        period.lockedBy = user.id;
        period.lockedAt = new Date().toISOString();
        lockAttendanceLogsForPeriod(period);
        addPayrollVersion(period, user.id, "locked");
        addAudit(user.id, "payroll.period.locked", period.id);
        sendJson(response, 200, { period: scopePayrollPeriod(period, user) });
        return;
      }

      if (action === "unlock") {
        if (user.role !== "Admin") {
          sendJson(response, 403, { error: "Forbidden" });
          return;
        }
        period.status = "Draft";
        period.unlockedBy = user.id;
        period.unlockedAt = new Date().toISOString();
        unlockAttendanceLogsForPeriod(period);
        addPayrollVersion(period, user.id, "unlocked");
        addAudit(user.id, "payroll.period.unlocked", period.id);
        sendJson(response, 200, { period: scopePayrollPeriod(period, user) });
        return;
      }
    }

    if (request.method === "GET" && request.url?.match(/^\/api\/payroll\/periods\/[^/]+\/export/)) {
      const user = requireUser(request, response);
      if (!user) return;
      if (!canViewPayroll(user.role)) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      const url = new URL(request.url, `http://${request.headers.host}`);
      const periodId = request.url.split("/")[4];
      const period = payrollPeriods.find((item) => item.id === periodId);
      if (!period) {
        sendJson(response, 404, { error: "Payroll period not found" });
        return;
      }
      const format = url.searchParams.get("format") ?? "excel";
      if (format !== "excel" && format !== "pdf") {
        sendJson(response, 400, { error: "Unsupported export format" });
        return;
      }
      const scopedPeriod = scopePayrollPeriod(period, user);
      const rows = toPayrollExportRows(scopedPeriod);
      const body = format === "pdf" ? buildSimplePdf(scopedPeriod.name, rows) : buildExcelWorkbook(scopedPeriod.name, rows);
      response.writeHead(200, {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="payroll-summary.${format === "excel" ? "xls" : "pdf"}"`
      });
      response.end(body);
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

function canViewPayroll(role: string) {
  return role === "Manager" || role === "HR" || role === "Payroll" || role === "Admin";
}

function ensureDefaultPayrollPeriod() {
  if (payrollPeriods.length > 0) return;
  const start = new Date();
  start.setDate(1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  const period: PayrollPeriod = {
    id: "payroll-current-demo",
    name: "Current payroll period",
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    status: "Draft",
    createdBy: "system",
    createdAt: new Date().toISOString(),
    warnings: [],
    rows: [],
    versions: []
  };
  refreshPayrollPeriod(period, "system", "seeded");
  payrollPeriods.push(period);
}

function validatePayrollPeriodBody(body: { name?: string; startDate?: string; endDate?: string }) {
  if (!body.startDate || !body.endDate) return "Payroll period dates are required";
  if (new Date(`${body.endDate}T00:00:00`) < new Date(`${body.startDate}T00:00:00`)) return "Invalid payroll date range";
  return "";
}

function refreshPayrollPeriod(period: PayrollPeriod, actorId: string, action: string) {
  period.rows = calculatePayrollRows(period.startDate, period.endDate);
  period.warnings = calculatePayrollWarnings(period);
  addPayrollVersion(period, actorId, action);
}

function calculatePayrollRows(startDate: string, endDate: string): PayrollSummaryRow[] {
  const businessDays = countBusinessDays(startDate, endDate);
  const periodLogs = attendanceLogs.filter((log) => isDateInRange(log.workDate, startDate, endDate));
  const payrollUsers = users.filter((item) => item.role !== "Admin");

  return payrollUsers.map((employee) => {
    const employeeLogs = periodLogs.filter((log) => log.employeeId === employee.id);
    const row: PayrollSummaryRow = {
      employeeId: employee.id,
      employeeName: employee.name,
      department: roleDepartment(employee.role),
      standardHours: businessDays * 8,
      workedHours: 0,
      overtimeHours: 0,
      paidLeaveHours: 0,
      unpaidLeaveHours: 0,
      missingHours: 0,
      lateCount: 0,
      earlyLeaveCount: 0,
      missingLogCount: 0,
      totalPayableHours: 0
    };

    for (const log of employeeLogs) {
      if (log.status === "On Leave") {
        if (isUnpaidLeave(employee.id, log.workDate)) row.unpaidLeaveHours += 8;
        else row.paidLeaveHours += 8;
      } else {
        row.workedHours += parseHourText(log.totalHours);
      }
      row.overtimeHours += parseHourText(log.overtime);
      if (log.status === "Late") row.lateCount += 1;
      if (log.status === "Early Leave") row.earlyLeaveCount += 1;
      if (log.status === "Missing Check-out") row.missingLogCount += 1;
      if (log.adjustmentStatus === "Pending") row.missingLogCount += 1;
    }

    row.totalPayableHours = roundHours(row.workedHours + row.overtimeHours + row.paidLeaveHours);
    row.missingHours = Math.max(0, roundHours(row.standardHours - row.workedHours - row.paidLeaveHours - row.unpaidLeaveHours));
    row.workedHours = roundHours(row.workedHours);
    row.overtimeHours = roundHours(row.overtimeHours);
    return row;
  });
}

function calculatePayrollWarnings(period: PayrollPeriod) {
  const warnings = period.rows
    .filter((row) => row.missingLogCount > 0)
    .map((row) => `${row.employeeName} has ${row.missingLogCount} unresolved attendance item(s)`);
  const pendingAdjustments = attendanceLogs.filter((log) => isDateInRange(log.workDate, period.startDate, period.endDate) && log.adjustmentStatus === "Pending").length;
  if (pendingAdjustments > 0) warnings.unshift(`${pendingAdjustments} pending attendance adjustment(s) must be resolved before locking`);
  return [...new Set(warnings)];
}

function scopePayrollPeriod(period: PayrollPeriod, user: { id: string; role: string }) {
  if (user.role !== "Manager") return period;
  const teamEmployeeIds = new Set(attendanceLogs.filter((log) => log.managerId === user.id || log.employeeId === user.id).map((log) => log.employeeId));
  return { ...period, rows: period.rows.filter((row) => teamEmployeeIds.has(row.employeeId)) };
}

function lockAttendanceLogsForPeriod(period: PayrollPeriod) {
  attendanceLogs.forEach((log) => {
    if (isDateInRange(log.workDate, period.startDate, period.endDate)) log.payrollLocked = true;
  });
}

function unlockAttendanceLogsForPeriod(period: PayrollPeriod) {
  attendanceLogs.forEach((log) => {
    if (isDateInRange(log.workDate, period.startDate, period.endDate)) log.payrollLocked = false;
  });
}

function addPayrollVersion(period: PayrollPeriod, actorId: string, action: string) {
  period.versions.unshift({
    version: period.versions.length + 1,
    action,
    actorId,
    createdAt: new Date().toISOString(),
    notes: `${action} with ${period.rows.length} employee row(s) and ${period.warnings.length} warning(s)`
  });
}

function toPayrollExportRows(period: PayrollPeriod) {
  return [
    ["Employee", "Department", "Standard", "Worked", "Overtime", "Paid leave", "Unpaid leave", "Missing", "Status"],
    ...period.rows.map((row) => [
      row.employeeName,
      row.department,
      String(row.standardHours),
      String(row.workedHours),
      String(row.overtimeHours),
      String(row.paidLeaveHours),
      String(row.unpaidLeaveHours),
      String(row.missingLogCount),
      period.status
    ])
  ];
}

function isUnpaidLeave(employeeId: string, workDate: string) {
  return leaveRequests.some((request) => request.employeeId === employeeId && request.type === "Unpaid Leave" && request.status === "Approved" && isDateInRange(workDate, request.startDate, request.endDate));
}

function countBusinessDays(startDate: string, endDate: string) {
  let count = 0;
  const cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  while (cursor <= end) {
    const day = cursor.getDay();
    const isoDate = cursor.toISOString().slice(0, 10);
    const isHoliday = systemSettings.holidays.some((holiday) => isoDate >= holiday.startDate && isoDate <= holiday.endDate);
    if (day !== 0 && day !== 6 && !isHoliday) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function isDateInRange(workDate: string, startDate: string, endDate: string) {
  return workDate >= startDate && workDate <= endDate;
}

function parseHourText(value: string) {
  const match = value.match(/(\d+)h\s*(\d+)m/);
  if (!match) return 0;
  return Number(match[1]) + Number(match[2]) / 60;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}


function canViewEmployees(role: string) {
  return role === "Manager" || role === "HR" || role === "Payroll" || role === "Admin";
}

function canManageEmployees(role: string) {
  return role === "HR" || role === "Admin";
}

function getRoleScopedEmployees(sourceUsers: User[], user: { id: string; role: string }) {
  if (user.role === "Manager") return sourceUsers.filter((item) => item.id === user.id || item.managerId === user.id);
  if (user.role === "Payroll") return sourceUsers.filter((item) => item.role !== "Admin");
  if (user.role === "Employee") return [];
  return sourceUsers;
}

function publicEmployee(user: User) {
  return { ...publicUser(user), locked: user.locked, employmentStatus: user.employmentStatus ?? (user.locked ? "Locked" : "Active") };
}

function validateEmployeeBody(body: Partial<User>) {
  const allowedRoles: UserRole[] = ["Employee", "Manager", "HR", "Payroll", "Admin"];
  if (!body.name?.trim() || !body.email?.trim() || !body.subtitle?.trim()) return "Required employee fields are missing";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return "Invalid email";
  if (body.role && !allowedRoles.includes(body.role)) return "Invalid role";
  return "";
}

function buildEmployee(body: Partial<User>): User {
  const now = Date.now();
  const role = body.role ?? "Employee";
  const locked = Boolean(body.locked) || body.employmentStatus === "Locked";
  return {
    id: body.id || `u-employee-${now}`,
    name: body.name?.trim() ?? "",
    email: body.email?.trim().toLowerCase() ?? "",
    role,
    subtitle: body.subtitle?.trim() || roleDepartment(role),
    employeeCode: body.employeeCode?.trim() || `EMP-${String(now).slice(-5)}`,
    phone: body.phone?.trim() || "",
    position: body.position?.trim() || role,
    managerId: body.managerId || (role === "Manager" || role === "Admin" ? "u-admin" : "u-manager"),
    hireDate: body.hireDate || new Date().toISOString().slice(0, 10),
    employmentStatus: locked ? "Locked" : (body.employmentStatus ?? "Active"),
    schedulePolicy: body.schedulePolicy?.trim() || "Standard 8h",
    attendancePolicy: body.attendancePolicy?.trim() || "Office check-in",
    leavePolicy: body.leavePolicy?.trim() || "Annual 12 days",
    remainingLeaveDays: Number.isFinite(body.remainingLeaveDays) ? Number(body.remainingLeaveDays) : 12,
    locked
  };
}

function updateEmployee(employee: User, body: Partial<User>) {
  if (typeof body.name === "string") employee.name = body.name.trim();
  if (typeof body.email === "string") employee.email = body.email.trim().toLowerCase();
  if (body.role) employee.role = body.role;
  if (typeof body.subtitle === "string") employee.subtitle = body.subtitle.trim();
  if (typeof body.employeeCode === "string") employee.employeeCode = body.employeeCode.trim();
  if (typeof body.phone === "string") employee.phone = body.phone.trim();
  if (typeof body.position === "string") employee.position = body.position.trim();
  if (typeof body.managerId === "string") employee.managerId = body.managerId;
  if (typeof body.hireDate === "string") employee.hireDate = body.hireDate;
  if (body.employmentStatus) employee.employmentStatus = body.employmentStatus;
  if (typeof body.schedulePolicy === "string") employee.schedulePolicy = body.schedulePolicy.trim();
  if (typeof body.attendancePolicy === "string") employee.attendancePolicy = body.attendancePolicy.trim();
  if (typeof body.leavePolicy === "string") employee.leavePolicy = body.leavePolicy.trim();
  if (typeof body.remainingLeaveDays === "number" && Number.isFinite(body.remainingLeaveDays)) employee.remainingLeaveDays = Math.max(0, Math.floor(body.remainingLeaveDays));
  employee.locked = Boolean(body.locked) || employee.employmentStatus === "Locked";
}

function parseEmployeeImportRows(rows: string) {
  const errors: string[] = [];
  const parsedUsers: User[] = [];
  const allowedRoles: UserRole[] = ["Employee", "Manager", "HR", "Payroll", "Admin"];
  rows.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const [name = "", email = "", role = "Employee", department = "", position = ""] = line.split(",").map((item) => item.trim());
    const normalizedEmail = email.toLowerCase();
    if (!name || !normalizedEmail || !department || !allowedRoles.includes(role as UserRole) || users.some((item) => item.email.toLowerCase() === normalizedEmail) || parsedUsers.some((item) => item.email === normalizedEmail)) {
      errors.push(`Row ${index + 1}: name, email, role and department are required and email must be unique`);
      return;
    }
    parsedUsers.push(buildEmployee({ name, email: normalizedEmail, role: role as UserRole, subtitle: department, position, employeeCode: `IMP-${String(index + 1).padStart(3, "0")}` }));
  });
  return { users: parsedUsers, errors };
}

function toEmployeeExportRows(sourceUsers: User[]) {
  return [
    ["Employee code", "Name", "Email", "Role", "Department", "Position", "Manager", "Hire date", "Status"],
    ...sourceUsers.map((employee) => [
      employee.employeeCode ?? "",
      employee.name,
      employee.email,
      employee.role,
      employee.subtitle,
      employee.position ?? "",
      users.find((manager) => manager.id === employee.managerId)?.name ?? "",
      employee.hireDate ?? "",
      employee.locked || employee.employmentStatus === "Locked" ? "Locked" : employee.employmentStatus ?? "Active"
    ])
  ];
}

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
  if (body.password.length < systemSettings.security.minPasswordLength) return `Password must be at least ${systemSettings.security.minPasswordLength} characters`;
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

function validateSystemSettings(body: Partial<SystemSettings>) {
  if (body.attendancePolicy) {
    if (!isTimeValue(body.attendancePolicy.standardStartTime) || !isTimeValue(body.attendancePolicy.standardEndTime)) return "Invalid attendance policy time";
    if ((body.attendancePolicy.standardEndTime ?? "") <= (body.attendancePolicy.standardStartTime ?? "")) return "Standard end time must be after start time";
    if (!isNonNegativeNumber(body.attendancePolicy.lateGraceMinutes) || !isNonNegativeNumber(body.attendancePolicy.earlyLeaveGraceMinutes)) return "Invalid grace minutes";
    if (!isPositiveNumber(body.attendancePolicy.overtimeAfterHours)) return "Invalid overtime threshold";
  }
  if (body.leavePolicy && !isNonNegativeNumber(body.leavePolicy.defaultAnnualLeaveDays)) return "Invalid annual leave days";
  if (body.workSchedules?.some((schedule) => !schedule.name?.trim() || !isTimeValue(schedule.startTime) || !isTimeValue(schedule.endTime) || schedule.endTime <= schedule.startTime || !isNonNegativeNumber(schedule.breakMinutes) || !Array.isArray(schedule.workDays))) return "Invalid work schedule";
  if (body.holidays?.some((holiday) => !holiday.name?.trim() || !holiday.startDate || !holiday.endDate || holiday.endDate < holiday.startDate)) return "Invalid holiday";
  if (body.payrollExport && body.payrollExport.defaultFormat !== "excel" && body.payrollExport.defaultFormat !== "pdf") return "Invalid payroll export format";
  if (body.security && (!isPositiveNumber(body.security.minPasswordLength) || body.security.minPasswordLength < 6 || !isPositiveNumber(body.security.sessionTimeoutMinutes) || body.security.sessionTimeoutMinutes < 15)) return "Invalid security settings";
  if (body.audit && (!isPositiveNumber(body.audit.retentionDays) || body.audit.retentionDays < 30)) return "Invalid audit retention";
  return "";
}

function updateSystemSettings(body: Partial<SystemSettings>) {
  if (body.attendancePolicy) systemSettings.attendancePolicy = { ...systemSettings.attendancePolicy, ...body.attendancePolicy };
  if (body.leavePolicy) {
    systemSettings.leavePolicy = { ...systemSettings.leavePolicy, ...body.leavePolicy };
    leaveWorkflowConfig.defaultAnnualLeaveDays = Math.max(0, Math.floor(systemSettings.leavePolicy.defaultAnnualLeaveDays));
    leaveWorkflowConfig.attachmentRequiredForSickLeave = systemSettings.leavePolicy.attachmentRequiredForSickLeave;
    leaveWorkflowConfig.requireHrApproval = systemSettings.leavePolicy.requireHrApproval;
    leaveWorkflowConfig.annualLeaveRequiresBalance = systemSettings.leavePolicy.blockAnnualLeaveOverBalance;
  }
  if (body.workSchedules) systemSettings.workSchedules = body.workSchedules.map((schedule) => ({ ...schedule, breakMinutes: Math.max(0, Math.floor(schedule.breakMinutes)), workDays: schedule.workDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) }));
  if (body.holidays) systemSettings.holidays = body.holidays;
  if (body.roles) systemSettings.roles = { ...systemSettings.roles, ...body.roles };
  if (body.notifications) systemSettings.notifications = { ...systemSettings.notifications, ...body.notifications };
  if (body.payrollExport) systemSettings.payrollExport = { ...systemSettings.payrollExport, ...body.payrollExport };
  if (body.security) systemSettings.security = { ...systemSettings.security, ...body.security, minPasswordLength: Math.max(6, Math.floor(body.security.minPasswordLength)), sessionTimeoutMinutes: Math.max(15, Math.floor(body.security.sessionTimeoutMinutes)) };
  if (body.integrations) systemSettings.integrations = { ...systemSettings.integrations, ...body.integrations };
  if (body.audit) systemSettings.audit = { ...systemSettings.audit, ...body.audit, retentionDays: Math.max(30, Math.floor(body.audit.retentionDays)) };
}

function getChangedSettingGroups(current: SystemSettings, next: Partial<SystemSettings>) {
  return (Object.keys(next) as Array<keyof SystemSettings>).filter((group) => JSON.stringify(current[group]) !== JSON.stringify(next[group]));
}

function canEditSettingGroup(role: string, group: keyof SystemSettings) {
  if (role === "Admin") return true;
  if (role === "HR") return ["attendancePolicy", "leavePolicy", "workSchedules", "holidays", "notifications"].includes(group);
  if (role === "Payroll") return group === "payrollExport" || group === "notifications";
  if (role === "Manager" || role === "Employee") return group === "notifications";
  return false;
}

function isTimeValue(value: unknown) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

function isNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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

