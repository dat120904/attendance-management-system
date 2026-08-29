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
  date: string;
  checkIn: string;
  checkOut: string;
  totalHours: string;
  status: "On Time" | "Late" | "On Leave";
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
