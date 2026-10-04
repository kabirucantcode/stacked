import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { recordAuthEvent } from "./auth-events";
import { clientIp, userAgentOf } from "./client-info";
import { verifyPassword } from "./password";
import { prisma } from "./prisma";
import { consumeRecoveryCode } from "./recovery-codes";
import { openSecret } from "./secret-box";
import { createSession, validateSession } from "./sessions";
import { matchTotpCounter } from "./totp";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string().min(1),
  // Optional, so the form can send it only when the user has 2FA. Requiring it
  // unconditionally would leak which accounts have it enabled.
  token: z.string().trim().max(20).optional(),
});

/** Auth.js has passed the request as either the 2nd arg or a `{ request }` bag. */
function asRequest(value: unknown): Request | null {
  if (value instanceof Request) return value;
  if (value && typeof value === "object" && "request" in value) {
    const inner = (value as { request?: unknown }).request;
    if (inner instanceof Request) return inner;
  }
  return null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Render terminates TLS and proxies to us, so the forwarded host is trusted.
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/signin" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        token: { label: "Authenticator code", type: "text" },
      },
      authorize: async (raw, request) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password, token } = parsed.data;
        const req = asRequest(request);
        const ip = req ? clientIp(req) : null;
        const userAgent = req ? userAgentOf(req) : null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          // Compared against nothing, so this path is faster than a real check.
          // A dummy verify would flatten that timing difference; noted in README.
          await recordAuthEvent({
            type: "SIGN_IN_FAILED",
            email,
            ip,
            userAgent,
            detail: "no such account",
          });
          return null;
        }

        if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
          await recordAuthEvent({ type: "LOCKED_OUT", userId: user.id, email, ip, userAgent });
          return null;
        }

        async function registerFailure(detail: string, eventType: "SIGN_IN_FAILED" | "TOTP_CHALLENGE_FAILED") {
          const failed = user!.failedLoginCount + 1;
          const locked = failed >= MAX_FAILED_ATTEMPTS;
          await prisma.user.update({
            where: { id: user!.id },
            data: {
              failedLoginCount: failed,
              lockedUntil: locked ? new Date(Date.now() + LOCK_DURATION_MS) : null,
            },
          });
          await recordAuthEvent({
            type: locked ? "LOCKED_OUT" : eventType,
            userId: user!.id,
            email,
            ip,
            userAgent,
            detail: locked ? `locked after ${failed} attempts` : detail,
          });
        }

        const passwordOk = await verifyPassword(password, user.passwordHash);
        if (!passwordOk) {
          await registerFailure(
            `bad password (${user.failedLoginCount + 1}/${MAX_FAILED_ATTEMPTS})`,
            "SIGN_IN_FAILED",
          );
          return null;
        }

        // ---- second factor ------------------------------------------------
        let matchedCounter: number | null = null;
        let usedRecoveryCode = false;

        if (user.totpEnabledAt && user.totpSecret) {
          const code = token?.trim() ?? "";
          if (!code) {
            await registerFailure("2FA code missing", "TOTP_CHALLENGE_FAILED");
            return null;
          }

          const secret = openSecret(user.totpSecret);
          const counter = matchTotpCounter(secret, code);

          if (counter !== null && (user.totpLastCounter === null || counter > user.totpLastCounter)) {
            matchedCounter = counter;
          } else if (counter !== null) {
            // Correct code, but already spent — treat it as a replay.
            await registerFailure("2FA code replayed", "TOTP_CHALLENGE_FAILED");
            return null;
          } else if (await consumeRecoveryCode(user.id, code)) {
            usedRecoveryCode = true;
          } else {
            await registerFailure("bad 2FA code", "TOTP_CHALLENGE_FAILED");
            return null;
          }
        }

        // ---- success ------------------------------------------------------
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: null,
            ...(matchedCounter !== null ? { totpLastCounter: matchedCounter } : {}),
          },
        });

        const sid = await createSession(user.id, { ip, userAgent });

        if (usedRecoveryCode) {
          await recordAuthEvent({ type: "RECOVERY_CODE_USED", userId: user.id, email, ip, userAgent });
        }
        await recordAuthEvent({ type: "SIGN_IN_SUCCEEDED", userId: user.id, email, ip, userAgent });

        // Assigned to a variable (not a fresh literal) so the extra fields are
        // allowed by the structural return type.
        const authenticated = {
          id: user.id,
          email: user.email,
          name: user.name,
          tokenVersion: user.tokenVersion,
          sid,
        };
        return authenticated;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        const fresh = user as { id: string; tokenVersion?: number; sid?: string };
        token.uid = fresh.id;
        // A password change bumps this, invalidating every previously issued JWT.
        token.tv = fresh.tokenVersion ?? 0;
        token.sid = fresh.sid;
      }
      return token;
    },
    session({ session, token }) {
      const view = session.user as { id?: string; tokenVersion?: number; sid?: string };
      if (typeof token.uid === "string") view.id = token.uid;
      if (typeof token.tv === "number") view.tokenVersion = token.tv;
      if (typeof token.sid === "string") view.sid = token.sid;
      return session;
    },
  },
});

type SessionView = { id?: string; tokenVersion?: number; sid?: string } | undefined;

async function currentSessionView(): Promise<SessionView> {
  const session = await auth();
  return session?.user as SessionView;
}

export async function getSessionId(): Promise<string | null> {
  const view = await currentSessionView();
  return view?.sid ?? null;
}

/**
 * Resolve the signed-in user (with their account and risk profile).
 * Returns null when there is no session, the token is stale, or the session
 * record has been revoked.
 */
export async function getSessionUser() {
  const view = await currentSessionView();
  if (!view?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: view.id },
    include: { account: true, riskProfile: true },
  });
  if (!user) return null;

  // Reject tokens issued before the last password change…
  if (user.tokenVersion !== (view.tokenVersion ?? 0)) return null;
  // …and tokens whose session has since been revoked or expired.
  if (!(await validateSession(view.sid, user.id))) return null;

  return user;
}
