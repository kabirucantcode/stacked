import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuthEvent } from "@/lib/auth-events";
import { getSessionId, getSessionUser } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { revokeAllSessions, revokeSession, revokeSessionByRawId } from "@/lib/sessions";

const bodySchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    all: z.boolean().optional(),
  })
  .optional();

/**
 * Revoke sessions.
 *   { all: true } → every session (sign out everywhere)
 *   { id }        → one specific device
 *   {} or no body → just this session
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const limit = rateLimit(clientKey(request, "revoke-sessions"), 20, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const body = parsed.data ?? {};
  let revoked = 0;

  if (body.all) {
    revoked = await revokeAllSessions(user.id);
    await recordAuthEvent({
      type: "SESSIONS_REVOKED",
      userId: user.id,
      email: user.email,
      detail: `all sessions (${revoked})`,
    });
  } else if (body.id) {
    revoked = await revokeSession(user.id, body.id);
    await recordAuthEvent({
      type: "SESSIONS_REVOKED",
      userId: user.id,
      email: user.email,
      detail: `session ${body.id}`,
    });
  } else {
    revoked = await revokeSessionByRawId((await getSessionId()) ?? undefined);
  }

  return NextResponse.json({ ok: true, revoked });
}
