export type UserRole = "Employee" | "Manager" | "HR" | "Payroll" | "Admin";

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  subtitle: string;
  remainingLeaveDays: number;
};

export type AttendanceLog = {
  id: string;
  employeeId?: string;
  employeeName: string;
  department: string;
  managerId?: string;
  workDate: string;
  date: string;
  checkIn: string;
  checkOut: string;
  totalHours: string;
  overtime: string;
  status: "On Time" | "Late" | "Early Leave" | "On Leave" | "Missing Check-out" | "Holiday" | "Weekend" | "Adjusted";
  adjustmentStatus: "None" | "Pending" | "Approved" | "Rejected";
  payrollLocked: boolean;
};

export type AttendanceSessionStatus = "not-started" | "working" | "checked-out" | "missing";

export type AttendanceSession = {
  status: AttendanceSessionStatus;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  elapsedSeconds: number;
  device: string;
  ipAddress: string;
  location: string;
};

export type LeaveType = "Annual Leave" | "Sick Leave" | "Unpaid Leave" | "Compensatory Leave";

export type LeaveAttachment = {
  name: string;
  mimeType: string;
  size: number;
  url?: string;
  storageKey?: string;
  dataUrl?: string;
  uploadedAt: string;
  uploadedBy?: string;
};

export type LeaveWorkflowConfig = {
  requireHrApproval: boolean;
  annualLeaveRequiresBalance: boolean;
  allowEmployeeCancelBeforeManager: boolean;
  attachmentRequiredForSickLeave: boolean;
  defaultAnnualLeaveDays: number;
};

export type LeaveStatus = "Draft" | "Pending Manager" | "Pending HR" | "Approved" | "Rejected" | "Cancelled";

export type LeaveRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  managerId?: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  attachmentName: string;
  attachment?: LeaveAttachment;
  status: LeaveStatus;
  createdAt: string;
};

export type DashboardMetric = {
  label: string;
  value: string;
  suffix?: string;
  helper?: string;
  progress?: number;
  icon: "clock" | "leave" | "holiday" | "warning";
};

export type DashboardData = {
  greeting: string;
  summaryDate: string;
  checkedInAt: string;
  sessionSeconds: number;
  weeklyHours: number;
  weeklyTarget: number;
  nextHoliday: {
    name: string;
    dateRange: string;
  };
  logs: AttendanceLog[];
  managerAlerts: string[];
  payrollReadiness: string;
};

export type AppPage = "dashboard" | "attendanceLogs" | "leaveRequests" | "payrollSummaries" | "settings" | "helpCenter" | "profile";
