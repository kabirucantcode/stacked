import { createHash, randomInt } from "node:crypto";

import { prisma } from "./prisma";

/**
 * One-time 2FA backup codes.
 *
 * Only SHA-256 hashes are stored, so a database leak can't be replayed into a
 * login. Codes are consumed atomically so one can't be used twice.
 */

// No I, O, 0 or 1 — they get misread when someone copies a code by hand.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GROUP = 5;
const GROUPS = 2;

/** e.g. "K7M2P-9XQ4T" — 10 chars from a 32-char alphabet, so 50 bits each. */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];

  for (let i = 0; i < count; i += 1) {
    let code = "";
    for (let j = 0; j < GROUP * GROUPS; j += 1) {
      if (j === GROUP) code += "-";
      code += ALPHABET[randomInt(ALPHABET.length)];
    }
    codes.push(code);
  }

  return codes;
}

function normalize(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalize(code)).digest("hex");
}

/** Replace every code for a user. Returns the plaintext codes exactly once. */
export async function replaceRecoveryCodes(userId: string, count = 10): Promise<string[]> {
  const codes = generateRecoveryCodes(count);

  await prisma.$transaction([
    prisma.recoveryCode.deleteMany({ where: { userId } }),
    prisma.recoveryCode.createMany({
      data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })),
    }),
  ]);

  return codes;
}

export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const claimed = await prisma.recoveryCode.updateMany({
    where: { userId, codeHash: hashRecoveryCode(code), usedAt: null },
    data: { usedAt: new Date() },
  });
  return claimed.count === 1;
}

export async function clearRecoveryCodes(userId: string): Promise<void> {
  await prisma.recoveryCode.deleteMany({ where: { userId } });
}

export function countUnusedRecoveryCodes(userId: string): Promise<number> {
  return prisma.recoveryCode.count({ where: { userId, usedAt: null } });
}
