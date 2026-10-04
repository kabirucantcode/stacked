import type { AuthEventType } from "@prisma/client";

import { prisma } from "./prisma";

/**
 * Authentication audit trail.
 *
 * Deliberately best-effort: a failure to write an audit row must never block a
 * login or a logout, so errors are swallowed (and logged) rather than thrown.
 */

export type AuthEventInput = {
  type: AuthEventType;
  userId?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  detail?: string | null;
};

export async function recordAuthEvent(input: AuthEventInput): Promise<void> {
  try {
    await prisma.authEvent.create({
      data: {
        type: input.type,
        userId: input.userId ?? null,
        email: input.email ? input.email.toLowerCase() : null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
        detail: input.detail ?? null,
      },
    });
  } catch (error) {
    console.error("failed to record auth event", input.type, error);
  }
}

/** Recent events for a user — used by the settings page. */
export async function recentAuthEvents(userId: string, take = 20) {
  return prisma.authEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}
