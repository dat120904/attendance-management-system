import type { AppPage, User } from "../types";

const pagesByRole: Record<User["role"], readonly AppPage[]> = {
  Employee: ["dashboard", "attendanceLogs", "leaveRequests", "helpCenter", "profile"],
  Manager: ["dashboard", "attendanceLogs", "leaveRequests", "payrollSummaries", "employeeManagement", "helpCenter", "profile"],
  HR: ["dashboard", "attendanceLogs", "leaveRequests", "payrollSummaries", "employeeManagement", "settings", "helpCenter", "profile"],
  Payroll: ["dashboard", "attendanceLogs", "leaveRequests", "payrollSummaries", "employeeManagement", "settings", "helpCenter", "profile"],
  Admin: ["dashboard", "attendanceLogs", "leaveRequests", "payrollSummaries", "employeeManagement", "settings", "helpCenter", "profile"]
};

export function canAccessPage(role: User["role"], page: AppPage) {
  return pagesByRole[role].includes(page);
}