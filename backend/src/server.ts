import { randomUUID } from "node:crypto";
import type { AttendanceLog as PrismaAttendanceLog, HelpArticle as PrismaHelpArticle, LeaveAttachment as PrismaLeaveAttachment, LeaveRequest as PrismaLeaveRequest, Notification as PrismaNotification, PayrollPeriod as PrismaPayrollPeriod, PayrollSummaryRow as PrismaPayrollSummaryRow, PayrollVersion as PrismaPayrollVersion, SupportTicket as PrismaSupportTicket, User as PrismaUser } from "@prisma/client";
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { leaveWorkflowConfig, systemSettings } from "./data.js";
import type { AttendanceLog, AppNotification, HelpArticle, LeaveAttachment, LeaveRequest, LeaveType, LeaveWorkflowConfig, PayrollPeriod, PayrollSummaryRow, SystemSettings, User } from "./types.js";
import { databaseUserToApi, getUserByToken, login, logout, publicUser, registerAccount, requestPasswordReset, resetPasswordWithToken } from "./auth.js";
import type { UserRole } from "./types.js";
import { openApiSpec, renderApiDocs } from "./apiDocs.js";
import { hashPassword, verifyPassword, verifyPin } from "./security.js";
import { prisma } from "./db.js";
import { isEmailConfigured } from "./email.js";
import { calculateAttendance, getLocalDateContext } from "./attendance.js";
import { getManagerAssignmentError, isActiveManager, normalizeManagerId } from "./managerAssignment.js";

const port = Number(process.env.PORT ?? 4000);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? process.env.FRONTEND_URL ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const uploadRoot = resolve(process.cwd(), "uploads", "leave-attachments");
const maxAttachmentBytes = 10 * 1024 * 1024;
const quickAttendanceAttempts = new Map<string, { failures: number; windowStartedAt: number; blockedUntil: number }>();
const passwordResetAttempts = new Map<string, { count: number; windowStartedAt: number }>();
const quickAttendanceWindowMs = 10 * 60 * 1000;
const quickAttendanceMaxFailures = 5;

