import type { AppNotification, AttendanceLog, HelpArticle, LeaveAttachment, LeaveRequest, LeaveType, LeaveWorkflowConfig, PayrollPeriod, SupportTicket, SystemSettings, User } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

type LoginResponse = {
  token: string;
  user: User;
};

type LogsResponse = {
  logs: AttendanceLog[];
};

type LogResponse = {
  log: AttendanceLog;
};

type LeaveRequestsResponse = {
  requests: LeaveRequest[];
};

type LeaveRequestResponse = {
  request: LeaveRequest;
  attendanceLog?: AttendanceLog;
  attendanceLogs?: AttendanceLog[];
  employeeRemainingLeaveDays?: number;
};

type LeaveWorkflowResponse = {
  workflow: LeaveWorkflowConfig;
};

type PayrollPeriodsResponse = {
  periods: PayrollPeriod[];
};

type PayrollPeriodResponse = {
  period: PayrollPeriod;
};

type EmployeesResponse = {
  users: User[];
};

type EmployeeResponse = {
  user: User;
};

type EmployeeImportResponse = {
  users: User[];
  errors: string[];
};

type SettingsResponse = {
  settings: SystemSettings;
};

type NotificationsResponse = {
  notifications: AppNotification[];
};

type NotificationResponse = {
  notification: AppNotification;
};

type HelpArticlesResponse = {
  articles: HelpArticle[];
};

type SupportTicketResponse = {
  ticket: SupportTicket;
};

type AuditLogsResponse = {
  auditLogs: Array<{
    id: string;
    actorId: string;
    action: string;
    targetId: string;
    createdAt: string;
  }>;
};

export async function loginWithPassword(email: string, password: string) {
  return request<LoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

export async function registerAccount(form: { name: string; email: string; role: User["role"]; department: string; password: string; confirmPassword: string }) {
  return request<LoginResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(form)
  });
}

export async function fetchAttendanceLogs(token: string, params: { dateRange: string; status: string; query: string }) {
  const search = new URLSearchParams(params);
  return request<LogsResponse>(`/api/attendance/logs?${search.toString()}`, {
    token
  });
}

export async function requestAttendanceAdjustment(token: string, logId: string) {
  return request<LogResponse>(`/api/attendance/logs/${logId}/adjustment`, {
    method: "POST",
    token
  });
}

export async function decideAttendanceAdjustment(token: string, logId: string, decision: "approve" | "reject") {
  return request<LogResponse>(`/api/attendance/logs/${logId}/${decision}`, {
    method: "POST",
    token
  });
}

export async function fetchAuditLogs(token: string) {
  return request<AuditLogsResponse>("/api/audit-logs", {
    token
  });
}

