import type { Translation } from "../i18n";
import type { PayrollPeriod, UserRole } from "../types";

export function translateRole(role: UserRole, t: Translation) {
  if (role === "Employee") return t.employeeRole;
  if (role === "Manager") return t.managerRole;
  if (role === "HR") return t.hrRole;
  if (role === "Payroll") return t.payrollRole;
  return t.adminRole;
}

export function translateDepartment(department: string, t: Translation) {
  if (department === "Employee") return t.employeeRole;
  if (department === "Team Manager") return t.managerRole;
  if (department === "Payroll Specialist") return t.payrollRole;
  if (department === "Enterprise Admin") return t.adminRole;
  if (department === "Product") return t.deptProduct;
  if (department === "Operations") return t.deptOperations;
  if (department === "People" || department === "People Operations") return t.deptPeople;
  if (department === "Finance") return t.deptFinance;
  if (department === "Administration") return t.deptAdministration;
  return department;
}

export function translatePayrollStatus(status: PayrollPeriod["status"], t: Translation) {
  if (status === "Draft") return t.draft;
  if (status === "Confirmed") return t.confirmedPayrollStatus;
  return t.lockedPayrollStatus;
}

export function translatePosition(position: string, t: Translation) {
  if (t.position === "Position") return position;

  const positions: Record<string, string> = {
    "Product Designer": "Nhà thiết kế sản phẩm",
    "Frontend Developer": "Lập trình viên giao diện",
    "Operations Associate": "Chuyên viên vận hành",
    "Operations Analyst": "Chuyên viên phân tích vận hành",
    "Operations Manager": "Quản lý vận hành"
  };

  return positions[position] ?? position;
}

export function translateAttendancePolicy(policy: string, t: Translation) {
  if (t.attendancePolicy === "Attendance policy") return policy;
  if (policy === "Office check-in") return "Chấm công tại văn phòng";
  if (policy === "Office + remote") return "Văn phòng và làm việc từ xa";
  return policy;
}

export function translateLeavePolicy(policy: string, t: Translation) {
  if (t.leavePolicy === "Leave policy") return policy;
  const annualLeave = policy.match(/^Annual (\d+) days?$/);
  if (annualLeave) return `Phép năm ${annualLeave[1]} ngày`;
  return policy;
}
export function translateLeaveReason(reason: string, t: Translation) {
  const language = t.reason === "Reason" ? "en" : "vi";
  const samples: Array<{ en: string; vi: string }> = [
    { en: "Family trip", vi: "Du lịch cùng gia đình" },
    { en: "Medical appointment", vi: "Khám bệnh" }
  ];
  const sample = samples.find((item) => item.en === reason || item.vi === reason);
  return sample ? sample[language] : reason;
}
