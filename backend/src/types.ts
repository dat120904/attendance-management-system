export type UserRole = "Employee" | "Manager" | "HR" | "Payroll" | "Admin";

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  subtitle: string;
  remainingLeaveDays: number;
  locked: boolean;
};

export type AttendanceLog = {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut: string;
  totalHours: string;
  status: "On Time" | "Late" | "On Leave";
};

export type Session = {
  token: string;
  userId: string;
  expiresAt: number;
};
