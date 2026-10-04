import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuthEvent } from "@/lib/auth-events";
import { getSessionUser } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { replaceRecoveryCodes } from "@/lib/recovery-codes";
import { openSecret } from "@/lib/secret-box";
import { matchTotpCounter } from "@/lib/totp";

const bodySchema = z.object({ code: z.string().trim().min(6).max(20) });

/**
 * Confirm 2FA enrolment with a live code, then switch it on and hand back the
 * recovery codes — the only time they are ever shown.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const limit = rateLimit(clientKey(request, "2fa-enable"), 10, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  if (user.totpEnabledAt) {
    return NextResponse.json({ error: "Two-factor is already on." }, { status: 400 });
  }
  if (!user.totpSecret) {
    return NextResponse.json({ error: "Start setup again." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the 6-digit code from your app." }, { status: 400 });
  }

  const counter = matchTotpCounter(openSecret(user.totpSecret), parsed.data.code);
  if (counter === null) {
    return NextResponse.json(
      { error: "That code didn't match. Check your device's clock and try again." },
      { status: 400 },
    );
  }

  const recoveryCodes = await replaceRecoveryCodes(user.id);

  await prisma.user.update({
    where: { id: user.id },
    data: { totpEnabledAt: new Date(), totpLastCounter: counter, failedLoginCount: 0 },
  });

  await recordAuthEvent({ type: "TOTP_ENABLED", userId: user.id, email: user.email });

  return NextResponse.json({
    ok: true,
    recoveryCodes,
    message: "Two-factor is on. Save your recovery codes somewhere safe.",
  });
}
