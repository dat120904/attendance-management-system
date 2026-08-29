import type { AttendanceLog, User } from "./types.js";

export const users: User[] = [
  {
    id: "u-employee",
    name: "Alex",
    email: "alex@workforce.local",
    role: "Employee",
    subtitle: "Employee",
    remainingLeaveDays: 14,
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

export const attendanceLogs: AttendanceLog[] = [
  {
    id: "log-1",
    employeeId: "u-admin",
    date: "Oct 25, Wed",
    checkIn: "08:25 AM",
    checkOut: "05:05 PM",
    totalHours: "8h 40m",
    status: "On Time"
  },
  {
    id: "log-2",
    employeeId: "u-admin",
    date: "Oct 24, Tue",
    checkIn: "08:45 AM",
    checkOut: "05:15 PM",
    totalHours: "8h 30m",
    status: "Late"
  },
  {
    id: "log-3",
    employeeId: "u-admin",
    date: "Oct 23, Mon",
    checkIn: "08:30 AM",
    checkOut: "05:00 PM",
    totalHours: "8h 30m",
    status: "On Time"
  },
  {
    id: "log-4",
    employeeId: "u-admin",
    date: "Oct 20, Fri",
    checkIn: "--",
    checkOut: "--",
    totalHours: "0h 0m",
    status: "On Leave"
  }
];
