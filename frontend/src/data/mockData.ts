import type { DashboardData, User } from "../types";

export const demoUsers: User[] = [
  {
    id: "u-employee",
    name: "Alex",
    email: "alex@workforce.local",
    role: "Employee",
    subtitle: "Enterprise Admin",
    remainingLeaveDays: 14
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
    name: "Alex",
    email: "admin@workforce.local",
    role: "Admin",
    subtitle: "Enterprise Admin",
    remainingLeaveDays: 14
  }
];

export const dashboardData: DashboardData = {
  greeting: "Good morning",
  summaryDate: "Thursday, October 26th",
  checkedInAt: "08:30 AM",
  sessionSeconds: 3 * 60 * 60 + 45 * 60 + 15,
  weeklyHours: 32.5,
  weeklyTarget: 40,
  nextHoliday: {
    name: "Thanksgiving",
    dateRange: "Nov 23 - Nov 24"
  },
  logs: [
    {
      id: "log-1",
      date: "Oct 25, Wed",
      checkIn: "08:25 AM",
      checkOut: "05:05 PM",
      totalHours: "8h 40m",
      status: "On Time"
    },
    {
      id: "log-2",
      date: "Oct 24, Tue",
      checkIn: "08:45 AM",
      checkOut: "05:15 PM",
      totalHours: "8h 30m",
      status: "Late"
    },
    {
      id: "log-3",
      date: "Oct 23, Mon",
      checkIn: "08:30 AM",
      checkOut: "05:00 PM",
      totalHours: "8h 30m",
      status: "On Time"
    },
    {
      id: "log-4",
      date: "Oct 20, Fri",
      checkIn: "--",
      checkOut: "--",
      totalHours: "0h 0m",
      status: "On Leave"
    }
  ],
  managerAlerts: ["3 late arrivals this week", "1 missing check-out needs review"],
  payrollReadiness: "92% ready"
};
