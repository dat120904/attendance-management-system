import type { LeaveWorkflowConfig, SystemSettings } from "../types";

export const emptyLeaveWorkflow: LeaveWorkflowConfig = {
  requireHrApproval: false,
  annualLeaveRequiresBalance: true,
  allowEmployeeCancelBeforeManager: true,
  attachmentRequiredForSickLeave: false,
  defaultAnnualLeaveDays: 0
};

export const emptySystemSettings: SystemSettings = {
  attendancePolicy: {
    standardStartTime: "",
    standardEndTime: "",
    lateGraceMinutes: 0,
    earlyLeaveGraceMinutes: 0,
    overtimeAfterHours: 0,
    requireLocation: false
  },
  leavePolicy: {
    defaultAnnualLeaveDays: 0,
    attachmentRequiredForSickLeave: false,
    requireHrApproval: false,
    blockAnnualLeaveOverBalance: true
  },
  workSchedules: [],
  holidays: [],
  roles: { Employee: [], Manager: [], HR: [], Payroll: [], Admin: [] },
  notifications: {
    inAppEnabled: false,
    emailEnabled: false,
    managerDigestEnabled: false,
    payrollReminderEnabled: false
  },
  payrollExport: {
    defaultFormat: "excel",
    includeWarnings: true,
    lockRequiresResolvedLogs: true
  },
  security: {
    minPasswordLength: 6,
    sessionTimeoutMinutes: 0,
    allowSelfRegistration: false,
    requireTwoFactor: false
  },
  integrations: { calendarProvider: "", payrollProvider: "", webhookUrl: "" },
  audit: { enabled: false, retentionDays: 0 }
};