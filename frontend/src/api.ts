import type { AttendanceLog, LeaveAttachment, LeaveRequest, LeaveType, LeaveWorkflowConfig, User } from "./types";

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
