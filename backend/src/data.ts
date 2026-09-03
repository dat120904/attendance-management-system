import type { AttendanceLog, AttendanceSession, AuditLog, LeaveRequest, LeaveWorkflowConfig, PayrollPeriod, User } from "./types.js";

export const users: User[] = [
  {
    id: "u-employee",
    name: "Đạt",
    email: "alex@workforce.local",
    role: "Employee",
    subtitle: "Employee",
    employeeCode: "EMP-001",
    phone: "0901000001",
    position: "Product Designer",
    managerId: "u-manager",
    hireDate: "2024-03-12",
    employmentStatus: "Active",
    schedulePolicy: "Standard 8h",
    attendancePolicy: "Office check-in",
    leavePolicy: "Annual 14 days",
    remainingLeaveDays: 14,
    locked: false
  },
  {
    id: "u-team",
    name: "Linh",
    email: "linh@workforce.local",
    role: "Employee",
    subtitle: "Operations",
    employeeCode: "EMP-002",
    phone: "0901000002",
    position: "Operations Associate",
    managerId: "u-manager",
    hireDate: "2024-06-18",
    employmentStatus: "Active",
    schedulePolicy: "Standard 8h",
    attendancePolicy: "Office check-in",
    leavePolicy: "Annual 12 days",
    remainingLeaveDays: 11,
    locked: false
  },
  {
    id: "u-manager",
    name: "Morgan",
    email: "manager@workforce.local",
    role: "Manager",
    subtitle: "Team Manager",
    employeeCode: "MGR-001",
    phone: "0901000003",
    position: "Operations Manager",
    managerId: "u-admin",
    hireDate: "2023-11-02",
    employmentStatus: "Active",
    schedulePolicy: "Manager flexible",
    attendancePolicy: "Office + remote",
    leavePolicy: "Annual 12 days",
    remainingLeaveDays: 10,
    locked: false
  },
  {
    id: "u-hr",
    name: "Taylor",
    email: "hr@workforce.local",
    role: "HR",
    subtitle: "People Operations",
    employeeCode: "HR-001",
    phone: "0901000004",
    position: "HR Specialist",
    managerId: "u-admin",
    hireDate: "2023-08-21",
    employmentStatus: "Active",
    schedulePolicy: "Standard 8h",
    attendancePolicy: "Office check-in",
    leavePolicy: "Annual 12 days",
    remainingLeaveDays: 12,
    locked: false
  },
  {
    id: "u-payroll",
    name: "Jordan",
    email: "payroll@workforce.local",
    role: "Payroll",
    subtitle: "Payroll Specialist",
    employeeCode: "PAY-001",
    phone: "0901000005",
    position: "Payroll Specialist",
    managerId: "u-admin",
    hireDate: "2023-09-01",
    employmentStatus: "Active",
    schedulePolicy: "Payroll cycle",
    attendancePolicy: "Office check-in",
    leavePolicy: "Annual 12 days",
    remainingLeaveDays: 9,
    locked: false
  },
  {
    id: "u-admin",
    name: "Alex",
    email: "admin@workforce.local",
    role: "Admin",
    subtitle: "Enterprise Admin",
    employeeCode: "ADM-001",
    phone: "0901000006",
    position: "Enterprise Admin",
    managerId: "",
    hireDate: "2022-01-10",
    employmentStatus: "Active",
    schedulePolicy: "Admin flexible",
    attendancePolicy: "Office + remote",
    leavePolicy: "Annual 14 days",
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
export const payrollPeriods: PayrollPeriod[] = [];

export const leaveWorkflowConfig: LeaveWorkflowConfig = {
  requireHrApproval: true,
  annualLeaveRequiresBalance: true,
  allowEmployeeCancelBeforeManager: true,
  attachmentRequiredForSickLeave: false,
  defaultAnnualLeaveDays: 12
};

export const leaveRequests: LeaveRequest[] = [
  {
    id: "leave-demo-review",
    employeeId: "u-employee",
    employeeName: "Đạt",
    department: "Product",
    managerId: "u-manager",
    type: "Annual Leave",
    startDate: isoDate(addDays(today, 9)),
    endDate: isoDate(addDays(today, 10)),
    days: 2,
    reason: "Demo request for review",
    attachmentName: "leave-demo.pdf",
    status: "Pending Manager",
    createdAt: today.toISOString()
  },
  {
    id: "leave-1",
    employeeId: "u-employee",
    employeeName: "Đạt",
    department: "Product",
    managerId: "u-manager",
    type: "Annual Leave",
    startDate: isoDate(addDays(today, 3)),
    endDate: isoDate(addDays(today, 4)),
    days: 2,
    reason: "Family trip",
    attachmentName: "",
    status: "Pending Manager",
    createdAt: today.toISOString()
  },
  {
    id: "leave-2",
    employeeId: "u-team",
    employeeName: "Linh",
    department: "Operations",
    managerId: "u-manager",
    type: "Sick Leave",
    startDate: isoDate(addDays(today, 1)),
    endDate: isoDate(addDays(today, 1)),
    days: 1,
    reason: "Medical appointment",
    attachmentName: "medical-note.pdf",
    status: "Pending HR",
    createdAt: addDays(today, -1).toISOString()
  },
  {
    id: "leave-3",
    employeeId: "u-payroll",
    employeeName: "Jordan",
    department: "Finance",
    managerId: "u-admin",
    type: "Unpaid Leave",
    startDate: isoDate(addDays(today, -3)),
    endDate: isoDate(addDays(today, -3)),
    days: 1,
    reason: "Personal matter",
    attachmentName: "",
    status: "Approved",
    createdAt: addDays(today, -5).toISOString()
  }
];

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
