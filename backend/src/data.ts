import type { AttendanceLog, AttendanceSession, AuditLog, User } from "./types.js";

export const users: User[] = [
  {
    id: "u-employee",
    name: "Đạt",
    email: "alex@workforce.local",
    role: "Employee",
    subtitle: "Employee",
    remainingLeaveDays: 14,
    locked: false
  },
  {
    id: "u-team",
    name: "Linh",
    email: "linh@workforce.local",
    role: "Employee",
    subtitle: "Operations",
    remainingLeaveDays: 11,
    locked: false
  },
  {
    id: "u-manager",
    name: "Morgan",
    email: "manager@workforce.local",
    role: "Manager",
    subtitle: "Team Manager",
    remainingLeaveDays: 10,
    locked: false
  },
  {
    id: "u-hr",
    name: "Taylor",
    email: "hr@workforce.local",
    role: "HR",
    subtitle: "People Operations",
    remainingLeaveDays: 12,
    locked: false
  },
  {
    id: "u-payroll",
    name: "Jordan",
    email: "payroll@workforce.local",
    role: "Payroll",
    subtitle: "Payroll Specialist",
    remainingLeaveDays: 9,
    locked: false
  },
  {
    id: "u-admin",
    name: "Alex",
    email: "admin@workforce.local",
    role: "Admin",
    subtitle: "Enterprise Admin",
    remainingLeaveDays: 14,
    locked: false
  }
];

const today = new Date();
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export const attendanceLogs: AttendanceLog[] = [
  {
    id: "log-1",
    employeeId: "u-employee",
    employeeName: "Đạt",
    department: "Product",
    managerId: "u-manager",
    workDate: isoDate(today),
    date: formatLogDate(today),
    checkIn: "08:25 AM",
    checkOut: "05:05 PM",
    totalHours: "8h 40m",
    overtime: "0h 40m",
    status: "On Time",
    adjustmentStatus: "None",
    payrollLocked: false
  },
  {
    id: "log-5",
    employeeId: "u-team",
    employeeName: "Linh",
    department: "Operations",
    managerId: "u-manager",
    workDate: isoDate(today),
    date: formatLogDate(today),
    checkIn: "08:10 AM",
    checkOut: "04:20 PM",
    totalHours: "8h 10m",
    overtime: "0h 10m",
    status: "Early Leave",
    adjustmentStatus: "Pending",
    payrollLocked: false
  },
  {
    id: "log-2",
    employeeId: "u-manager",
    employeeName: "Morgan",
    department: "Operations",
    managerId: "u-admin",
    workDate: isoDate(addDays(today, -1)),
    date: formatLogDate(addDays(today, -1)),
    checkIn: "08:45 AM",
    checkOut: "05:15 PM",
    totalHours: "8h 30m",
    overtime: "0h 30m",
    status: "Late",
    adjustmentStatus: "Pending",
    payrollLocked: false
  },
  {
    id: "log-3",
    employeeId: "u-hr",
    employeeName: "Taylor",
    department: "People",
    managerId: "u-admin",
    workDate: isoDate(addDays(today, -2)),
    date: formatLogDate(addDays(today, -2)),
    checkIn: "08:30 AM",
    checkOut: "05:00 PM",
    totalHours: "8h 30m",
    overtime: "0h 30m",
    status: "On Time",
    adjustmentStatus: "Approved",
    payrollLocked: true
  },
  {
    id: "log-4",
    employeeId: "u-payroll",
    employeeName: "Jordan",
    department: "Finance",
    managerId: "u-admin",
    workDate: isoDate(addDays(today, -3)),
    date: formatLogDate(addDays(today, -3)),
    checkIn: "--",
    checkOut: "--",
    totalHours: "0h 0m",
    overtime: "0h 0m",
    status: "On Leave",
    adjustmentStatus: "None",
    payrollLocked: true
  }
];

export const activeAttendanceSessions = new Map<string, AttendanceSession>();
export const auditLogs: AuditLog[] = [];

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatLogDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    weekday: "short"
  });
}
