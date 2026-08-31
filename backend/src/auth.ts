import { randomUUID } from "node:crypto";
import type { Session, User, UserRole } from "./types.js";
import { users } from "./data.js";

const sessions = new Map<string, Session>();
const passwords = new Map(users.map((user) => [user.email, "password"]));
const sessionTtlMs = 1000 * 60 * 60 * 8;

export function login(email: string, password: string) {
  const user = users.find((item) => item.email === email);
  const expectedPassword = email ? passwords.get(email) : null;

  if (!user || password !== expectedPassword) {
    return { error: "Invalid email or password", status: 401 as const };
  }

  if (user.locked) {
    return { error: "Account is locked", status: 423 as const };
  }

  const token = randomUUID();
  sessions.set(token, {
    token,
    userId: user.id,
    expiresAt: Date.now() + sessionTtlMs
  });

  return { token, user: publicUser(user) };
}

export function registerAccount(input: { name: string; email: string; role: UserRole; department: string; password: string }) {
  const email = input.email.trim().toLowerCase();

  if (users.some((user) => user.email.toLowerCase() === email)) {
    return { error: "Email already exists", status: 409 as const };
  }

  const user: User = {
    id: `u-register-${Date.now()}`,
    name: input.name.trim(),
    email,
    role: input.role,
    subtitle: input.department.trim(),
    remainingLeaveDays: 12,
    locked: false
  };

  users.push(user);
  passwords.set(email, input.password);

  const token = randomUUID();
  sessions.set(token, {
    token,
    userId: user.id,
    expiresAt: Date.now() + sessionTtlMs
  });

  return { token, user: publicUser(user) };
}

export function logout(token: string) {
  sessions.delete(token);
}

export function getUserByToken(token: string) {
  const session = sessions.get(token);

  if (!session || session.expiresAt < Date.now()) {
    if (session) sessions.delete(token);
    return null;
  }

  const user = users.find((item) => item.id === session.userId);
  return user ? publicUser(user) : null;
}

export function publicUser(user: User) {
  const { locked, ...safeUser } = user;
  return safeUser;
}
