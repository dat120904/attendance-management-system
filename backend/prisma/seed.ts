import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient, type UserRole } from "@prisma/client";

const prisma = new PrismaClient();

const dateOnly = (value: string) => new Date(value + "T00:00:00.000Z");
const hashSecret = (value: string) => {
  const salt = randomBytes(16).toString("hex");
  return "scrypt:" + salt + ":" + scryptSync(value, salt, 64).toString("hex");
};

const permissions: Record<UserRole, string[]> = {
  EMPLOYEE: ["profile:view", "attendance:self", "leave:create", "notification:self"],
  MANAGER: ["team:view", "leave:approve-manager", "notification:team"],
  HR: ["attendance:policy", "leave:policy", "holidays:manage", "employees:manage"],
  PAYROLL: ["payroll:period", "payroll:export", "payroll:lock"],
  ADMIN: ["settings:all", "roles:manage", "security:manage", "audit:view", "integrations:manage"]
};

async function upsertUser(data: {
  id: string;
  email: string;
  name: string;
  employeeCode: string;
  phone: string;
  role: UserRole;
  subtitle: string;
  department: string;
  position: string;
  managerId: string | null;
  hireDate: string;
  attendancePolicy: string;
  leavePolicy: string;
  remainingLeaveDays: number;
}) {
  const { id, ...fields } = data;
  const userFields = { ...fields, hireDate: dateOnly(fields.hireDate) };
  return prisma.user.upsert({
    where: { id },
    update: userFields,
    create: {
      ...userFields,
      id,
      pinHash: hashSecret("1234"),
      passwordHash: hashSecret("password"),
      employmentStatus: "ACTIVE",
      locked: false
    }
  });
}

async function main() {
  await upsertUser({
    id: "u-admin", email: "admin@workforce.local", name: "Alex", employeeCode: "ADM-001",
    phone: "0901000006", role: "ADMIN", subtitle: "Enterprise Admin", department: "Administration",
    position: "Enterprise Admin", managerId: null, hireDate: "2022-01-10",
    attendancePolicy: "Office + remote", leavePolicy: "Annual 14 days", remainingLeaveDays: 14
  });
  await upsertUser({
    id: "u-manager", email: "manager@workforce.local", name: "Morgan", employeeCode: "MGR-001",
    phone: "0901000003", role: "MANAGER", subtitle: "Team Manager", department: "Operations",
    position: "Operations Manager", managerId: "u-admin", hireDate: "2023-11-02",
    attendancePolicy: "Office + remote", leavePolicy: "Annual 12 days", remainingLeaveDays: 10
  });
  await upsertUser({
    id: "u-employee", email: "alex@workforce.local", name: "Dat", employeeCode: "EMP-001",
    phone: "0901000001", role: "EMPLOYEE", subtitle: "Employee", department: "Product",
    position: "Product Designer", managerId: "u-manager", hireDate: "2024-03-12",
    attendancePolicy: "Office check-in", leavePolicy: "Annual 14 days", remainingLeaveDays: 14
  });

  await upsertUser({
    id: "u-hr", email: "hr@workforce.local", name: "Taylor", employeeCode: "HR-001",
    phone: "0901000004", role: "HR", subtitle: "People Operations", department: "People",
    position: "HR Specialist", managerId: "u-admin", hireDate: "2023-08-21",
    attendancePolicy: "Office check-in", leavePolicy: "Annual 12 days", remainingLeaveDays: 12
  });
  await upsertUser({
    id: "u-payroll", email: "payroll@workforce.local", name: "Jordan", employeeCode: "PAY-001",
    phone: "0901000005", role: "PAYROLL", subtitle: "Payroll Specialist", department: "Finance",
    position: "Payroll Specialist", managerId: "u-admin", hireDate: "2023-09-01",
    attendancePolicy: "Office check-in", leavePolicy: "Annual 12 days", remainingLeaveDays: 9
  });

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

  for (const [role, rolePermissions] of Object.entries(permissions) as [UserRole, string[]][]) {
    for (const permission of rolePermissions) {
      await prisma.rolePermission.upsert({
        where: { role_permission: { role, permission } },
        update: {},
        create: { role, permission }
      });
    }
  }

  const articles = [
    { id: "help-faq", title: "Common questions", category: "FAQ" as const, body: "Use the sidebar to open attendance logs, leave requests, payroll summaries and settings based on your role.", allowedRoles: ["EMPLOYEE", "MANAGER", "HR", "PAYROLL", "ADMIN"] as UserRole[] },
    { id: "help-checkin", title: "Check-in and check-out", category: "CHECK_IN" as const, body: "Open Dashboard and use the check-in button. Check out when your session ends.", allowedRoles: ["EMPLOYEE", "MANAGER", "HR", "PAYROLL", "ADMIN"] as UserRole[] },
    { id: "help-leave", title: "Create leave request", category: "LEAVE" as const, body: "Open Leave Requests, choose leave type, dates, reason and attachment if required, then submit.", allowedRoles: ["EMPLOYEE", "MANAGER", "HR", "ADMIN"] as UserRole[] },
    { id: "help-adjustment", title: "Request attendance adjustment", category: "ADJUSTMENT" as const, body: "Open Attendance Logs, select the log and request adjustment if the payroll period is not locked.", allowedRoles: ["EMPLOYEE", "MANAGER", "HR", "ADMIN"] as UserRole[] },
    { id: "help-payroll", title: "Payroll confirmation", category: "PAYROLL" as const, body: "Payroll and Admin review warnings, recalculate, confirm and lock payroll periods.", allowedRoles: ["MANAGER", "HR", "PAYROLL", "ADMIN"] as UserRole[] }
  ];
  for (const article of articles) {
    const { id, ...data } = article;
    await prisma.helpArticle.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  const [userCount, scheduleCount, articleCount] = await Promise.all([
    prisma.user.count(),
    prisma.workSchedule.count(),
    prisma.helpArticle.count()
  ]);
  console.log("Bootstrap complete: " + userCount + " users, " + scheduleCount + " schedule, " + articleCount + " help articles.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });