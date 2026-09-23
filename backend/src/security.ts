import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const keyLength = 32;

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, keyLength).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPin(pin: string, encodedHash: string) {
  const [algorithm, salt, expectedHex] = encodedHash.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const actual = scryptSync(pin, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export const hashPassword = hashPin;
export const verifyPassword = verifyPin;