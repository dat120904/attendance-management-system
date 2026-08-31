import type { AttendanceLog, User } from "./types";

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
