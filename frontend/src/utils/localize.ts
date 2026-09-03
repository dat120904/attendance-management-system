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
