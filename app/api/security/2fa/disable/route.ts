import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuthEvent } from "@/lib/auth-events";
import { getSessionUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { clearRecoveryCodes } from "@/lib/recovery-codes";

const bodySchema = z.object({ password: z.string().min(1) });

/** Turn 2FA off. Requires the password, so a borrowed session can't remove it. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const limit = rateLimit(clientKey(request, "2fa-disable"), 10, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Confirm your password to continue." }, { status: 400 });
  }

  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    await recordAuthEvent({
      type: "TOTP_CHALLENGE_FAILED",
      userId: user.id,
      email: user.email,
      detail: "wrong password on 2FA disable",
    });
    return NextResponse.json({ error: "That password doesn't match." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { totpSecret: null, totpEnabledAt: null, totpLastCounter: null },
  });
  await clearRecoveryCodes(user.id);

  await recordAuthEvent({ type: "TOTP_DISABLED", userId: user.id, email: user.email });

  return NextResponse.json({ ok: true, message: "Two-factor is off." });
}
