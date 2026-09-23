import { createHash, randomBytes, randomUUID } from "node:crypto";
import { prisma } from "./db.js";
import { sendPasswordResetEmail } from "./email.js";
import { hashPassword, verifyPassword } from "./security.js";
import type { User, UserRole } from "./types.js";

export async function login(emailInput: string, password: string) {
  const email = emailInput.trim().toLowerCase();
  const record = await prisma.user.findUnique({ where: { email } });
  if (!record || !record.passwordHash || !verifyPassword(password, record.passwordHash)) return { error: "Invalid email or password", status: 401 as const };
  if (record.locked || record.employmentStatus !== "ACTIVE") return { error: "Account is locked", status: 423 as const };
  const token = await createAuthSession(record.id);
  return { token, user: publicUser(databaseUserToApi(record)) };
}

export async function registerAccount(input: { name: string; email: string; role: UserRole; department: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) return { error: "Email already exists", status: 409 as const };
  const record = await prisma.user.create({ data: { id: randomUUID(), name: input.name.trim(), email, role: apiRoleToDatabase(input.role), subtitle: input.department.trim(), department: input.department.trim(), remainingLeaveDays: 12, locked: false, employmentStatus: "ACTIVE", passwordHash: hashPassword(input.password) } });
  const token = await createAuthSession(record.id);
  return { token, user: publicUser(databaseUserToApi(record)) };
}

export async function requestPasswordReset(emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
  if (!user) return;
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(token);
  const record = await prisma.$transaction(async (transaction) => {
    await transaction.passwordResetToken.deleteMany({ where: { OR: [{ userId: user.id }, { expiresAt: { lt: new Date() } }] } });
    return transaction.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60_000) } });
  });
  try {
    await sendPasswordResetEmail({ email: user.email, name: user.name, token });
  } catch (error) {
    await prisma.passwordResetToken.deleteMany({ where: { id: record.id } });
    throw error;
  }
}

export async function resetPasswordWithToken(token: string, password: string) {
  const tokenHash = hashResetToken(token);
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    const record = await transaction.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt <= now) return false;
    const claimed = await transaction.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (claimed.count !== 1) return false;
    await transaction.user.update({ where: { id: record.userId }, data: { passwordHash: hashPassword(password) } });
    await transaction.authSession.deleteMany({ where: { userId: record.userId } });
    await transaction.auditLog.create({ data: { id: randomUUID(), actorId: record.userId, action: "auth.password_reset", targetId: record.userId, success: true } });
    return true;
  });
}

async function createAuthSession(userId: string) {
  const now = new Date();
  const settings = await prisma.systemSetting.findUnique({ where: { id: "default" }, select: { sessionTimeoutMinutes: true } });
  const timeoutMinutes = Math.max(15, settings?.sessionTimeoutMinutes ?? 480);
  const token = randomUUID();
  await prisma.$transaction([prisma.authSession.deleteMany({ where: { expiresAt: { lt: now } } }), prisma.authSession.create({ data: { token, userId, expiresAt: new Date(now.getTime() + timeoutMinutes * 60_000) } })]);
  return token;
}

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function logout(token: string) { await prisma.authSession.deleteMany({ where: { token } }); }
export async function getUserByToken(token: string) { const session = await prisma.authSession.findUnique({ where: { token }, include: { user: true } }); if (!session) return null; if (session.expiresAt.getTime() < Date.now()) { await prisma.authSession.delete({ where: { token } }); return null; } return publicUser(databaseUserToApi(session.user)); }
export async function setUserPassword(emailInput: string, password: string) { await prisma.user.updateMany({ where: { email: emailInput.trim().toLowerCase() }, data: { passwordHash: hashPassword(password) } }); }
export function publicUser(user: User) { const { locked, pinHash, ...safeUser } = user; void pinHash; return safeUser; }
function apiRoleToDatabase(role: UserRole) { return ({ Employee: "EMPLOYEE", Manager: "MANAGER", HR: "HR", Payroll: "PAYROLL", Admin: "ADMIN" } as const)[role]; }
function databaseRoleToApi(role: string): UserRole { return ({ EMPLOYEE: "Employee", MANAGER: "Manager", HR: "HR", PAYROLL: "Payroll", ADMIN: "Admin" } as Record<string, UserRole>)[role] ?? "Employee"; }
function databaseStatusToApi(status: string): User["employmentStatus"] { return ({ ACTIVE: "Active", LOCKED: "Locked", INACTIVE: "Inactive" } as Record<string, User["employmentStatus"]>)[status] ?? "Inactive"; }
export function databaseUserToApi(record: { id: string; name: string; email: string; role: string; subtitle: string; employeeCode: string | null; phone: string | null; pinHash: string | null; position: string | null; managerId: string | null; hireDate: Date | null; employmentStatus: string; attendancePolicy: string | null; leavePolicy: string | null; remainingLeaveDays: { toString(): string }; locked: boolean }): User { return { id: record.id, name: record.name, email: record.email, role: databaseRoleToApi(record.role), subtitle: record.subtitle, employeeCode: record.employeeCode ?? undefined, phone: record.phone ?? undefined, pinHash: record.pinHash ?? undefined, position: record.position ?? undefined, managerId: record.managerId ?? undefined, hireDate: record.hireDate?.toISOString().slice(0, 10), employmentStatus: databaseStatusToApi(record.employmentStatus), attendancePolicy: record.attendancePolicy ?? undefined, leavePolicy: record.leavePolicy ?? undefined, remainingLeaveDays: Number(record.remainingLeaveDays), locked: record.locked }; }