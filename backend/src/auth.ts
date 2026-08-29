import { randomUUID } from "node:crypto";
import type { Session, User } from "./types.js";
import { users } from "./data.js";

const sessions = new Map<string, Session>();
const sessionTtlMs = 1000 * 60 * 60 * 8;

export function login(email: string, password: string) {
  const user = users.find((item) => item.email === email);

  if (!user || password !== "password") {
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
