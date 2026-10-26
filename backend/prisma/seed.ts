import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient, type UserRole, type AttendanceStatus, type AdjustmentStatus, type LeaveType, type LeaveStatus } from "@prisma/client";

const prisma = new PrismaClient();

const dateOnly = (value: string) => new Date(value + "T00:00:00.000Z");
const hashSecret = (value: string) => {
  const salt = randomBytes(16).toString("hex");
  return "scrypt:" + salt + ":" + scryptSync(value, salt, 64).toString("hex");
};

// Precompute hashes once for performance
const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || "password";
const DEFAULT_PIN = process.env.SEED_DEFAULT_PIN || "1234";
const DEFAULT_PASSWORD_HASH = hashSecret(DEFAULT_PASSWORD);
const DEFAULT_PIN_HASH = hashSecret(DEFAULT_PIN);

const permissions: Record<UserRole, string[]> = {
  EMPLOYEE: ["profile:view", "attendance:self", "leave:create", "notification:self"],
  MANAGER: ["team:view", "leave:approve-manager", "notification:team"],
  HR: ["attendance:policy", "leave:policy", "holidays:manage", "employees:manage"],
  PAYROLL: ["payroll:period", "payroll:export", "payroll:lock"],
  ADMIN: ["settings:all", "roles:manage", "security:manage", "audit:view", "integrations:manage"]
};

const INITIAL_USERS = [
  {
    id: "u-admin", email: "admin@workforce.local", name: "Alex", employeeCode: "ADM-001",
    phone: "0901000006", role: "ADMIN" as UserRole, subtitle: "Enterprise Admin", department: "Administration",
    position: "Enterprise Admin", managerId: null, hireDate: "2022-01-10",
    attendancePolicy: "Office + remote", leavePolicy: "Annual 14 days", remainingLeaveDays: 14
  },
  {
    id: "u-manager", email: "manager@workforce.local", name: "Morgan", employeeCode: "MGR-001",
    phone: "0901000003", role: "MANAGER" as UserRole, subtitle: "Team Manager", department: "Operations",
    position: "Operations Manager", managerId: "u-admin", hireDate: "2023-11-02",
    attendancePolicy: "Office + remote", leavePolicy: "Annual 12 days", remainingLeaveDays: 10
  },
  {
    id: "u-employee", email: "alex@workforce.local", name: "Dat", employeeCode: "EMP-001",
    phone: "0901000001", role: "EMPLOYEE" as UserRole, subtitle: "Employee", department: "Product",
    position: "Product Designer", managerId: "u-manager", hireDate: "2024-03-12",
    attendancePolicy: "Office check-in", leavePolicy: "Annual 14 days", remainingLeaveDays: 14
  },
  {
    id: "u-hr", email: "hr@workforce.local", name: "Taylor", employeeCode: "HR-001",
    phone: "0901000004", role: "HR" as UserRole, subtitle: "People Operations", department: "People",
    position: "HR Specialist", managerId: "u-admin", hireDate: "2023-08-21",
    attendancePolicy: "Office check-in", leavePolicy: "Annual 12 days", remainingLeaveDays: 12
  },
  {
    id: "u-payroll", email: "payroll@workforce.local", name: "Jordan", employeeCode: "PAY-001",
    phone: "0901000005", role: "PAYROLL" as UserRole, subtitle: "Payroll Specialist", department: "Finance",
    position: "Payroll Specialist", managerId: "u-admin", hireDate: "2023-09-01",
    attendancePolicy: "Office check-in", leavePolicy: "Annual 12 days", remainingLeaveDays: 9
  }
];

