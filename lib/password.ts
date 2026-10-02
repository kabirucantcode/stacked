import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;
const SCHEME = "scrypt";

/**
 * Hash a password with scrypt (built into Node — no native dependency, which
 * keeps Render builds simple). Format: `scrypt$<salt-b64>$<key-b64>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN);
  return `${SCHEME}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** Constant-time verification against a stored hash. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3) return false;
  const [scheme, saltB64, keyB64] = parts;
  if (scheme !== SCHEME) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(keyB64, "base64");
  if (expected.length === 0) return false;

  const actual = await scrypt(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
