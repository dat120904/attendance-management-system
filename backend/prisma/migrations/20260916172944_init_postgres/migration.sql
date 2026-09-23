-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('EMPLOYEE', 'MANAGER', 'HR', 'PAYROLL', 'ADMIN');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'LOCKED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('ON_TIME', 'LATE', 'EARLY_LEAVE', 'ON_LEAVE', 'MISSING_CHECK_OUT', 'HOLIDAY', 'WEEKEND', 'ADJUSTED');

-- CreateEnum
CREATE TYPE "AdjustmentStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'UNPAID', 'COMPENSATORY');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('DRAFT', 'PENDING_MANAGER', 'PENDING_HR', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'LOCKED');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('LEAVE', 'ATTENDANCE', 'CHECKOUT', 'ADJUSTMENT', 'PAYROLL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('NOT_SENT', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "HelpCategory" AS ENUM ('FAQ', 'CHECK_IN', 'LEAVE', 'ADJUSTMENT', 'PAYROLL');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "pinHash" TEXT,
    "name" TEXT NOT NULL,
    "employeeCode" TEXT,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "subtitle" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "position" TEXT,
    "managerId" TEXT,
    "hireDate" DATE,
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "attendancePolicy" TEXT,
    "leavePolicy" TEXT,
    "remainingLeaveDays" DECIMAL(7,2) NOT NULL DEFAULT 12,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "AttendanceSession" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "device" TEXT,
    "ipAddress" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceLog" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "managerId" TEXT,
    "workDate" DATE NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'ON_TIME',
    "adjustmentStatus" "AdjustmentStatus" NOT NULL DEFAULT 'NONE',
    "payrollLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceAdjustment" (
    "id" TEXT NOT NULL,
    "attendanceLogId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "AttendanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "managerId" TEXT,
    "type" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "days" DECIMAL(7,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "attachmentName" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveAttachment" (
    "id" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT,
    "storageKey" TEXT,
    "dataUrl" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT,

    CONSTRAINT "LeaveAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveWorkflowConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "requireHrApproval" BOOLEAN NOT NULL DEFAULT true,
    "annualLeaveRequiresBalance" BOOLEAN NOT NULL DEFAULT true,
    "allowEmployeeCancelBeforeManager" BOOLEAN NOT NULL DEFAULT true,
    "attachmentRequiredForSickLeave" BOOLEAN NOT NULL DEFAULT false,
    "defaultAnnualLeaveDays" DECIMAL(7,2) NOT NULL DEFAULT 12,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveWorkflowConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "morningEndTime" TEXT NOT NULL,
    "afternoonStartTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "workDays" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "standardStartTime" TEXT NOT NULL DEFAULT '08:30',
    "standardEndTime" TEXT NOT NULL DEFAULT '17:30',
    "lateGraceMinutes" INTEGER NOT NULL DEFAULT 10,
    "earlyLeaveGraceMinutes" INTEGER NOT NULL DEFAULT 10,
    "overtimeAfterHours" INTEGER NOT NULL DEFAULT 8,
    "requireLocation" BOOLEAN NOT NULL DEFAULT true,
    "defaultAnnualLeaveDays" DECIMAL(7,2) NOT NULL DEFAULT 12,
    "attachmentRequiredForSickLeave" BOOLEAN NOT NULL DEFAULT false,
    "requireHrApproval" BOOLEAN NOT NULL DEFAULT true,
    "blockAnnualLeaveOverBalance" BOOLEAN NOT NULL DEFAULT true,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "managerDigestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "payrollReminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultPayrollExportFormat" TEXT NOT NULL DEFAULT 'excel',
    "includePayrollWarnings" BOOLEAN NOT NULL DEFAULT true,
    "lockRequiresResolvedLogs" BOOLEAN NOT NULL DEFAULT true,
    "minPasswordLength" INTEGER NOT NULL DEFAULT 6,
    "sessionTimeoutMinutes" INTEGER NOT NULL DEFAULT 480,
    "allowSelfRegistration" BOOLEAN NOT NULL DEFAULT true,
    "requireTwoFactor" BOOLEAN NOT NULL DEFAULT false,
    "calendarProvider" TEXT,
    "payrollProvider" TEXT,
    "webhookUrl" TEXT,
    "auditEnabled" BOOLEAN NOT NULL DEFAULT true,
    "auditRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "unlockedById" TEXT,
    "unlockedAt" TIMESTAMP(3),
    "warnings" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSummaryRow" (
    "id" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "standardHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "workedHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paidLeaveHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "unpaidLeaveHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "missingHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lateCount" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveCount" INTEGER NOT NULL DEFAULT 0,
    "missingLogCount" INTEGER NOT NULL DEFAULT 0,
    "totalPayableHours" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "PayrollSummaryRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollVersion" (
    "id" TEXT NOT NULL,
    "payrollPeriodId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT,
    "recipientRole" "UserRole",
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailStatus" "EmailStatus" NOT NULL DEFAULT 'NOT_SENT',
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "HelpCategory" NOT NULL,
    "body" TEXT NOT NULL,
    "allowedRoles" "UserRole"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "success" BOOLEAN,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- CreateIndex
CREATE INDEX "User_role_employmentStatus_idx" ON "User"("role", "employmentStatus");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceSession_employeeId_key" ON "AttendanceSession"("employeeId");

-- CreateIndex
CREATE INDEX "AttendanceSession_checkInAt_idx" ON "AttendanceSession"("checkInAt");

-- CreateIndex
CREATE INDEX "AttendanceLog_employeeId_workDate_idx" ON "AttendanceLog"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceLog_managerId_workDate_idx" ON "AttendanceLog"("managerId", "workDate");

-- CreateIndex
CREATE INDEX "AttendanceLog_workDate_status_idx" ON "AttendanceLog"("workDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceAdjustment_attendanceLogId_key" ON "AttendanceAdjustment"("attendanceLogId");

-- CreateIndex
CREATE INDEX "AttendanceAdjustment_requestedById_status_idx" ON "AttendanceAdjustment"("requestedById", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_status_idx" ON "LeaveRequest"("employeeId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_managerId_status_idx" ON "LeaveRequest"("managerId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_startDate_endDate_idx" ON "LeaveRequest"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveAttachment_leaveRequestId_key" ON "LeaveAttachment"("leaveRequestId");

-- CreateIndex
CREATE INDEX "Holiday_startDate_endDate_idx" ON "Holiday"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_permission_key" ON "RolePermission"("role", "permission");

-- CreateIndex
CREATE INDEX "PayrollPeriod_startDate_endDate_idx" ON "PayrollPeriod"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "PayrollPeriod_status_idx" ON "PayrollPeriod"("status");

-- CreateIndex
CREATE INDEX "PayrollSummaryRow_employeeId_idx" ON "PayrollSummaryRow"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollSummaryRow_payrollPeriodId_employeeId_key" ON "PayrollSummaryRow"("payrollPeriodId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollVersion_actorId_idx" ON "PayrollVersion"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollVersion_payrollPeriodId_version_key" ON "PayrollVersion"("payrollPeriodId", "version");

-- CreateIndex
CREATE INDEX "Notification_recipientId_read_idx" ON "Notification"("recipientId", "read");

-- CreateIndex
CREATE INDEX "Notification_recipientRole_read_idx" ON "Notification"("recipientRole", "read");

-- CreateIndex
CREATE INDEX "HelpArticle_category_idx" ON "HelpArticle"("category");

-- CreateIndex
CREATE INDEX "SupportTicket_requesterId_status_idx" ON "SupportTicket"("requesterId", "status");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetId_createdAt_idx" ON "AuditLog"("targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceAdjustment" ADD CONSTRAINT "AttendanceAdjustment_attendanceLogId_fkey" FOREIGN KEY ("attendanceLogId") REFERENCES "AttendanceLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAttachment" ADD CONSTRAINT "LeaveAttachment_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSummaryRow" ADD CONSTRAINT "PayrollSummaryRow_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSummaryRow" ADD CONSTRAINT "PayrollSummaryRow_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollVersion" ADD CONSTRAINT "PayrollVersion_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