const server = createServer(async (request, response) => {
  setCorsHeaders(response, request);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    if (request.method === "GET" && request.url === "/api/docs") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(renderApiDocs());
      return;
    }

    if (request.method === "GET" && request.url === "/api/openapi.json") {
      sendJson(response, 200, openApiSpec);
      return;
    }

    if (request.method === "GET" && request.url === "/api/health") {
      sendJson(response, 200, { ok: true, service: "workforce-pro-api" });
      return;
    }

    if (request.method === "GET" && request.url === "/api/attendance/quick-users") {
      const quickUsers = await prisma.user.findMany({
        where: { locked: false, employmentStatus: "ACTIVE", phone: { not: null }, pinHash: { not: null } },
        select: { id: true, name: true, employeeCode: true, role: true }
      });
      const activeSessions = await prisma.attendanceSession.findMany({ select: { employeeId: true } });
      const activeEmployeeIds = new Set(activeSessions.map((session) => session.employeeId));
      sendJson(response, 200, { users: quickUsers.map((user) => ({ id: user.id, name: user.name, employeeCode: user.employeeCode ?? "", role: databaseRoleToApiRole(user.role), attendanceStatus: activeEmployeeIds.has(user.id) ? "working" : "not-started" })) });
      return;
    }
    if (request.method === "POST" && (request.url === "/api/attendance/quick-check-in" || request.url === "/api/attendance/quick-check-out")) {
      await handleQuickAttendance(request, response, request.url.endsWith("check-in") ? "check-in" : "check-out");
      return;
    }
    if (request.method === "POST" && request.url === "/api/auth/login") {
      const body = await readJsonBody<{ email?: string; password?: string }>(request);
      const result = await login(body.email ?? "", body.password ?? "");

      if ("error" in result) {
        sendJson(response, result.status ?? 401, { error: result.error });
        return;
      }

      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && request.url === "/api/auth/logout") {
      const token = getBearerToken(request);
      if (token) await logout(token);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && request.url === "/api/auth/register") {
      const body = await readJsonBody<{ name?: string; email?: string; role?: UserRole; department?: string; password?: string; confirmPassword?: string }>(request);
      if (!systemSettings.security.allowSelfRegistration) { sendJson(response, 403, { error: "Self-registration is disabled" }); return; }
      if (body.role && body.role !== "Employee") { sendJson(response, 403, { error: "Elevated roles must be assigned by HR or Admin" }); return; }
      const validationError = validateRegisterBody(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const result = await registerAccount({
        name: body.name ?? "",
        email: body.email ?? "",
        role: "Employee",
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
      const body = await readJsonBody<{ email?: string }>(request);
      const email = body.email?.trim().toLowerCase() ?? "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { sendJson(response, 400, { error: "Enter a valid email address" }); return; }
      if (!isEmailConfigured()) { sendJson(response, 503, { error: "Password reset email is not configured" }); return; }
      const attemptKey = `${getRequestIp(request)}:${email}`;
      const now = Date.now();
      const current = passwordResetAttempts.get(attemptKey);
      if (current && now - current.windowStartedAt < 15 * 60_000 && current.count >= 3) { sendJson(response, 429, { error: "Too many reset requests. Try again later." }); return; }
      passwordResetAttempts.set(attemptKey, !current || now - current.windowStartedAt >= 15 * 60_000 ? { count: 1, windowStartedAt: now } : { ...current, count: current.count + 1 });
      await requestPasswordReset(email);
      sendJson(response, 200, { ok: true, message: "If an account uses that email, a reset link has been sent." });
      return;
    }

    if (request.method === "POST" && request.url === "/api/auth/reset-password") {
      const body = await readJsonBody<{ token?: string; password?: string; confirmPassword?: string }>(request);
      const token = body.token?.trim() ?? "";
      const password = body.password ?? "";
      if (!token || token.length < 32) { sendJson(response, 400, { error: "Invalid or expired reset link" }); return; }
      if (password.length < systemSettings.security.minPasswordLength) { sendJson(response, 400, { error: `Password must be at least ${systemSettings.security.minPasswordLength} characters` }); return; }
      if (password !== body.confirmPassword) { sendJson(response, 400, { error: "Passwords do not match" }); return; }
      const reset = await resetPasswordWithToken(token, password);
      if (!reset) { sendJson(response, 400, { error: "Invalid or expired reset link" }); return; }
      sendJson(response, 200, { ok: true, message: "Password updated. You can now sign in." });
      return;
    }
    if (request.method === "POST" && request.url === "/api/auth/change-password") {
      const user = await requireUser(request, response);
      if (!user) return;
      const body = await readJsonBody<{ currentPassword?: string; newPassword?: string; confirmPassword?: string }>(request);
      const currentPassword = body.currentPassword ?? "";
      const newPassword = body.newPassword ?? "";
      if (newPassword.length < systemSettings.security.minPasswordLength) { sendJson(response, 400, { error: `Password must be at least ${systemSettings.security.minPasswordLength} characters` }); return; }
      if (newPassword !== body.confirmPassword) { sendJson(response, 400, { error: "Passwords do not match" }); return; }
      const record = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
      if (!record?.passwordHash || !verifyPassword(currentPassword, record.passwordHash)) { sendJson(response, 401, { error: "Current password is incorrect" }); return; }
      const currentToken = getBearerToken(request);
      await prisma.$transaction(async (transaction) => {
        await transaction.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(newPassword) } });
        await transaction.authSession.deleteMany({ where: { userId: user.id, ...(currentToken ? { token: { not: currentToken } } : {}) } });
        await transaction.auditLog.create({ data: { id: randomUUID(), actorId: user.id, action: "auth.password_changed", targetId: user.id, success: true } });
      });
      sendJson(response, 200, { ok: true, message: "Password changed successfully" });
      return;
    }
    if (request.method === "GET" && request.url === "/api/me") {
      const user = await requireUser(request, response);
      if (!user) return;
      sendJson(response, 200, { user });
      return;
    }

    if (request.method === "GET" && request.url === "/api/dashboard") {
      const user = await requireUser(request, response);
      if (!user) return;
      const now = new Date();
      const weekStart = new Date(now);
      const day = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1));
      weekStart.setHours(0, 0, 0, 0);
      const [records, activeSession, weeklyLogs, nextHoliday, unresolvedCount, latestPayroll] = await Promise.all([
        prisma.attendanceLog.findMany({ where: user.role === "Employee" ? { employeeId: user.id } : {}, include: { employee: true }, orderBy: { workDate: "desc" }, take: 50 }),
        prisma.attendanceSession.findUnique({ where: { employeeId: user.id } }),
        prisma.attendanceLog.findMany({ where: { employeeId: user.id, workDate: { gte: weekStart, lte: now } }, select: { totalMinutes: true } }),
        prisma.holiday.findFirst({ where: { endDate: { gte: now } }, orderBy: { startDate: "asc" } }),
        prisma.attendanceLog.count({ where: { OR: [{ status: "MISSING_CHECK_OUT" }, { adjustmentStatus: "PENDING" }] } }),
        prisma.payrollPeriod.findFirst({ orderBy: { startDate: "desc" }, select: { warnings: true, rows: { select: { id: true } } } })
      ]);
      const weeklyMinutes = weeklyLogs.reduce((sum, log) => sum + log.totalMinutes, 0);
      const payrollReadiness = latestPayroll ? `${Math.max(0, Math.round((1 - latestPayroll.warnings.length / Math.max(1, latestPayroll.rows.length)) * 100))}% ready` : "Not calculated";
      sendJson(response, 200, {
        greeting: "Good morning",
        summaryDate: formatSummaryDate(now),
        session: activeSession ? databaseAttendanceSessionToApi(activeSession) : null,
        sessionSeconds: activeSession ? Math.max(0, Math.floor((now.getTime() - activeSession.checkInAt.getTime()) / 1000)) : 0,
        weeklyHours: Math.round((weeklyMinutes / 60) * 100) / 100,
        weeklyTarget: 40,
        remainingLeaveDays: user.remainingLeaveDays,
        nextHoliday: nextHoliday ? { name: nextHoliday.name, dateRange: `${nextHoliday.startDate.toISOString().slice(0, 10)} - ${nextHoliday.endDate.toISOString().slice(0, 10)}` } : null,
        logs: records.map(databaseAttendanceLogToApi),
        managerAlerts: canViewTeamDashboard(user.role) && unresolvedCount > 0 ? [`${unresolvedCount} unresolved attendance item(s)`] : [],
        payrollReadiness: user.role === "Payroll" || user.role === "Admin" ? payrollReadiness : null
      });
      return;
    }
    if (request.method === "POST" && request.url === "/api/attendance/check-in") {
      const user = await requireUser(request, response);
      if (!user) return;
      const scheduleError = getCheckInRestriction(new Date(), user);
      if (scheduleError) { sendJson(response, 409, { error: scheduleError }); return; }
      const currentSession = await prisma.attendanceSession.findUnique({ where: { employeeId: user.id } });
      if (currentSession) { sendJson(response, 409, { error: "Active attendance session already exists", session: databaseAttendanceSessionToApi(currentSession) }); return; }
      const created = await prisma.attendanceSession.create({ data: { id: randomUUID(), employeeId: user.id, checkInAt: new Date(), device: request.headers["user-agent"] ?? "Browser device", ipAddress: getRequestIp(request), location: "Headquarters" } });
      await addDatabaseAudit(user.id, "attendance.checked-in", created.id);
      sendJson(response, 201, { session: databaseAttendanceSessionToApi(created) });
      return;
    }

    if (request.method === "POST" && request.url === "/api/attendance/check-out") {
      const user = await requireUser(request, response);
      if (!user) return;
      const session = await prisma.attendanceSession.findUnique({ where: { employeeId: user.id } });
      if (!session) { sendJson(response, 400, { error: "Check-in is required before check-out" }); return; }
      const checkOutAt = new Date();
      const attendance = calculateAttendance(session.checkInAt, checkOutAt, systemSettings);
      const [record] = await prisma.$transaction([
        prisma.attendanceLog.create({ data: { id: randomUUID(), employeeId: user.id, managerId: user.managerId || null, workDate: dateOnlyValue(attendance.workDate), checkInAt: session.checkInAt, checkOutAt, totalMinutes: attendance.totalMinutes, overtimeMinutes: attendance.overtimeMinutes, status: attendance.status, adjustmentStatus: "NONE", payrollLocked: false }, include: { employee: true } }),
        prisma.attendanceSession.delete({ where: { employeeId: user.id } })
      ]);
      await addDatabaseAudit(user.id, "attendance.checked-out", record.id);
      sendJson(response, 200, { log: databaseAttendanceLogToApi(record) });
      return;
    }
    if (request.method === "GET" && request.url === "/api/employees") {
      const user = await requireUser(request, response);
      if (!user) return;
      if (!canViewEmployees(user.role)) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      const databaseUsers = (await prisma.user.findMany()).map(databaseUserToApi);
      sendJson(response, 200, { users: getRoleScopedEmployees(databaseUsers, user).map(publicEmployee) });
      return;
    }

    if (request.method === "POST" && request.url === "/api/employees") {
      const user = await requireUser(request, response);
      if (!user) return;
      if (!canManageEmployees(user.role)) { sendJson(response, 403, { error: "Forbidden" }); return; }

      const body = await readJsonBody<Partial<User> & { password?: string }>(request);
      const validationError = validateEmployeeBody(body);
      if (validationError) { sendJson(response, 400, { error: validationError }); return; }
      const normalizedEmail = body.email?.trim().toLowerCase() ?? "";
      const existing = await prisma.user.findFirst({ where: { OR: [{ email: normalizedEmail }, ...(body.employeeCode?.trim() ? [{ employeeCode: body.employeeCode.trim() }] : [])] }, select: { email: true, employeeCode: true } });
      if (existing?.email === normalizedEmail) { sendJson(response, 409, { error: "Email already exists" }); return; }
      if (existing?.employeeCode && existing.employeeCode === body.employeeCode?.trim()) { sendJson(response, 409, { error: "Employee code already exists" }); return; }

      const employee = buildEmployee(body);
      const managerError = await validateManagerAssignment(employee.managerId, employee.id);
      if (managerError) { sendJson(response, 400, { error: managerError }); return; }
      const record = await prisma.user.create({ data: { id: employee.id, ...employeeDatabaseData(employee), passwordHash: hashPassword(body.password || "password") } });
      await addDatabaseAudit(user.id, "employee.created", record.id);
      sendJson(response, 201, { user: publicEmployee(databaseUserToApi(record)) });
      return;
    }

    if (request.method === "PUT" && request.url?.match(/^\/api\/employees\/[^/]+$/)) {
      const user = await requireUser(request, response);
      if (!user) return;
      if (!canManageEmployees(user.role)) { sendJson(response, 403, { error: "Forbidden" }); return; }

      const employeeId = request.url.split("/")[3];
      const record = await prisma.user.findUnique({ where: { id: employeeId } });
      if (!record) { sendJson(response, 404, { error: "Employee not found" }); return; }
      const employee = databaseUserToApi(record);
      const body = await readJsonBody<Partial<User>>(request);
      const validationError = validateEmployeeBody({ ...employee, ...body });
      if (validationError) { sendJson(response, 400, { error: validationError }); return; }
      const nextEmail = body.email?.trim().toLowerCase();
      if (nextEmail) {
        const duplicate = await prisma.user.findFirst({ where: { email: nextEmail, id: { not: employeeId } }, select: { id: true } });
        if (duplicate) { sendJson(response, 409, { error: "Email already exists" }); return; }
      }
      if (body.employeeCode?.trim()) {
        const duplicate = await prisma.user.findFirst({ where: { employeeCode: body.employeeCode.trim(), id: { not: employeeId } }, select: { id: true } });
        if (duplicate) { sendJson(response, 409, { error: "Employee code already exists" }); return; }
      }

      updateEmployee(employee, body);
      const managerError = await validateManagerAssignment(employee.managerId, employee.id);
      if (managerError) { sendJson(response, 400, { error: managerError }); return; }
      const updated = await prisma.user.update({ where: { id: employeeId }, data: employeeDatabaseData(employee) });
      await addDatabaseAudit(user.id, "employee.updated", employeeId);
      sendJson(response, 200, { user: publicEmployee(databaseUserToApi(updated)) });
      return;
    }

    if (request.method === "POST" && request.url?.match(/^\/api\/employees\/[^/]+\/lock$/)) {
      const user = await requireUser(request, response);
      if (!user) return;
      if (!canManageEmployees(user.role)) { sendJson(response, 403, { error: "Forbidden" }); return; }
      const employeeId = request.url.split("/")[3];
      if (employeeId === user.id) { sendJson(response, 409, { error: "You cannot lock your own account" }); return; }
      const existing = await prisma.user.findUnique({ where: { id: employeeId }, select: { id: true } });
      if (!existing) { sendJson(response, 404, { error: "Employee not found" }); return; }

      const body = await readJsonBody<{ locked?: boolean }>(request);
      const locked = Boolean(body.locked);
      const updated = await prisma.user.update({ where: { id: employeeId }, data: { locked, employmentStatus: locked ? "LOCKED" : "ACTIVE" } });
      await addDatabaseAudit(user.id, locked ? "employee.locked" : "employee.unlocked", employeeId);
      sendJson(response, 200, { user: publicEmployee(databaseUserToApi(updated)) });
      return;
    }

    if (request.method === "POST" && request.url === "/api/employees/import") {
      const user = await requireUser(request, response);
      if (!user) return;
      if (!canManageEmployees(user.role)) { sendJson(response, 403, { error: "Forbidden" }); return; }
      const body = await readJsonBody<{ rows?: string }>(request);
      const databaseUsers = (await prisma.user.findMany()).map(databaseUserToApi);
      const result = parseEmployeeImportRows(body.rows ?? "", databaseUsers);
      if (result.errors.length) { sendJson(response, 400, result); return; }

      const records = await prisma.$transaction(result.users.map((employee) => prisma.user.create({ data: { id: employee.id, ...employeeDatabaseData(employee), passwordHash: hashPassword("password") } })));
      await addDatabaseAudit(user.id, "employee.imported", "employees");
      sendJson(response, 201, { users: records.map(databaseUserToApi).map(publicEmployee), errors: [] });
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/api/employees/export")) {
      const user = await requireUser(request, response);
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
      const databaseUsers = (await prisma.user.findMany()).map(databaseUserToApi);
      const rows = toEmployeeExportRows(getRoleScopedEmployees(databaseUsers, user));
      const body = format === "pdf" ? buildSimplePdf("Employee Management", rows) : buildExcelWorkbook("Employee Management", rows);
      response.writeHead(200, {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="employees.${format === "excel" ? "xls" : "pdf"}"`
      });
      response.end(body);
      return;
    }

    if (request.method === "GET" && request.url === "/api/users") {
      const user = await requireUser(request, response);
      if (!user) return;

      if (user.role !== "Admin" && user.role !== "HR") {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      sendJson(response, 200, { users: (await prisma.user.findMany()).map(databaseUserToApi).map(publicUser) });
      return;
    }

    if (request.method === "GET" && request.url?.startsWith("/api/attendance/logs")) {
      const user = await requireUser(request, response);
      if (!user) return;

      const url = new URL(request.url, `http://${request.headers.host}`);
      const databaseLogs = (await prisma.attendanceLog.findMany({ include: { employee: true }, orderBy: { workDate: "desc" } })).map(databaseAttendanceLogToApi);
      const scopedLogs = filterAttendanceLogs(getRoleScopedLogs(databaseLogs, user), url.searchParams);
      sendJson(response, 200, { logs: scopedLogs });
      return;
    }

    if (request.method === "GET" && request.url?.startsWith("/api/leave-attachments/")) {
      const user = await requireUser(request, response);
      if (!user) return;
      const storageKey = decodeURIComponent(request.url.split("/").pop() ?? "");
      const attachmentRecord = await prisma.leaveAttachment.findFirst({ where: { storageKey }, include: { leaveRequest: { include: { employee: true, attachment: true } } } });
      const requestItem = attachmentRecord ? databaseLeaveRequestToApi(attachmentRecord.leaveRequest) : null;
      if (!attachmentRecord || !requestItem || !getRoleScopedLeaveRequests([requestItem], user).length) { sendJson(response, 403, { error: "Forbidden" }); return; }
      const filePath = resolve(uploadRoot, storageKey);
      if (!filePath.startsWith(uploadRoot) || !existsSync(filePath)) { sendJson(response, 404, { error: "Attachment not found" }); return; }
      response.writeHead(200, { "Content-Type": attachmentRecord.mimeType, "Content-Disposition": `attachment; filename="${encodeURIComponent(attachmentRecord.name)}"` });
      createReadStream(filePath).pipe(response);
      return;
    }

    if (request.method === "GET" && request.url === "/api/leave-workflow") {
      const user = await requireUser(request, response);
      if (!user) return;
      sendJson(response, 200, { workflow: await getDatabaseLeaveWorkflow() });
      return;
    }

    if (request.method === "PUT" && request.url === "/api/leave-workflow") {
      const user = await requireUser(request, response);
      if (!user) return;
      if (user.role !== "Admin") { sendJson(response, 403, { error: "Forbidden" }); return; }
      const body = await readJsonBody<Partial<LeaveWorkflowConfig>>(request);
      const current = await getDatabaseLeaveWorkflow();
      const next = { ...current, ...body, defaultAnnualLeaveDays: typeof body.defaultAnnualLeaveDays === "number" ? Math.max(0, Math.floor(body.defaultAnnualLeaveDays)) : current.defaultAnnualLeaveDays };
      const record = await prisma.leaveWorkflowConfig.upsert({ where: { id: "default" }, update: next, create: { id: "default", ...next } });
      await addDatabaseAudit(user.id, "leave.workflow.updated", "leave-workflow");
      sendJson(response, 200, { workflow: databaseLeaveWorkflowToApi(record) });
      return;
    }

    if (request.method === "GET" && request.url === "/api/leave-requests") {
      const user = await requireUser(request, response);
      if (!user) return;
      const requests = await getDatabaseLeaveRequests();
      sendJson(response, 200, { requests: getRoleScopedLeaveRequests(requests, user) });
      return;
    }

    if (request.method === "POST" && request.url === "/api/leave-requests") {
      const user = await requireUser(request, response);
      if (!user) return;
      if (user.role === "Payroll") { sendJson(response, 403, { error: "Forbidden" }); return; }
      const body = request.headers["content-type"]?.startsWith("multipart/form-data") ? await readMultipartLeaveBody(request, request.headers["content-type"], user.id) : await readJsonBody<{ type?: LeaveType; startDate?: string; endDate?: string; reason?: string; attachmentName?: string; attachment?: LeaveAttachment; submitMode?: "draft" | "submit" }>(request);
      const validationError = validateLeaveRequestBody(body, user.id, undefined, true);
      if (validationError) { sendJson(response, 400, { error: validationError }); return; }
      const workflow = await getDatabaseLeaveWorkflow();
      const days = calculateLeaveDays(body.startDate ?? "", body.endDate ?? "");
      if (body.submitMode !== "draft" && workflow.annualLeaveRequiresBalance && body.type === "Annual Leave" && days > user.remainingLeaveDays) { sendJson(response, 409, { error: "Leave request exceeds remaining balance" }); return; }
      const existingRequests = await getDatabaseLeaveRequests();
      if (body.submitMode !== "draft" && hasLeaveOverlap(existingRequests, user.id, body.startDate ?? "", body.endDate ?? "")) { sendJson(response, 409, { error: "Leave request overlaps with an existing request" }); return; }
      const managerId = await resolveActiveManagerId(user.managerId);
      if (body.submitMode !== "draft" && !managerId) { sendJson(response, 409, { error: "No active manager is assigned to this employee" }); return; }
      const attachment = normalizeAttachment(body.attachment, user.id);
      const record = await prisma.leaveRequest.create({ data: { id: randomUUID(), employeeId: user.id, managerId, type: leaveTypeToDatabase(body.type ?? "Annual Leave"), startDate: dateOnlyValue(body.startDate ?? ""), endDate: dateOnlyValue(body.endDate ?? ""), days, reason: body.reason?.trim() ?? "", attachmentName: attachment?.name || body.attachmentName?.trim() || null, status: body.submitMode === "draft" ? "DRAFT" : "PENDING_MANAGER", ...(attachment ? { attachment: { create: { name: attachment.name, mimeType: attachment.mimeType, size: attachment.size, url: attachment.url, storageKey: attachment.storageKey, dataUrl: attachment.dataUrl, uploadedAt: new Date(attachment.uploadedAt), uploadedBy: attachment.uploadedBy } } } : {}) }, include: { employee: true, attachment: true } });
      await addDatabaseAudit(user.id, body.submitMode === "draft" ? "leave.request.draft_saved" : "leave.request.created", record.id);
      sendJson(response, 201, { request: databaseLeaveRequestToApi(record) });
      return;
    }

    if (request.method === "PUT" && request.url?.match(/^\/api\/leave-requests\/[^/]+$/)) {
      const user = await requireUser(request, response);
      if (!user) return;
      const requestId = request.url.split("/")[3];
      const record = await prisma.leaveRequest.findUnique({ where: { id: requestId }, include: { employee: true, attachment: true } });
      if (!record || record.employeeId !== user.id || record.status !== "DRAFT") { sendJson(response, 403, { error: "Only the owner can edit a draft leave request" }); return; }
      const body = await readJsonBody<{ reason?: string }>(request);
      const reason = body.reason?.trim() ?? "";
      if (!reason) { sendJson(response, 400, { error: "Leave request reason is required" }); return; }
      const updated = await prisma.leaveRequest.update({ where: { id: requestId }, data: { reason }, include: { employee: true, attachment: true } });
      await addDatabaseAudit(user.id, "leave.request.draft_updated", requestId);
      sendJson(response, 200, { request: databaseLeaveRequestToApi(updated) });
      return;
    }

    if (request.method === "POST" && request.url?.match(/^\/api\/leave-requests\/[^/]+\/submit$/)) {
      const user = await requireUser(request, response);
      if (!user) return;
      const requestId = request.url.split("/")[3];
      const record = await prisma.leaveRequest.findUnique({ where: { id: requestId }, include: { employee: true, attachment: true } });
      if (!record || record.employeeId !== user.id || record.status !== "DRAFT") { sendJson(response, 403, { error: "Forbidden" }); return; }
      const requestItem = databaseLeaveRequestToApi(record);
      const workflow = await getDatabaseLeaveWorkflow();
      if (workflow.annualLeaveRequiresBalance && requestItem.type === "Annual Leave" && requestItem.days > user.remainingLeaveDays) { sendJson(response, 409, { error: "Leave request exceeds remaining balance" }); return; }
      const allRequests = await getDatabaseLeaveRequests();
      if (hasLeaveOverlap(allRequests, user.id, requestItem.startDate, requestItem.endDate, requestId)) { sendJson(response, 409, { error: "Leave request overlaps with an existing request" }); return; }
      const managerId = await resolveActiveManagerId(record.employee.managerId);
      if (!managerId) { sendJson(response, 409, { error: "No active manager is assigned to this employee" }); return; }
      const updated = await prisma.leaveRequest.update({ where: { id: requestId }, data: { status: "PENDING_MANAGER", managerId }, include: { employee: true, attachment: true } });
      await addDatabaseAudit(user.id, "leave.request.submitted", requestId);
      sendJson(response, 200, { request: databaseLeaveRequestToApi(updated) });
      return;
    }

    if (request.method === "POST" && request.url?.match(/^\/api\/leave-requests\/[^/]+\/cancel$/)) {
      const user = await requireUser(request, response);
      if (!user) return;
      const requestId = request.url.split("/")[3];
      const record = await prisma.leaveRequest.findUnique({ where: { id: requestId }, include: { employee: true, attachment: true } });
      const requestItem = record ? databaseLeaveRequestToApi(record) : null;
      if (!record || !requestItem || !canCancelLeaveRequest(user, requestItem)) { sendJson(response, 403, { error: "Forbidden" }); return; }
      const updated = await prisma.leaveRequest.update({ where: { id: requestId }, data: { status: "CANCELLED" }, include: { employee: true, attachment: true } });
      await addDatabaseAudit(user.id, "leave.request.cancelled", requestId);
      sendJson(response, 200, { request: databaseLeaveRequestToApi(updated) });
      return;
    }

    if (request.method === "POST" && request.url?.match(/^\/api\/leave-requests\/[^/]+\/(approve|reject)$/)) {
      const user = await requireUser(request, response);
      if (!user) return;
      const [, , , requestId, action] = request.url.split("/");
      const record = await prisma.leaveRequest.findUnique({ where: { id: requestId }, include: { employee: true, attachment: true } });
      const requestItem = record ? databaseLeaveRequestToApi(record) : null;
      if (!record || !requestItem || !canApproveLeaveRequest(user, requestItem)) { sendJson(response, 403, { error: "Forbidden" }); return; }
      if (action === "reject") {
        const updated = await prisma.leaveRequest.update({ where: { id: requestId }, data: { status: "REJECTED" }, include: { employee: true, attachment: true } });
        await addDatabaseNotification({ recipientId: record.employeeId, title: "Leave request rejected", message: "Your leave request was rejected.", category: "LEAVE" });
        await addDatabaseAudit(user.id, "leave.request.rejected", requestId);
        sendJson(response, 200, { request: databaseLeaveRequestToApi(updated) });
        return;
      }
      const workflow = await getDatabaseLeaveWorkflow();
      if (record.status === "PENDING_MANAGER" && user.role === "Manager" && workflow.requireHrApproval) {
        const updated = await prisma.leaveRequest.update({ where: { id: requestId }, data: { status: "PENDING_HR" }, include: { employee: true, attachment: true } });
        await addDatabaseNotification({ recipientRole: "HR", title: "Leave request needs HR approval", message: `${record.employee.name} has a leave request waiting for HR approval.`, category: "LEAVE" });
        await addDatabaseAudit(user.id, "leave.request.manager_approved", requestId);
        sendJson(response, 200, { request: databaseLeaveRequestToApi(updated) });
        return;
      }
      const generatedLogs = createLeaveAttendanceLogs(requestItem);
      const transactionResult = await prisma.$transaction(async (transaction) => {
        const updated = await transaction.leaveRequest.update({ where: { id: requestId }, data: { status: "APPROVED" }, include: { employee: true, attachment: true } });
        let remainingLeaveDays = Number(record.employee.remainingLeaveDays);
        if (workflow.annualLeaveRequiresBalance && record.type === "ANNUAL") {
          remainingLeaveDays = Math.max(0, remainingLeaveDays - Number(record.days));
          await transaction.user.update({ where: { id: record.employeeId }, data: { remainingLeaveDays } });
        }
        for (const log of generatedLogs) {
          await transaction.attendanceLog.create({ data: { id: log.id, employeeId: log.employeeId, managerId: log.managerId || null, workDate: dateOnlyValue(log.workDate), totalMinutes: 0, overtimeMinutes: 0, status: "ON_LEAVE", adjustmentStatus: "NONE", payrollLocked: false } });
        }
        return { updated, remainingLeaveDays };
      });
      await addDatabaseNotification({ recipientId: record.employeeId, title: "Leave request approved", message: "Your leave request was approved.", category: "LEAVE" });
      await addDatabaseAudit(user.id, "leave.request.final_approved", requestId);
      sendJson(response, 200, { request: databaseLeaveRequestToApi(transactionResult.updated), attendanceLog: generatedLogs[0], attendanceLogs: generatedLogs, employeeRemainingLeaveDays: transactionResult.remainingLeaveDays });
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/api/notifications")) {
      const user = await requireUser(request, response);
      if (!user) return;
      sendJson(response, 200, { notifications: await getDatabaseNotifications(user) });
      return;
    }

    if (request.method === "POST" && request.url?.match(/^\/api\/notifications\/[^/]+\/read$/)) {
      const user = await requireUser(request, response);
      if (!user) return;
      const notificationId = request.url.split("/")[3];
      const record = await prisma.notification.findUnique({ where: { id: notificationId } });
      if (!record || !canViewDatabaseNotification(user, record)) {
        sendJson(response, 404, { error: "Notification not found" });
        return;
      }
      const updated = await prisma.notification.update({ where: { id: notificationId }, data: { read: true } });
      sendJson(response, 200, { notification: databaseNotificationToApi(updated) });
      return;
    }

    if (request.method === "POST" && request.url === "/api/notifications/read-all") {
      const user = await requireUser(request, response);
      if (!user) return;
      await prisma.notification.updateMany({ where: databaseNotificationScope(user), data: { read: true } });
      sendJson(response, 200, { notifications: await getDatabaseNotifications(user) });
      return;
    }

    if (request.method === "POST" && request.url?.match(/^\/api\/notifications\/[^/]+\/retry-email$/)) {
      const user = await requireUser(request, response);
      if (!user) return;
      if (user.role !== "Admin" && user.role !== "HR" && user.role !== "Payroll") {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }
      const notificationId = request.url.split("/")[3];
      const record = await prisma.notification.findUnique({ where: { id: notificationId } });
      if (!record || !canViewDatabaseNotification(user, record)) {
        sendJson(response, 404, { error: "Notification not found" });
        return;
      }
      const updated = await prisma.notification.update({ where: { id: notificationId }, data: { emailStatus: "SENT", retryCount: { increment: 1 } } });
      await addDatabaseAudit(user.id, "notification.email_retried", notificationId);
      sendJson(response, 200, { notification: databaseNotificationToApi(updated) });
      return;
    }

    if (request.method === "GET" && request.url?.startsWith("/api/help/articles")) {
      const user = await requireUser(request, response);
      if (!user) return;
      const url = new URL(request.url, "http://" + request.headers.host);
      const query = url.searchParams.get("query")?.trim() ?? "";
      const role = apiRoleToDatabaseRole(user.role);
      const records = await prisma.helpArticle.findMany({
        where: {
          allowedRoles: { has: role },
          ...(query ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { body: { contains: query, mode: "insensitive" } }] } : {})
        },
        orderBy: { createdAt: "asc" }
      });
      sendJson(response, 200, { articles: records.map(databaseHelpArticleToApi) });
      return;
    }

    if (request.method === "POST" && request.url === "/api/help/support-tickets") {
      const user = await requireUser(request, response);
      if (!user) return;
      const body = await readJsonBody<{ subject?: string; message?: string }>(request);
      if (!body.subject?.trim() || !body.message?.trim()) {
        sendJson(response, 400, { error: "Subject and message are required" });
        return;
      }
      const ticket = await prisma.supportTicket.create({ data: { id: randomUUID(), requesterId: user.id, subject: body.subject.trim(), message: body.message.trim(), status: "OPEN" }, include: { requester: true } });
      await addDatabaseNotification({ recipientRole: "Admin", title: "New support request", message: `${user.name}: ${ticket.subject}`, category: "SYSTEM" });
      await addDatabaseAudit(user.id, "support.ticket.created", ticket.id);
      sendJson(response, 201, { ticket: databaseSupportTicketToApi(ticket) });
      return;
    }
    if (request.method === "GET" && request.url === "/api/settings") {
      const user = await requireUser(request, response);
      if (!user) return;
      const settings = await getDatabaseSystemSettings();
      syncSystemSettingsCache(settings);
      sendJson(response, 200, { settings });
      return;
    }

    if (request.method === "PUT" && request.url === "/api/settings") {
      const user = await requireUser(request, response);
      if (!user) return;
      const body = await readJsonBody<Partial<SystemSettings>>(request);
      const validationError = validateSystemSettings(body);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }
      const current = await getDatabaseSystemSettings();
      const changedGroups = getChangedSettingGroups(current, body);
      const disallowedGroups = changedGroups.filter((group) => !canEditSettingGroup(user.role, group));
      if (disallowedGroups.length > 0) {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }
      const next = structuredClone(current);
      updateSystemSettings(next, body);
      const settings = await saveDatabaseSystemSettings(next, body);
      syncSystemSettingsCache(settings);
      await addDatabaseAudit(user.id, "settings.updated", changedGroups.join(",") || "settings");
      sendJson(response, 200, { settings });
      return;
    }
    if (request.method === "GET" && request.url === "/api/payroll/periods") {
      const user = await requireUser(request, response);
      if (!user) return;
      if (!canViewPayroll(user.role)) { sendJson(response, 403, { error: "Forbidden" }); return; }
      const periods = await getDatabasePayrollPeriods();
      sendJson(response, 200, { periods: await scopeDatabasePayrollPeriods(periods, user) });
      return;
    }

    if (request.method === "POST" && request.url === "/api/payroll/periods") {
      const user = await requireUser(request, response);
      if (!user) return;
      if (user.role !== "Payroll" && user.role !== "Admin") { sendJson(response, 403, { error: "Forbidden" }); return; }
      const body = await readJsonBody<{ name?: string; startDate?: string; endDate?: string }>(request);
      const validationError = validatePayrollPeriodBody(body);
      if (validationError) { sendJson(response, 400, { error: validationError }); return; }
      const periodId = randomUUID();
      await prisma.payrollPeriod.create({ data: { id: periodId, name: body.name?.trim() || `Payroll ${body.startDate} - ${body.endDate}`, startDate: dateOnlyValue(body.startDate ?? ""), endDate: dateOnlyValue(body.endDate ?? ""), status: "DRAFT", createdById: user.id, warnings: [] } });
      const period = await recalculateDatabasePayrollPeriod(periodId, user.id, "created");
      await addDatabaseNotification({ recipientRole: "Payroll", title: "Payroll period needs confirmation", message: `${period.name} is ready for payroll review.`, category: "PAYROLL" });
      await addDatabaseAudit(user.id, "payroll.period.created", periodId);
      sendJson(response, 201, { period: (await scopeDatabasePayrollPeriods([period], user))[0] });
      return;
    }

    if (request.url?.match(/^\/api\/payroll\/periods\/[^/]+\/(recalculate|confirm|lock|unlock)$/) && request.method === "POST") {
      const user = await requireUser(request, response);
      if (!user) return;
      const [, , , , periodId, action] = request.url.split("/");
      const existing = await getDatabasePayrollPeriod(periodId);
      if (!existing) { sendJson(response, 404, { error: "Payroll period not found" }); return; }
      if (action === "recalculate") {
        if (user.role !== "Payroll" && user.role !== "HR" && user.role !== "Admin") { sendJson(response, 403, { error: "Forbidden" }); return; }
        if (existing.status === "LOCKED") { sendJson(response, 409, { error: "Payroll period is locked" }); return; }
        const period = await recalculateDatabasePayrollPeriod(periodId, user.id, "recalculated");
        await addDatabaseAudit(user.id, "payroll.period.recalculated", periodId);
        sendJson(response, 200, { period: (await scopeDatabasePayrollPeriods([period], user))[0] });
        return;
      }
      if (action === "confirm") {
        if (user.role !== "HR" && user.role !== "Admin" && user.role !== "Payroll") { sendJson(response, 403, { error: "Forbidden" }); return; }
        if (existing.status === "LOCKED") { sendJson(response, 409, { error: "Payroll period is locked" }); return; }
        await recalculateDatabasePayrollPeriod(periodId, user.id, "confirmed");
        await prisma.payrollPeriod.update({ where: { id: periodId }, data: { status: "CONFIRMED", confirmedById: user.id, confirmedAt: new Date() } });
        const period = await getDatabasePayrollPeriod(periodId);
        await addDatabaseAudit(user.id, "payroll.period.confirmed", periodId);
        sendJson(response, 200, { period: (await scopeDatabasePayrollPeriods([period!], user))[0] });
        return;
      }
      if (action === "lock") {
        if (user.role !== "Payroll" && user.role !== "Admin") { sendJson(response, 403, { error: "Forbidden" }); return; }
        const checked = await recalculateDatabasePayrollPeriod(periodId, user.id, "pre-lock check");
        if (systemSettings.payrollExport.lockRequiresResolvedLogs && checked.warnings.length > 0) { sendJson(response, 409, { error: "Payroll period has unresolved warnings", warnings: checked.warnings }); return; }
        await prisma.$transaction([
          prisma.payrollPeriod.update({ where: { id: periodId }, data: { status: "LOCKED", lockedById: user.id, lockedAt: new Date() } }),
          prisma.attendanceLog.updateMany({ where: { workDate: { gte: checked.startDate, lte: checked.endDate } }, data: { payrollLocked: true } })
        ]);
        await addDatabasePayrollVersion(periodId, user.id, "locked");
        const period = await getDatabasePayrollPeriod(periodId);
        await addDatabaseAudit(user.id, "payroll.period.locked", periodId);
        sendJson(response, 200, { period: (await scopeDatabasePayrollPeriods([period!], user))[0] });
        return;
      }
      if (action === "unlock") {
        if (user.role !== "Admin") { sendJson(response, 403, { error: "Forbidden" }); return; }
        await prisma.$transaction([
          prisma.payrollPeriod.update({ where: { id: periodId }, data: { status: "DRAFT", unlockedById: user.id, unlockedAt: new Date() } }),
          prisma.attendanceLog.updateMany({ where: { workDate: { gte: existing.startDate, lte: existing.endDate } }, data: { payrollLocked: false } })
        ]);
        await addDatabasePayrollVersion(periodId, user.id, "unlocked");
        const period = await getDatabasePayrollPeriod(periodId);
        await addDatabaseAudit(user.id, "payroll.period.unlocked", periodId);
        sendJson(response, 200, { period: (await scopeDatabasePayrollPeriods([period!], user))[0] });
        return;
      }
    }

    if (request.method === "GET" && request.url?.match(/^\/api\/payroll\/periods\/[^/]+\/export/)) {
      const user = await requireUser(request, response);
      if (!user) return;
      if (!canViewPayroll(user.role)) { sendJson(response, 403, { error: "Forbidden" }); return; }
      const url = new URL(request.url, `http://${request.headers.host}`);
      const periodId = request.url.split("/")[4];
      const record = await getDatabasePayrollPeriod(periodId);
      if (!record) { sendJson(response, 404, { error: "Payroll period not found" }); return; }
      const format = url.searchParams.get("format") ?? "excel";
      if (format !== "excel" && format !== "pdf") { sendJson(response, 400, { error: "Unsupported export format" }); return; }
      const scopedPeriod = (await scopeDatabasePayrollPeriods([record], user))[0];
      const apiPeriod = scopedPeriod;
      const rows = toPayrollExportRows(apiPeriod);
      const body = format === "pdf" ? buildSimplePdf(apiPeriod.name, rows) : buildExcelWorkbook(apiPeriod.name, rows);
      response.writeHead(200, { "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.ms-excel; charset=utf-8", "Content-Disposition": `attachment; filename="payroll-summary.${format === "excel" ? "xls" : "pdf"}"` });
      response.end(body);
      return;
    }
    if (request.method === "GET" && request.url?.startsWith("/api/attendance/export")) {
      const user = await requireUser(request, response);
      if (!user) return;

      const url = new URL(request.url, `http://${request.headers.host}`);
      const format = url.searchParams.get("format") ?? "excel";
      if (format !== "excel" && format !== "pdf") {
        sendJson(response, 400, { error: "Unsupported export format" });
        return;
      }
      const databaseLogs = (await prisma.attendanceLog.findMany({ include: { employee: true }, orderBy: { workDate: "desc" } })).map(databaseAttendanceLogToApi);
      const scopedLogs = filterAttendanceLogs(getRoleScopedLogs(databaseLogs, user), url.searchParams);
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
      const user = await requireUser(request, response);
      if (!user) return;
      const logId = request.url.split("/")[4];
      const record = await prisma.attendanceLog.findUnique({ where: { id: logId }, include: { employee: true } });
      const log = record ? databaseAttendanceLogToApi(record) : null;
      if (!record || !log || !canViewLog(user, log)) { sendJson(response, 404, { error: "Log not found" }); return; }
      if (record.payrollLocked) { sendJson(response, 409, { error: "Payroll period is locked" }); return; }
      const body = await readJsonBody<{ reason?: string }>(request);
      const updated = await prisma.$transaction(async (transaction) => {
        await transaction.attendanceAdjustment.upsert({ where: { attendanceLogId: logId }, update: { reason: body.reason?.trim() || "Attendance adjustment requested", requestedById: user.id, status: "PENDING", decidedById: null, decidedAt: null }, create: { attendanceLogId: logId, reason: body.reason?.trim() || "Attendance adjustment requested", requestedById: user.id, status: "PENDING" } });
        return transaction.attendanceLog.update({ where: { id: logId }, data: { adjustmentStatus: "PENDING" }, include: { employee: true } });
      });
      await addDatabaseAudit(user.id, "attendance.adjustment.requested", logId);
      sendJson(response, 200, { log: databaseAttendanceLogToApi(updated) });
      return;
    }

    if (request.method === "POST" && request.url?.match(/^\/api\/attendance\/logs\/[^/]+\/(approve|reject)$/)) {
      const user = await requireUser(request, response);
      if (!user) return;
      const [, , , , logId, action] = request.url.split("/");
      const record = await prisma.attendanceLog.findUnique({ where: { id: logId }, include: { employee: true } });
      const log = record ? databaseAttendanceLogToApi(record) : null;
      if (!record || !log || !canApproveAdjustment(user, log)) { sendJson(response, 403, { error: "Forbidden" }); return; }
      if (record.payrollLocked) { sendJson(response, 409, { error: "Payroll period is locked" }); return; }
      const approved = action === "approve";
      const updated = await prisma.$transaction(async (transaction) => {
        await transaction.attendanceAdjustment.updateMany({ where: { attendanceLogId: logId }, data: { status: approved ? "APPROVED" : "REJECTED", decidedById: user.id, decidedAt: new Date() } });
        return transaction.attendanceLog.update({ where: { id: logId }, data: { adjustmentStatus: approved ? "APPROVED" : "REJECTED", ...(approved ? { status: "ADJUSTED" as const } : {}) }, include: { employee: true } });
      });
      await addDatabaseAudit(user.id, `attendance.adjustment.${action}d`, logId);
      sendJson(response, 200, { log: databaseAttendanceLogToApi(updated) });
      return;
    }
    if (request.method === "GET" && request.url === "/api/audit-logs") {
      const user = await requireUser(request, response);
      if (!user) return;

      if (user.role !== "Admin" && user.role !== "HR" && user.role !== "Payroll") {
        sendJson(response, 403, { error: "Forbidden" });
        return;
      }

      const databaseAuditLogs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" } });
      sendJson(response, 200, { auditLogs: databaseAuditLogs });
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

async function startServer() {
  syncSystemSettingsCache(await getDatabaseSystemSettings());
  server.listen(port, () => {
    console.log(`Workforce Pro API listening on http://localhost:${port}`);
  });
}

void startServer().catch((error) => {
  console.error("Unable to initialize Workforce Pro API", error);
  process.exit(1);
});
function canViewPayroll(role: string) {
  return role === "Manager" || role === "HR" || role === "Payroll" || role === "Admin";
}

function validatePayrollPeriodBody(body: { name?: string; startDate?: string; endDate?: string }) {
  if (!body.startDate || !body.endDate) return "Payroll period dates are required";
  if (dateOnlyValue(body.endDate) < dateOnlyValue(body.startDate)) return "Invalid payroll date range";
  return "";
}

type DatabasePayrollPeriod = PrismaPayrollPeriod & { rows: (PrismaPayrollSummaryRow & { employee: PrismaUser })[]; versions: PrismaPayrollVersion[] };

async function getDatabasePayrollPeriod(id: string) {
  return prisma.payrollPeriod.findUnique({ where: { id }, include: { rows: { include: { employee: true }, orderBy: { employeeId: "asc" } }, versions: { orderBy: { version: "desc" } } } });
}

async function getDatabasePayrollPeriods() {
  return prisma.payrollPeriod.findMany({ include: { rows: { include: { employee: true }, orderBy: { employeeId: "asc" } }, versions: { orderBy: { version: "desc" } } }, orderBy: { startDate: "desc" } });
}

function databasePayrollPeriodToApi(period: DatabasePayrollPeriod): PayrollPeriod {
  const status = { DRAFT: "Draft", CONFIRMED: "Confirmed", LOCKED: "Locked" } as const;
  return { id: period.id, name: period.name, startDate: period.startDate.toISOString().slice(0, 10), endDate: period.endDate.toISOString().slice(0, 10), status: status[period.status], createdBy: period.createdById, createdAt: period.createdAt.toISOString(), confirmedBy: period.confirmedById ?? undefined, confirmedAt: period.confirmedAt?.toISOString(), lockedBy: period.lockedById ?? undefined, lockedAt: period.lockedAt?.toISOString(), unlockedBy: period.unlockedById ?? undefined, unlockedAt: period.unlockedAt?.toISOString(), warnings: period.warnings, rows: period.rows.map((row) => ({ employeeId: row.employeeId, employeeName: row.employee.name, department: row.department, standardHours: Number(row.standardHours), workedHours: Number(row.workedHours), overtimeHours: Number(row.overtimeHours), paidLeaveHours: Number(row.paidLeaveHours), unpaidLeaveHours: Number(row.unpaidLeaveHours), missingHours: Number(row.missingHours), lateCount: row.lateCount, earlyLeaveCount: row.earlyLeaveCount, missingLogCount: row.missingLogCount, totalPayableHours: Number(row.totalPayableHours) })), versions: period.versions.map((version) => ({ version: version.version, action: version.action, actorId: version.actorId, createdAt: version.createdAt.toISOString(), notes: version.notes })) };
}

async function scopeDatabasePayrollPeriods(periods: DatabasePayrollPeriod[], user: { id: string; role: string }) {
  if (user.role !== "Manager") return periods.map(databasePayrollPeriodToApi);
  const team = await prisma.user.findMany({ where: { OR: [{ id: user.id }, { managerId: user.id }] }, select: { id: true } });
  const employeeIds = new Set(team.map((employee) => employee.id));
  return periods.map((period) => databasePayrollPeriodToApi({ ...period, rows: period.rows.filter((row) => employeeIds.has(row.employeeId)) }));
}

async function recalculateDatabasePayrollPeriod(periodId: string, actorId: string, action: string) {
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw new Error("Payroll period not found");
  const [employees, logs, unpaidLeaves] = await Promise.all([
    prisma.user.findMany({ where: { role: { not: "ADMIN" } }, orderBy: { id: "asc" } }),
    prisma.attendanceLog.findMany({ where: { workDate: { gte: period.startDate, lte: period.endDate } } }),
    prisma.leaveRequest.findMany({ where: { type: "UNPAID", status: "APPROVED", startDate: { lte: period.endDate }, endDate: { gte: period.startDate } } })
  ]);
  const startDate = period.startDate.toISOString().slice(0, 10);
  const endDate = period.endDate.toISOString().slice(0, 10);
  const businessDays = countBusinessDays(startDate, endDate);
  const rows = employees.map((employee) => {
    const employeeLogs = logs.filter((log) => log.employeeId === employee.id);
    const row: PayrollSummaryRow = { employeeId: employee.id, employeeName: employee.name, department: employee.department, standardHours: businessDays * 8, workedHours: 0, overtimeHours: 0, paidLeaveHours: 0, unpaidLeaveHours: 0, missingHours: 0, lateCount: 0, earlyLeaveCount: 0, missingLogCount: 0, totalPayableHours: 0 };
    employeeLogs.forEach((log) => {
      const workDate = log.workDate.toISOString().slice(0, 10);
      if (log.status === "ON_LEAVE") {
        const unpaid = unpaidLeaves.some((leave) => leave.employeeId === employee.id && workDate >= leave.startDate.toISOString().slice(0, 10) && workDate <= leave.endDate.toISOString().slice(0, 10));
        if (unpaid) row.unpaidLeaveHours += 8; else row.paidLeaveHours += 8;
      } else row.workedHours += log.totalMinutes / 60;
      row.overtimeHours += log.overtimeMinutes / 60;
      if (log.status === "LATE") row.lateCount += 1;
      if (log.status === "EARLY_LEAVE") row.earlyLeaveCount += 1;
      if (log.status === "MISSING_CHECK_OUT") row.missingLogCount += 1;
      if (log.adjustmentStatus === "PENDING") row.missingLogCount += 1;
    });
    row.workedHours = roundHours(row.workedHours);
    row.overtimeHours = roundHours(row.overtimeHours);
    row.totalPayableHours = roundHours(row.workedHours + row.overtimeHours + row.paidLeaveHours);
    row.missingHours = Math.max(0, roundHours(row.standardHours - row.workedHours - row.paidLeaveHours - row.unpaidLeaveHours));
    return row;
  });
  const warnings = [...new Set(rows.filter((row) => row.missingLogCount > 0).map((row) => `${row.employeeName} has ${row.missingLogCount} unresolved attendance item(s)`))];
  const pendingCount = logs.filter((log) => log.adjustmentStatus === "PENDING").length;
  if (pendingCount > 0) warnings.unshift(`${pendingCount} pending attendance adjustment(s) must be resolved before locking`);
  await prisma.$transaction(async (transaction) => {
    await transaction.payrollSummaryRow.deleteMany({ where: { payrollPeriodId: periodId } });
    if (rows.length > 0) await transaction.payrollSummaryRow.createMany({ data: rows.map((row) => ({ payrollPeriodId: periodId, employeeId: row.employeeId, department: row.department, standardHours: row.standardHours, workedHours: row.workedHours, overtimeHours: row.overtimeHours, paidLeaveHours: row.paidLeaveHours, unpaidLeaveHours: row.unpaidLeaveHours, missingHours: row.missingHours, lateCount: row.lateCount, earlyLeaveCount: row.earlyLeaveCount, missingLogCount: row.missingLogCount, totalPayableHours: row.totalPayableHours })) });
    await transaction.payrollPeriod.update({ where: { id: periodId }, data: { warnings } });
  });
  await addDatabasePayrollVersion(periodId, actorId, action);
  return (await getDatabasePayrollPeriod(periodId))!;
}

async function addDatabasePayrollVersion(periodId: string, actorId: string, action: string) {
  const [latest, rowCount, period] = await Promise.all([prisma.payrollVersion.aggregate({ where: { payrollPeriodId: periodId }, _max: { version: true } }), prisma.payrollSummaryRow.count({ where: { payrollPeriodId: periodId } }), prisma.payrollPeriod.findUniqueOrThrow({ where: { id: periodId }, select: { warnings: true } })]);
  return prisma.payrollVersion.create({ data: { payrollPeriodId: periodId, version: (latest._max.version ?? 0) + 1, action, actorId, notes: `${action} with ${rowCount} employee row(s) and ${period.warnings.length} warning(s)` } });
}

function countBusinessDays(startDate: string, endDate: string) {
  let count = 0;
  const cursor = dateOnlyValue(startDate);
  const end = dateOnlyValue(endDate);
  while (cursor <= end) {
    const day = cursor.getUTCDay();
    const isoDate = cursor.toISOString().slice(0, 10);
    const isHoliday = systemSettings.holidays.some((holiday) => isoDate >= holiday.startDate && isoDate <= holiday.endDate);
    if (day !== 0 && day !== 6 && !isHoliday) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
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

function canViewEmployees(role: string) {
  return role === "Manager" || role === "HR" || role === "Payroll" || role === "Admin";
}

async function resolveActiveManagerId(managerId?: string | null) {
  const normalizedManagerId = normalizeManagerId(managerId);
  if (!normalizedManagerId) return null;
  const manager = await prisma.user.findUnique({
    where: { id: normalizedManagerId },
    select: { id: true, role: true, employmentStatus: true, locked: true }
  });
  return isActiveManager(manager) ? manager.id : null;
}

async function validateManagerAssignment(managerId?: string | null, employeeId?: string) {
  const normalizedManagerId = normalizeManagerId(managerId);
  if (!normalizedManagerId || normalizedManagerId === employeeId) {
    return getManagerAssignmentError(normalizedManagerId, employeeId, null);
  }
  const manager = await prisma.user.findUnique({
    where: { id: normalizedManagerId },
    select: { id: true, role: true, employmentStatus: true, locked: true }
  });
  return getManagerAssignmentError(normalizedManagerId, employeeId, manager);
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
    managerId: body.managerId?.trim() || undefined,
    hireDate: body.hireDate || new Date().toISOString().slice(0, 10),
    employmentStatus: locked ? "Locked" : (body.employmentStatus ?? "Active"),
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
  if (typeof body.managerId === "string") employee.managerId = body.managerId.trim() || undefined;
  if (typeof body.hireDate === "string") employee.hireDate = body.hireDate;
  if (body.employmentStatus) employee.employmentStatus = body.employmentStatus;
  if (typeof body.attendancePolicy === "string") employee.attendancePolicy = body.attendancePolicy.trim();
  if (typeof body.leavePolicy === "string") employee.leavePolicy = body.leavePolicy.trim();
  if (typeof body.remainingLeaveDays === "number" && Number.isFinite(body.remainingLeaveDays)) employee.remainingLeaveDays = Math.max(0, Math.floor(body.remainingLeaveDays));
  employee.locked = Boolean(body.locked) || employee.employmentStatus === "Locked";
}

function parseEmployeeImportRows(rows: string, existingUsers: User[]) {
  const errors: string[] = [];
  const parsedUsers: User[] = [];
  const allowedRoles: UserRole[] = ["Employee", "Manager", "HR", "Payroll", "Admin"];
  rows.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const [name = "", email = "", role = "Employee", department = "", position = ""] = line.split(",").map((item) => item.trim());
    const normalizedEmail = email.toLowerCase();
    if (!name || !normalizedEmail || !department || !allowedRoles.includes(role as UserRole) || existingUsers.some((item) => item.email.toLowerCase() === normalizedEmail) || parsedUsers.some((item) => item.email === normalizedEmail)) {
      errors.push(`Row ${index + 1}: name, email, role and department are required and email must be unique`);
      return;
    }
    parsedUsers.push(buildEmployee({ name, email: normalizedEmail, role: role as UserRole, subtitle: department, position, employeeCode: `IMP-${String(index + 1).padStart(3, "0")}` }));
  });
  return { users: parsedUsers, errors };
}

function dateOnlyValue(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function leaveTypeToDatabase(type: LeaveType) {
  return ({ "Annual Leave": "ANNUAL", "Sick Leave": "SICK", "Unpaid Leave": "UNPAID", "Compensatory Leave": "COMPENSATORY" } as const)[type];
}

function databaseLeaveWorkflowToApi(record: { requireHrApproval: boolean; annualLeaveRequiresBalance: boolean; allowEmployeeCancelBeforeManager: boolean; attachmentRequiredForSickLeave: boolean; defaultAnnualLeaveDays: { toString(): string } }): LeaveWorkflowConfig {
  return { requireHrApproval: record.requireHrApproval, annualLeaveRequiresBalance: record.annualLeaveRequiresBalance, allowEmployeeCancelBeforeManager: record.allowEmployeeCancelBeforeManager, attachmentRequiredForSickLeave: record.attachmentRequiredForSickLeave, defaultAnnualLeaveDays: Number(record.defaultAnnualLeaveDays) };
}

async function getDatabaseLeaveWorkflow() {
  const record = await prisma.leaveWorkflowConfig.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } });
  return databaseLeaveWorkflowToApi(record);
}

