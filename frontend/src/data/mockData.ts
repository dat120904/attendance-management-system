import type { DashboardData, User } from "../types";
import { addDays, formatLogDate, formatSummaryDate, getNextThanksgiving } from "../utils/time";

export const demoUsers: User[] = [
  {
    id: "u-employee",
    name: "Đạt",
    email: "alex@workforce.local",
    role: "Employee",
    subtitle: "Employee",
    remainingLeaveDays: 14
  },
  {
    id: "u-team",
    name: "Linh",
    email: "linh@workforce.local",
    role: "Employee",
    subtitle: "Operations",
    remainingLeaveDays: 11
  },
  {
    id: "u-manager",
    name: "Morgan",
    email: "manager@workforce.local",
    role: "Manager",
    subtitle: "Team Manager",
    remainingLeaveDays: 10
  },
  {
    id: "u-hr",
    name: "Taylor",
    email: "hr@workforce.local",
    role: "HR",
    subtitle: "People Operations",
    remainingLeaveDays: 12
  },
  {
    id: "u-payroll",
    name: "Jordan",
    email: "payroll@workforce.local",
    role: "Payroll",
    subtitle: "Payroll Specialist",
    remainingLeaveDays: 9
  },
  {
    id: "u-admin",
    name: "Đạt",
    email: "admin@workforce.local",
    role: "Admin",
    subtitle: "Enterprise Admin",
    remainingLeaveDays: 14
  }
];

const today = new Date();
const thanksgiving = getNextThanksgiving(today);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export const dashboardData: DashboardData = {
  greeting: "Good morning",
  summaryDate: formatSummaryDate(today, "en-US"),
  checkedInAt: "08:30 AM",
  sessionSeconds: 3 * 60 * 60 + 45 * 60 + 15,
  weeklyHours: 32.5,
  weeklyTarget: 40,
  nextHoliday: {
    name: "Thanksgiving",
    dateRange: thanksgiving.toISOString()
  },
  logs: [
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
  ],
  managerAlerts: ["3 late arrivals this week", "1 missing check-out needs review"],
  payrollReadiness: "92% ready"
};