export async function downloadAttendanceExport(token: string, params: { format: "excel" | "pdf"; dateRange: string; status: string; query: string }) {
  const search = new URLSearchParams(params);
  const response = await fetch(`${API_BASE_URL}/api/attendance/export?${search.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return response.blob();
}

export async function fetchLeaveRequests(token: string) {
  return request<LeaveRequestsResponse>("/api/leave-requests", {
    token
  });
}

export async function createLeaveRequest(token: string, form: { type: LeaveType; startDate: string; endDate: string; reason: string; attachmentName: string; attachment?: LeaveAttachment; attachmentFile?: File | null; submitMode?: "draft" | "submit" }) {
  const body = new FormData();
  body.append("type", form.type);
  body.append("startDate", form.startDate);
  body.append("endDate", form.endDate);
  body.append("reason", form.reason);
  body.append("attachmentName", form.attachmentName);
  body.append("submitMode", form.submitMode ?? "submit");
  if (form.attachmentFile) body.append("attachment", form.attachmentFile);

  const response = await fetch(`${API_BASE_URL}/api/leave-requests`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return response.json() as Promise<LeaveRequestResponse>;
}

export async function decideLeaveRequest(token: string, requestId: string, decision: "approve" | "reject") {
  return request<LeaveRequestResponse>(`/api/leave-requests/${requestId}/${decision}`, {
    method: "POST",
    token
  });
}

export async function submitLeaveRequest(token: string, requestId: string) {
  return request<LeaveRequestResponse>(`/api/leave-requests/${requestId}/submit`, {
    method: "POST",
    token
  });
}

export async function cancelLeaveRequest(token: string, requestId: string) {
  return request<LeaveRequestResponse>(`/api/leave-requests/${requestId}/cancel`, {
    method: "POST",
    token
  });
}

export async function downloadLeaveAttachment(token: string, attachmentUrl: string) {
  const response = await fetch(`${API_BASE_URL}${attachmentUrl}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return response.blob();
}

export async function fetchLeaveWorkflow(token: string) {
  return request<LeaveWorkflowResponse>("/api/leave-workflow", { token });
}

export async function updateLeaveWorkflow(token: string, workflow: LeaveWorkflowConfig) {
  return request<LeaveWorkflowResponse>("/api/leave-workflow", {
    method: "PUT",
    token,
    body: JSON.stringify(workflow)
  });
}



export async function fetchEmployees(token: string) {
  return request<EmployeesResponse>("/api/employees", { token });
}

export async function createEmployee(token: string, employee: Partial<User>) {
  return request<EmployeeResponse>("/api/employees", {
    method: "POST",
    token,
    body: JSON.stringify(employee)
  });
}

export async function updateEmployee(token: string, employeeId: string, employee: Partial<User>) {
  return request<EmployeeResponse>("/api/employees/" + employeeId, {
    method: "PUT",
    token,
    body: JSON.stringify(employee)
  });
}

export async function setEmployeeLocked(token: string, employeeId: string, locked: boolean) {
  return request<EmployeeResponse>("/api/employees/" + employeeId + "/lock", {
    method: "POST",
    token,
    body: JSON.stringify({ locked })
  });
}

export async function importEmployees(token: string, rows: string) {
  return request<EmployeeImportResponse>("/api/employees/import", {
    method: "POST",
    token,
    body: JSON.stringify({ rows })
  });
}

export async function downloadEmployeeExport(token: string, format: "excel" | "pdf") {
  const response = await fetch(API_BASE_URL + "/api/employees/export?format=" + format, {
    headers: { Authorization: "Bearer " + token }
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return response.blob();
}

export async function fetchNotifications(token: string) {
  return request<NotificationsResponse>("/api/notifications", { token });
}

export async function markNotificationRead(token: string, notificationId: string) {
  return request<NotificationResponse>("/api/notifications/" + notificationId + "/read", { method: "POST", token });
}

export async function markAllNotificationsRead(token: string) {
  return request<NotificationsResponse>("/api/notifications/read-all", { method: "POST", token });
}

export async function retryNotificationEmail(token: string, notificationId: string) {
  return request<NotificationResponse>("/api/notifications/" + notificationId + "/retry-email", { method: "POST", token });
}

export async function fetchHelpArticles(token: string, query: string) {
  const search = new URLSearchParams({ query });
  return request<HelpArticlesResponse>("/api/help/articles?" + search.toString(), { token });
}

export async function createSupportTicket(token: string, form: { subject: string; message: string }) {
  return request<SupportTicketResponse>("/api/help/support-tickets", { method: "POST", token, body: JSON.stringify(form) });
}

export async function fetchSettings(token: string) {
  return request<SettingsResponse>("/api/settings", { token });
}

export async function updateSettings(token: string, settings: SystemSettings) {
  return request<SettingsResponse>("/api/settings", {
    method: "PUT",
    token,
    body: JSON.stringify(settings)
  });
}

export async function fetchPayrollPeriods(token: string) {
  return request<PayrollPeriodsResponse>("/api/payroll/periods", { token });
}

export async function createPayrollPeriod(token: string, form: { name: string; startDate: string; endDate: string }) {
  return request<PayrollPeriodResponse>("/api/payroll/periods", {
    method: "POST",
    token,
    body: JSON.stringify(form)
  });
}

export async function recalculatePayrollPeriod(token: string, periodId: string) {
  return request<PayrollPeriodResponse>(`/api/payroll/periods/${periodId}/recalculate`, { method: "POST", token });
}

export async function confirmPayrollPeriod(token: string, periodId: string) {
  return request<PayrollPeriodResponse>(`/api/payroll/periods/${periodId}/confirm`, { method: "POST", token });
}

export async function lockPayrollPeriod(token: string, periodId: string) {
  return request<PayrollPeriodResponse>(`/api/payroll/periods/${periodId}/lock`, { method: "POST", token });
}

export async function unlockPayrollPeriod(token: string, periodId: string) {
  return request<PayrollPeriodResponse>(`/api/payroll/periods/${periodId}/unlock`, { method: "POST", token });
}

export async function downloadPayrollExport(token: string, periodId: string, format: "excel" | "pdf") {
  const response = await fetch(`${API_BASE_URL}/api/payroll/periods/${periodId}/export?format=${format}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return response.blob();
}

async function request<T>(path: string, options: RequestInit & { token?: string } = {}) {
  const { token, headers, ...requestOptions } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...requestOptions,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    }
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return response.json() as Promise<T>;
}

async function getErrorMessage(response: Response) {
  try {
    const body = await response.json() as { error?: string; message?: string };
    return body.error ?? body.message ?? `Request failed with status ${response.status}`;
  } catch {
    return `Request failed with status ${response.status}`;
  }
}