function databaseLeaveRequestToApi(record: PrismaLeaveRequest & { employee: PrismaUser; attachment: PrismaLeaveAttachment | null }): LeaveRequest {
  const typeMap = { ANNUAL: "Annual Leave", SICK: "Sick Leave", UNPAID: "Unpaid Leave", COMPENSATORY: "Compensatory Leave" } as const;
  const statusMap = { DRAFT: "Draft", PENDING_MANAGER: "Pending Manager", PENDING_HR: "Pending HR", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" } as const;
  return {
    id: record.id,
    employeeId: record.employeeId,
    employeeName: record.employee.name,
    department: record.employee.department,
    managerId: record.managerId ?? undefined,
    type: typeMap[record.type],
    startDate: record.startDate.toISOString().slice(0, 10),
    endDate: record.endDate.toISOString().slice(0, 10),
    days: Number(record.days),
    reason: record.reason,
    attachmentName: record.attachmentName ?? "",
    attachment: record.attachment ? { name: record.attachment.name, mimeType: record.attachment.mimeType, size: record.attachment.size, url: record.attachment.url ?? undefined, storageKey: record.attachment.storageKey ?? undefined, dataUrl: record.attachment.dataUrl ?? undefined, uploadedAt: record.attachment.uploadedAt.toISOString(), uploadedBy: record.attachment.uploadedBy ?? undefined } : undefined,
    status: statusMap[record.status],
    createdAt: record.createdAt.toISOString()
  };
}

async function getDatabaseLeaveRequests() {
  const records = await prisma.leaveRequest.findMany({ include: { employee: true, attachment: true }, orderBy: { createdAt: "desc" } });
  return records.map(databaseLeaveRequestToApi);
}

async function addDatabaseNotification(input: { recipientId?: string; recipientRole?: UserRole; title: string; message: string; category: "LEAVE" | "ATTENDANCE" | "CHECKOUT" | "ADJUSTMENT" | "PAYROLL" | "SYSTEM" }) {
  const role = input.recipientRole ? ({ Employee: "EMPLOYEE", Manager: "MANAGER", HR: "HR", Payroll: "PAYROLL", Admin: "ADMIN" } as const)[input.recipientRole] : null;
  return prisma.notification.create({ data: { id: randomUUID(), recipientId: input.recipientId ?? null, recipientRole: role, title: input.title, message: input.message, category: input.category, read: false, emailStatus: systemSettings.notifications.emailEnabled ? "SENT" : "NOT_SENT", retryCount: 0 } });
}
function databaseAttendanceSessionToApi(session: { id: string; employeeId: string; checkInAt: Date; device: string | null; ipAddress: string | null; location: string | null }) {
  return { id: session.id, employeeId: session.employeeId, checkInAt: session.checkInAt.toISOString(), device: session.device ?? "Browser device", ipAddress: session.ipAddress ?? "Unknown", location: session.location ?? "Unknown" };
}

function databaseAttendanceLogToApi(record: PrismaAttendanceLog & { employee: PrismaUser }): AttendanceLog {
  const statusMap = { ON_TIME: "On Time", LATE: "Late", EARLY_LEAVE: "Early Leave", ON_LEAVE: "On Leave", MISSING_CHECK_OUT: "Missing Check-out", HOLIDAY: "Holiday", WEEKEND: "Weekend", ADJUSTED: "Adjusted" } as const;
  const adjustmentMap = { NONE: "None", PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" } as const;
  return { id: record.id, employeeId: record.employeeId, employeeName: record.employee.name, department: record.employee.department, managerId: record.managerId ?? undefined, workDate: record.workDate.toISOString().slice(0, 10), date: formatLogDate(record.workDate), checkIn: record.checkInAt ? formatClockTime(record.checkInAt) : "--", checkOut: record.checkOutAt ? formatClockTime(record.checkOutAt) : "--", totalHours: `${Math.floor(record.totalMinutes / 60)}h ${record.totalMinutes % 60}m`, overtime: `${Math.floor(record.overtimeMinutes / 60)}h ${record.overtimeMinutes % 60}m`, status: statusMap[record.status], adjustmentStatus: adjustmentMap[record.adjustmentStatus], payrollLocked: record.payrollLocked };
}
function employeeDatabaseData(employee: User) {
  return {
    name: employee.name,
    email: employee.email,
    role: ({ Employee: "EMPLOYEE", Manager: "MANAGER", HR: "HR", Payroll: "PAYROLL", Admin: "ADMIN" } as const)[employee.role],
    subtitle: employee.subtitle,
    department: employee.subtitle,
    employeeCode: employee.employeeCode || null,
    phone: employee.phone || null,
    position: employee.position || null,
    managerId: employee.managerId || null,
    hireDate: employee.hireDate ? new Date(`${employee.hireDate}T00:00:00.000Z`) : null,
    employmentStatus: ({ Active: "ACTIVE", Locked: "LOCKED", Inactive: "INACTIVE" } as const)[employee.employmentStatus ?? (employee.locked ? "Locked" : "Active")],
    attendancePolicy: employee.attendancePolicy || null,
    leavePolicy: employee.leavePolicy || null,
    remainingLeaveDays: Math.max(0, Number(employee.remainingLeaveDays) || 0),
    locked: employee.locked
  };
}

async function addDatabaseAudit(actorId: string, action: string, targetId: string) {
  await prisma.auditLog.create({ data: { id: randomUUID(), actorId, action, targetId, success: true } });
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
      sourceUsers.find((manager) => manager.id === employee.managerId)?.name ?? "",
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

function apiRoleToDatabaseRole(role: UserRole) {
  return ({ Employee: "EMPLOYEE", Manager: "MANAGER", HR: "HR", Payroll: "PAYROLL", Admin: "ADMIN" } as const)[role];
}

function databaseNotificationToApi(record: PrismaNotification): AppNotification {
  const emailStatus = { NOT_SENT: "Not sent", SENT: "Sent", FAILED: "Failed" } as const;
  return { id: record.id, recipientId: record.recipientId ?? undefined, recipientRole: record.recipientRole ? databaseRoleToApiRole(record.recipientRole) : undefined, title: record.title, message: record.message, category: record.category.toLowerCase() as AppNotification["category"], read: record.read, createdAt: record.createdAt.toISOString(), emailStatus: emailStatus[record.emailStatus], retryCount: record.retryCount };
}

function databaseNotificationScope(user: { id: string; role: UserRole }) {
  if (user.role === "Admin") return {};
  return { OR: [{ recipientId: user.id }, { recipientRole: apiRoleToDatabaseRole(user.role) }] };
}

async function getDatabaseNotifications(user: { id: string; role: UserRole }) {
  const records = await prisma.notification.findMany({ where: databaseNotificationScope(user), orderBy: { createdAt: "desc" } });
  return records.map(databaseNotificationToApi);
}

function canViewDatabaseNotification(user: { id: string; role: UserRole }, notification: PrismaNotification) {
  return user.role === "Admin" || notification.recipientId === user.id || notification.recipientRole === apiRoleToDatabaseRole(user.role);
}

function databaseHelpArticleToApi(record: PrismaHelpArticle): HelpArticle {
  const category = { FAQ: "faq", CHECK_IN: "check-in", LEAVE: "leave", ADJUSTMENT: "adjustment", PAYROLL: "payroll" } as const;
  return { id: record.id, title: record.title, category: category[record.category], body: record.body, allowedRoles: record.allowedRoles.map(databaseRoleToApiRole) };
}

function databaseSupportTicketToApi(record: PrismaSupportTicket & { requester: PrismaUser }) {
  const status = { OPEN: "Open", IN_PROGRESS: "In Progress", RESOLVED: "Resolved" } as const;
  return { id: record.id, requesterId: record.requesterId, requesterName: record.requester.name, subject: record.subject, message: record.message, status: status[record.status], createdAt: record.createdAt.toISOString() };
}
async function getDatabaseSystemSettings(): Promise<SystemSettings> {
  const [record, schedules, holidays, permissions] = await Promise.all([
    prisma.systemSetting.upsert({ where: { id: "default" }, update: {}, create: { id: "default" } }),
    prisma.workSchedule.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.holiday.findMany({ orderBy: { startDate: "asc" } }),
    prisma.rolePermission.findMany({ orderBy: { permission: "asc" } })
  ]);
  const roles: SystemSettings["roles"] = { Employee: [], Manager: [], HR: [], Payroll: [], Admin: [] };
  permissions.forEach((permission) => roles[databaseRoleToApiRole(permission.role)].push(permission.permission));
  return {
    attendancePolicy: { standardStartTime: record.standardStartTime, standardEndTime: record.standardEndTime, lateGraceMinutes: record.lateGraceMinutes, earlyLeaveGraceMinutes: record.earlyLeaveGraceMinutes, overtimeAfterHours: record.overtimeAfterHours, requireLocation: record.requireLocation },
    leavePolicy: { defaultAnnualLeaveDays: Number(record.defaultAnnualLeaveDays), attachmentRequiredForSickLeave: record.attachmentRequiredForSickLeave, requireHrApproval: record.requireHrApproval, blockAnnualLeaveOverBalance: record.blockAnnualLeaveOverBalance },
    workSchedules: schedules.map((schedule) => ({ id: schedule.id, startTime: schedule.startTime, morningEndTime: schedule.morningEndTime, afternoonStartTime: schedule.afternoonStartTime, endTime: schedule.endTime, breakMinutes: schedule.breakMinutes, workDays: schedule.workDays })),
    holidays: holidays.map((holiday) => ({ id: holiday.id, name: holiday.name, startDate: holiday.startDate.toISOString().slice(0, 10), endDate: holiday.endDate.toISOString().slice(0, 10), paid: holiday.paid })),
    roles,
    notifications: { inAppEnabled: record.inAppEnabled, emailEnabled: record.emailEnabled, managerDigestEnabled: record.managerDigestEnabled, payrollReminderEnabled: record.payrollReminderEnabled },
    payrollExport: { defaultFormat: record.defaultPayrollExportFormat === "pdf" ? "pdf" : "excel", includeWarnings: record.includePayrollWarnings, lockRequiresResolvedLogs: record.lockRequiresResolvedLogs },
    security: { minPasswordLength: record.minPasswordLength, sessionTimeoutMinutes: record.sessionTimeoutMinutes, allowSelfRegistration: record.allowSelfRegistration, requireTwoFactor: record.requireTwoFactor },
    integrations: { calendarProvider: record.calendarProvider ?? "", payrollProvider: record.payrollProvider ?? "", webhookUrl: record.webhookUrl ?? "" },
    audit: { enabled: record.auditEnabled, retentionDays: record.auditRetentionDays }
  };
}

async function saveDatabaseSystemSettings(next: SystemSettings, changed: Partial<SystemSettings>) {
  await prisma.$transaction(async (transaction) => {
    await transaction.systemSetting.upsert({ where: { id: "default" }, update: systemSettingDatabaseData(next), create: { id: "default", ...systemSettingDatabaseData(next) } });
    if (changed.workSchedules) {
      await transaction.workSchedule.deleteMany();
      if (next.workSchedules.length > 0) await transaction.workSchedule.createMany({ data: next.workSchedules.map((schedule) => ({ id: schedule.id, name: schedule.id, startTime: schedule.startTime, morningEndTime: schedule.morningEndTime, afternoonStartTime: schedule.afternoonStartTime, endTime: schedule.endTime, breakMinutes: schedule.breakMinutes, workDays: schedule.workDays })) });
    }
    if (changed.holidays) {
      await transaction.holiday.deleteMany();
      if (next.holidays.length > 0) await transaction.holiday.createMany({ data: next.holidays.map((holiday) => ({ id: holiday.id, name: holiday.name, startDate: dateOnlyValue(holiday.startDate), endDate: dateOnlyValue(holiday.endDate), paid: holiday.paid })) });
    }
    if (changed.roles) {
      await transaction.rolePermission.deleteMany();
      const rows = Object.entries(next.roles).flatMap(([role, permissions]) => permissions.map((permission) => ({ role: apiRoleToDatabaseRole(role as UserRole), permission })));
      if (rows.length > 0) await transaction.rolePermission.createMany({ data: rows });
    }
    if (changed.leavePolicy) {
      await transaction.leaveWorkflowConfig.upsert({ where: { id: "default" }, update: { requireHrApproval: next.leavePolicy.requireHrApproval, annualLeaveRequiresBalance: next.leavePolicy.blockAnnualLeaveOverBalance, attachmentRequiredForSickLeave: next.leavePolicy.attachmentRequiredForSickLeave, defaultAnnualLeaveDays: next.leavePolicy.defaultAnnualLeaveDays }, create: { id: "default", requireHrApproval: next.leavePolicy.requireHrApproval, annualLeaveRequiresBalance: next.leavePolicy.blockAnnualLeaveOverBalance, attachmentRequiredForSickLeave: next.leavePolicy.attachmentRequiredForSickLeave, defaultAnnualLeaveDays: next.leavePolicy.defaultAnnualLeaveDays } });
    }
  });
  return getDatabaseSystemSettings();
}

function systemSettingDatabaseData(settings: SystemSettings) {
  return { standardStartTime: settings.attendancePolicy.standardStartTime, standardEndTime: settings.attendancePolicy.standardEndTime, lateGraceMinutes: settings.attendancePolicy.lateGraceMinutes, earlyLeaveGraceMinutes: settings.attendancePolicy.earlyLeaveGraceMinutes, overtimeAfterHours: settings.attendancePolicy.overtimeAfterHours, requireLocation: settings.attendancePolicy.requireLocation, defaultAnnualLeaveDays: settings.leavePolicy.defaultAnnualLeaveDays, attachmentRequiredForSickLeave: settings.leavePolicy.attachmentRequiredForSickLeave, requireHrApproval: settings.leavePolicy.requireHrApproval, blockAnnualLeaveOverBalance: settings.leavePolicy.blockAnnualLeaveOverBalance, inAppEnabled: settings.notifications.inAppEnabled, emailEnabled: settings.notifications.emailEnabled, managerDigestEnabled: settings.notifications.managerDigestEnabled, payrollReminderEnabled: settings.notifications.payrollReminderEnabled, defaultPayrollExportFormat: settings.payrollExport.defaultFormat, includePayrollWarnings: settings.payrollExport.includeWarnings, lockRequiresResolvedLogs: settings.payrollExport.lockRequiresResolvedLogs, minPasswordLength: settings.security.minPasswordLength, sessionTimeoutMinutes: settings.security.sessionTimeoutMinutes, allowSelfRegistration: settings.security.allowSelfRegistration, requireTwoFactor: settings.security.requireTwoFactor, calendarProvider: settings.integrations.calendarProvider || null, payrollProvider: settings.integrations.payrollProvider || null, webhookUrl: settings.integrations.webhookUrl || null, auditEnabled: settings.audit.enabled, auditRetentionDays: settings.audit.retentionDays };
}

function syncSystemSettingsCache(settings: SystemSettings) {
  Object.assign(systemSettings, structuredClone(settings));
  leaveWorkflowConfig.defaultAnnualLeaveDays = settings.leavePolicy.defaultAnnualLeaveDays;
  leaveWorkflowConfig.attachmentRequiredForSickLeave = settings.leavePolicy.attachmentRequiredForSickLeave;
  leaveWorkflowConfig.requireHrApproval = settings.leavePolicy.requireHrApproval;
  leaveWorkflowConfig.annualLeaveRequiresBalance = settings.leavePolicy.blockAnnualLeaveOverBalance;
}
function validateSystemSettings(body: Partial<SystemSettings>) {
  if (body.attendancePolicy) {
    if (!isTimeValue(body.attendancePolicy.standardStartTime) || !isTimeValue(body.attendancePolicy.standardEndTime)) return "Invalid attendance policy time";
    if ((body.attendancePolicy.standardEndTime ?? "") <= (body.attendancePolicy.standardStartTime ?? "")) return "Standard end time must be after start time";
    if (!isNonNegativeNumber(body.attendancePolicy.lateGraceMinutes) || !isNonNegativeNumber(body.attendancePolicy.earlyLeaveGraceMinutes)) return "Invalid grace minutes";
    if (!isPositiveNumber(body.attendancePolicy.overtimeAfterHours)) return "Invalid overtime threshold";
  }
  if (body.leavePolicy && !isNonNegativeNumber(body.leavePolicy.defaultAnnualLeaveDays)) return "Invalid annual leave days";
  if (body.workSchedules?.some((schedule) => !isTimeValue(schedule.startTime) || !isTimeValue(schedule.morningEndTime) || !isTimeValue(schedule.afternoonStartTime) || !isTimeValue(schedule.endTime) || !(schedule.startTime < schedule.morningEndTime && schedule.morningEndTime <= schedule.afternoonStartTime && schedule.afternoonStartTime < schedule.endTime) || !Array.isArray(schedule.workDays))) return "Invalid work schedule";
  if (body.holidays?.some((holiday) => !holiday.name?.trim() || !holiday.startDate || !holiday.endDate || holiday.endDate < holiday.startDate)) return "Invalid holiday";
  if (body.payrollExport && body.payrollExport.defaultFormat !== "excel" && body.payrollExport.defaultFormat !== "pdf") return "Invalid payroll export format";
  if (body.security && (!isPositiveNumber(body.security.minPasswordLength) || body.security.minPasswordLength < 6 || !isPositiveNumber(body.security.sessionTimeoutMinutes) || body.security.sessionTimeoutMinutes < 15)) return "Invalid security settings";
  if (body.audit && (!isPositiveNumber(body.audit.retentionDays) || body.audit.retentionDays < 30)) return "Invalid audit retention";
  return "";
}

function updateSystemSettings(target: SystemSettings, body: Partial<SystemSettings>) {
  if (body.attendancePolicy) target.attendancePolicy = { ...target.attendancePolicy, ...body.attendancePolicy };
  if (body.leavePolicy) target.leavePolicy = { ...target.leavePolicy, ...body.leavePolicy };
  if (body.workSchedules) target.workSchedules = body.workSchedules.map((schedule) => ({ ...schedule, breakMinutes: Math.max(0, toMinutes(schedule.afternoonStartTime) - toMinutes(schedule.morningEndTime)), workDays: schedule.workDays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6) }));
  if (body.holidays) target.holidays = body.holidays;
  if (body.roles) target.roles = { ...target.roles, ...body.roles };
  if (body.notifications) target.notifications = { ...target.notifications, ...body.notifications };
  if (body.payrollExport) target.payrollExport = { ...target.payrollExport, ...body.payrollExport };
  if (body.security) target.security = { ...target.security, ...body.security, minPasswordLength: Math.max(6, Math.floor(body.security.minPasswordLength)), sessionTimeoutMinutes: Math.max(15, Math.floor(body.security.sessionTimeoutMinutes)) };
  if (body.integrations) target.integrations = { ...target.integrations, ...body.integrations };
  if (body.audit) target.audit = { ...target.audit, ...body.audit, retentionDays: Math.max(30, Math.floor(body.audit.retentionDays)) };
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

async function handleQuickAttendance(request: IncomingMessage, response: ServerResponse, action: "check-in" | "check-out") {
  const body = await readJsonBody<{ employeeId?: string; phoneLast4?: string; pin?: string }>(request);
  const employeeId = body.employeeId?.trim() ?? "";
  const phoneLast4 = body.phoneLast4?.trim() ?? "";
  const pin = body.pin?.trim() ?? "";
  if (!employeeId || !/^\d{4}$/.test(phoneLast4) || !/^\d{4,6}$/.test(pin)) { sendJson(response, 400, { success: false, error: "Enter exactly 4 phone digits and a 4-6 digit PIN" }); return; }

  const ipAddress = getRequestIp(request);
  const rateKey = `${employeeId}:${ipAddress}`;
  const now = Date.now();
  const attempt = quickAttendanceAttempts.get(rateKey);
  if (attempt?.blockedUntil && attempt.blockedUntil > now) { await addQuickAttendanceAudit(employeeId, action, request, false); sendJson(response, 429, { success: false, error: "Too many attempts. Please try again later" }); return; }

  const employee = await prisma.user.findUnique({ where: { id: employeeId } });
  const normalizedPhone = employee?.phone?.replace(/\D/g, "") ?? "";
  const credentialsValid = Boolean(employee && !employee.locked && employee.employmentStatus === "ACTIVE" && employee.pinHash && normalizedPhone.slice(-4) === phoneLast4 && verifyPin(pin, employee.pinHash));
  if (!credentialsValid || !employee) { recordQuickAttendanceFailure(rateKey, now); await addQuickAttendanceAudit(employeeId, action, request, false); sendJson(response, 401, { success: false, error: "Attendance verification details are incorrect" }); return; }

  quickAttendanceAttempts.delete(rateKey);
  if (action === "check-in") {
    const scheduleError = getCheckInRestriction(new Date(), employee);
    if (scheduleError) { await addQuickAttendanceAudit(employee.id, action, request, false); sendJson(response, 409, { success: false, error: scheduleError }); return; }
    const currentSession = await prisma.attendanceSession.findUnique({ where: { employeeId: employee.id } });
    if (currentSession) { await addQuickAttendanceAudit(employee.id, action, request, false); sendJson(response, 409, { success: false, error: "Active attendance session already exists" }); return; }
    const checkInAt = new Date();
    await prisma.attendanceSession.create({ data: { id: randomUUID(), employeeId: employee.id, checkInAt, device: request.headers["user-agent"] ?? "Browser device", ipAddress, location: "Quick check-in station" } });
    await addQuickAttendanceAudit(employee.id, action, request, true);
    sendJson(response, 201, { success: true, message: "Checked in successfully", data: { employeeId: employee.id, employeeName: employee.name, action, occurredAt: checkInAt.toISOString() } });
    return;
  }

  const session = await prisma.attendanceSession.findUnique({ where: { employeeId: employee.id } });
  if (!session) { await addQuickAttendanceAudit(employee.id, action, request, false); sendJson(response, 409, { success: false, error: "No active attendance session" }); return; }
  const checkOutAt = new Date();
  const attendance = calculateAttendance(session.checkInAt, checkOutAt, systemSettings);
  await prisma.$transaction([
    prisma.attendanceLog.create({ data: { id: randomUUID(), employeeId: employee.id, managerId: employee.managerId, workDate: dateOnlyValue(attendance.workDate), checkInAt: session.checkInAt, checkOutAt, totalMinutes: attendance.totalMinutes, overtimeMinutes: attendance.overtimeMinutes, status: attendance.status, adjustmentStatus: "NONE", payrollLocked: false } }),
    prisma.attendanceSession.delete({ where: { employeeId: employee.id } })
  ]);
  await addQuickAttendanceAudit(employee.id, action, request, true);
  sendJson(response, 200, { success: true, message: "Checked out successfully", data: { employeeId: employee.id, employeeName: employee.name, action, occurredAt: checkOutAt.toISOString() } });
}
function recordQuickAttendanceFailure(key: string, now: number) {
  const current = quickAttendanceAttempts.get(key);
  const failures = !current || now - current.windowStartedAt >= quickAttendanceWindowMs ? 1 : current.failures + 1;
  quickAttendanceAttempts.set(key, {
    failures,
    windowStartedAt: !current || now - current.windowStartedAt >= quickAttendanceWindowMs ? now : current.windowStartedAt,
    blockedUntil: failures >= quickAttendanceMaxFailures ? now + quickAttendanceWindowMs : 0
  });
}

async function addQuickAttendanceAudit(employeeId: string, action: "check-in" | "check-out", request: IncomingMessage, success: boolean) {
  await prisma.auditLog.create({ data: { id: randomUUID(), actorId: employeeId || "unknown", action: action === "check-in" ? "QUICK_CHECK_IN" : "QUICK_CHECK_OUT", targetId: employeeId || "unknown", ipAddress: getRequestIp(request), userAgent: request.headers["user-agent"] ?? "Unknown", success } });
}

function databaseRoleToApiRole(role: string): UserRole {
  return ({ EMPLOYEE: "Employee", MANAGER: "Manager", HR: "HR", PAYROLL: "Payroll", ADMIN: "Admin" } as Record<string, UserRole>)[role] ?? "Employee";
}
function getRequestIp(request: IncomingMessage) {
  const forwarded = request.headers["x-forwarded-for"];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0])?.trim() || request.socket.remoteAddress || "Unknown";
}
async function requireUser(request: IncomingMessage, response: ServerResponse) {
  const token = getBearerToken(request);
  const user = token ? await getUserByToken(token) : null;

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

function setCorsHeaders(response: ServerResponse, request?: IncomingMessage) {
  const requestOrigin = request?.headers.origin;
  const origin = requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0] ?? "http://localhost:5173";
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
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



function getCheckInRestriction(now: Date, _user: object) {
  const local = getLocalDateContext(now);
  if (systemSettings.holidays.some((holiday) => local.isoDate >= holiday.startDate && local.isoDate <= holiday.endDate)) return "Check-in is unavailable on a holiday";
  const schedule = systemSettings.workSchedules[0];
  if (!schedule || !schedule.workDays.includes(local.dayOfWeek)) return "Today is not a scheduled workday";
  const startMinutes = toMinutes(schedule.startTime);
  const endMinutes = toMinutes(schedule.endTime);
  if (local.minutes < startMinutes) return `Check-in opens at ${schedule.startTime}`;
  if (local.minutes > endMinutes) return `Check-in is closed after ${schedule.endTime}`;
  return "";
}
function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