async function main() {
  console.log("Seeding Workforce Pro database...");

  // 1. Upsert users in parallel
  await Promise.all(INITIAL_USERS.map((user) => {
    const { id, ...fields } = user;
    const userFields = { ...fields, hireDate: dateOnly(fields.hireDate) };
    return prisma.user.upsert({
      where: { id },
      update: userFields,
      create: {
        ...userFields,
        id,
        pinHash: DEFAULT_PIN_HASH,
        passwordHash: DEFAULT_PASSWORD_HASH,
        employmentStatus: "ACTIVE",
        locked: false
      }
    });
  }));

  // 2. Settings & Schedules
  await prisma.workSchedule.upsert({
    where: { id: "schedule-standard" },
    update: { name: "Standard work schedule", startTime: "08:30", morningEndTime: "12:00", afternoonStartTime: "13:00", endTime: "17:30", breakMinutes: 60, workDays: [1, 2, 3, 4, 5] },
    create: { id: "schedule-standard", name: "Standard work schedule", startTime: "08:30", morningEndTime: "12:00", afternoonStartTime: "13:00", endTime: "17:30", breakMinutes: 60, workDays: [1, 2, 3, 4, 5] }
  });

  await prisma.leaveWorkflowConfig.upsert({
    where: { id: "default" },
    update: { requireHrApproval: true, annualLeaveRequiresBalance: true, allowEmployeeCancelBeforeManager: true, attachmentRequiredForSickLeave: false, defaultAnnualLeaveDays: 12 },
    create: { id: "default", requireHrApproval: true, annualLeaveRequiresBalance: true, allowEmployeeCancelBeforeManager: true, attachmentRequiredForSickLeave: false, defaultAnnualLeaveDays: 12 }
  });

  await prisma.systemSetting.upsert({
    where: { id: "default" },
    update: { standardStartTime: "08:30", standardEndTime: "17:30", lateGraceMinutes: 10, earlyLeaveGraceMinutes: 10, overtimeAfterHours: 8, requireLocation: true, defaultAnnualLeaveDays: 12, attachmentRequiredForSickLeave: false, requireHrApproval: true, blockAnnualLeaveOverBalance: true, inAppEnabled: true, emailEnabled: true, managerDigestEnabled: true, payrollReminderEnabled: true, defaultPayrollExportFormat: "excel", includePayrollWarnings: true, lockRequiresResolvedLogs: true, minPasswordLength: 6, sessionTimeoutMinutes: 480, allowSelfRegistration: true, requireTwoFactor: false, calendarProvider: "Google Calendar", payrollProvider: "Internal payroll", webhookUrl: "", auditEnabled: true, auditRetentionDays: 365 },
    create: { id: "default", standardStartTime: "08:30", standardEndTime: "17:30", lateGraceMinutes: 10, earlyLeaveGraceMinutes: 10, overtimeAfterHours: 8, requireLocation: true, defaultAnnualLeaveDays: 12, attachmentRequiredForSickLeave: false, requireHrApproval: true, blockAnnualLeaveOverBalance: true, inAppEnabled: true, emailEnabled: true, managerDigestEnabled: true, payrollReminderEnabled: true, defaultPayrollExportFormat: "excel", includePayrollWarnings: true, lockRequiresResolvedLogs: true, minPasswordLength: 6, sessionTimeoutMinutes: 480, allowSelfRegistration: true, requireTwoFactor: false, calendarProvider: "Google Calendar", payrollProvider: "Internal payroll", webhookUrl: "", auditEnabled: true, auditRetentionDays: 365 }
  });

  // 3. Permissions in batch
  const permOps = [];
  for (const [role, rolePermissions] of Object.entries(permissions) as [UserRole, string[]][]) {
    for (const permission of rolePermissions) {
      permOps.push(
        prisma.rolePermission.upsert({
          where: { role_permission: { role, permission } },
          update: {},
          create: { role, permission }
        })
      );
    }
  }
  await Promise.all(permOps);

  // 4. Help Articles
  const articles = [
    { id: "help-faq", title: "Common questions", category: "FAQ" as const, body: "Use the sidebar to open attendance logs, leave requests, payroll summaries and settings based on your role.", allowedRoles: ["EMPLOYEE", "MANAGER", "HR", "PAYROLL", "ADMIN"] as UserRole[] },
    { id: "help-checkin", title: "Check-in and check-out", category: "CHECK_IN" as const, body: "Open Dashboard and use the check-in button. Check out when your session ends.", allowedRoles: ["EMPLOYEE", "MANAGER", "HR", "PAYROLL", "ADMIN"] as UserRole[] },
    { id: "help-leave", title: "Create leave request", category: "LEAVE" as const, body: "Open Leave Requests, choose leave type, dates, reason and attachment if required, then submit.", allowedRoles: ["EMPLOYEE", "MANAGER", "HR", "ADMIN"] as UserRole[] },
    { id: "help-adjustment", title: "Request attendance adjustment", category: "ADJUSTMENT" as const, body: "Open Attendance Logs, select the log and request adjustment if the payroll period is not locked.", allowedRoles: ["EMPLOYEE", "MANAGER", "HR", "ADMIN"] as UserRole[] },
    { id: "help-payroll", title: "Payroll confirmation", category: "PAYROLL" as const, body: "Payroll and Admin review warnings, recalculate, confirm and lock payroll periods.", allowedRoles: ["MANAGER", "HR", "PAYROLL", "ADMIN"] as UserRole[] }
  ];
  await Promise.all(articles.map((article) => {
    const { id, ...data } = article;
    return prisma.helpArticle.upsert({ where: { id }, update: data, create: { id, ...data } });
  }));

  // 5. Realistic Attendance Demo Logs
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yesterday = new Date(today.getTime() - 86400000);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const DEMO_LOGS = [
    {
      id: "log-demo-1", employeeId: "u-employee", managerId: "u-manager",
      workDate: dateOnly(todayStr),
      checkInAt: new Date(todayStr + "T08:24:00.000Z"),
      checkOutAt: new Date(todayStr + "T17:32:00.000Z"),
      totalMinutes: 488, overtimeMinutes: 0,
      status: "ON_TIME" as AttendanceStatus, adjustmentStatus: "NONE" as AdjustmentStatus
    },
    {
      id: "log-demo-2", employeeId: "u-admin", managerId: null,
      workDate: dateOnly(todayStr),
      checkInAt: new Date(todayStr + "T08:12:00.000Z"),
      checkOutAt: new Date(todayStr + "T17:45:00.000Z"),
      totalMinutes: 513, overtimeMinutes: 15,
      status: "ON_TIME" as AttendanceStatus, adjustmentStatus: "NONE" as AdjustmentStatus
    },
    {
      id: "log-demo-3", employeeId: "u-manager", managerId: "u-admin",
      workDate: dateOnly(todayStr),
      checkInAt: new Date(todayStr + "T08:48:00.000Z"),
      checkOutAt: new Date(todayStr + "T17:35:00.000Z"),
      totalMinutes: 467, overtimeMinutes: 0,
      status: "LATE" as AttendanceStatus, adjustmentStatus: "NONE" as AdjustmentStatus
    },
    {
      id: "log-demo-4", employeeId: "u-hr", managerId: "u-admin",
      workDate: dateOnly(yesterdayStr),
      checkInAt: new Date(yesterdayStr + "T08:28:00.000Z"),
      checkOutAt: null,
      totalMinutes: 0, overtimeMinutes: 0,
      status: "MISSING_CHECK_OUT" as AttendanceStatus, adjustmentStatus: "NONE" as AdjustmentStatus
    },
    {
      id: "log-demo-5", employeeId: "u-payroll", managerId: "u-admin",
      workDate: dateOnly(todayStr),
      checkInAt: new Date(todayStr + "T08:29:00.000Z"),
      checkOutAt: new Date(todayStr + "T17:30:00.000Z"),
      totalMinutes: 481, overtimeMinutes: 0,
      status: "ON_TIME" as AttendanceStatus, adjustmentStatus: "NONE" as AdjustmentStatus
    }
  ];

  await Promise.all(DEMO_LOGS.map((log) => {
    return prisma.attendanceLog.upsert({
      where: { id: log.id },
      update: log,
      create: log
    });
  }));

  // 6. Demo Leave Requests
  await prisma.leaveRequest.upsert({
    where: { id: "leave-demo-1" },
    update: {},
    create: {
      id: "leave-demo-1",
      employeeId: "u-employee",
      managerId: "u-manager",
      type: "ANNUAL" as LeaveType,
      startDate: dateOnly("2026-11-02"),
      endDate: dateOnly("2026-11-03"),
      days: 2,
      reason: "Family personal event",
      status: "PENDING_MANAGER" as LeaveStatus
    }
  });

  const [userCount, scheduleCount, articleCount, logCount] = await Promise.all([
    prisma.user.count(),
    prisma.workSchedule.count(),
    prisma.helpArticle.count(),
    prisma.attendanceLog.count()
  ]);

  console.log(`Bootstrap complete: ${userCount} users, ${scheduleCount} schedule, ${articleCount} help articles, ${logCount} attendance logs.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });