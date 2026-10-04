import { createHash, randomBytes } from "node:crypto";

import type { TokenType } from "@prisma/client";

import { prisma } from "./prisma";

/**
 * Single-use tokens for email verification and password reset.
 *
 * The raw token goes in the emailed link; only its SHA-256 hash is stored. That
 * means a database leak doesn't hand out working reset links, and it keeps the
 * lookup a simple unique-index hit.
 */
const TTL_MS: Record<TokenType, number> = {
  EMAIL_VERIFICATION: 1000 * 60 * 60 * 24, // 24 hours
  PASSWORD_RESET: 1000 * 60 * 60, // 1 hour
};

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Issue a token and return the RAW value to put in the email. */
export async function issueToken(userId: string, type: TokenType): Promise<string> {
  const raw = randomBytes(32).toString("base64url");

  await prisma.token.create({
    data: {
      userId,
      type,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + TTL_MS[type]),
    },
  });

  return raw;
}

/**
 * Validate and consume a token, returning the owning user id.
 *
 * The `updateMany` with `consumedAt: null` in the WHERE clause makes the claim
 * atomic: if two requests race with the same token, only one gets `count === 1`.
 */
export async function consumeToken(raw: string, type: TokenType): Promise<string | null> {
  if (!raw) return null;

  const record = await prisma.token.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!record) return null;
  if (record.type !== type) return null;
  if (record.consumedAt) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;

  const claimed = await prisma.token.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  return claimed.count === 1 ? record.userId : null;
}
