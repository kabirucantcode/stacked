import { createHash, randomBytes } from "node:crypto";

import { prisma } from "./prisma";

/**
 * Revocable sessions.
 *
 * Auth.js uses stateless JWTs, which can't be listed or revoked. So we mint our
 * own session record at sign-in and put a random `sid` in the JWT. Only the
 * SHA-256 hash of that `sid` is stored, and `getSessionUser()` validates it on
 * every request — which is what makes "sign out everywhere" real rather than
 * cosmetic.
 *
 * `tokenVersion` still exists as a coarse kill switch for password changes.
 */

const TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const TOUCH_AFTER_MS = 1000 * 60 * 5; // don't write on every request

export function hashSessionId(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Create a session and return the RAW sid to embed in the JWT. */
export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");

  await prisma.userSession.create({
    data: {
      userId,
      tokenHash: hashSessionId(raw),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 300) : null,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });

  return raw;
}

export async function validateSession(
  rawSid: string | undefined,
  userId: string,
): Promise<boolean> {
  if (!rawSid) return false;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashSessionId(rawSid) },
  });
  if (!session) return false;
  if (session.userId !== userId) return false;
  if (session.revokedAt) return false;
  if (session.expiresAt.getTime() < Date.now()) return false;

  // Throttled so a busy tab doesn't write on every request.
  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
    try {
      await prisma.userSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    } catch {
      /* losing a lastSeenAt update is not worth failing a request over */
    }
  }

  return true;
}

export async function revokeSessionByRawId(rawSid: string | undefined): Promise<number> {
  if (!rawSid) return 0;
  const result = await prisma.userSession.updateMany({
    where: { tokenHash: hashSessionId(rawSid), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function revokeSession(userId: string, id: string): Promise<number> {
  const result = await prisma.userSession.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const result = await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export type SessionSummary = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

export async function listSessions(
  userId: string,
  currentRawSid: string | undefined,
): Promise<SessionSummary[]> {
  const currentHash = currentRawSid ? hashSessionId(currentRawSid) : null;

  const sessions = await prisma.userSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    take: 50,
  });

  return sessions.map((session) => ({
    id: session.id,
    userAgent: session.userAgent,
    ip: session.ip,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    current: currentHash !== null && session.tokenHash === currentHash,
  }));
}
