import { NextResponse } from "next/server";

import { recordAuthEvent } from "@/lib/auth-events";
import { getSessionUser } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { replaceRecoveryCodes } from "@/lib/recovery-codes";

/**
 * Regenerate recovery codes. Invalidates every old code, which is the point —
 * users do this when a code is lost or possibly seen.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (!user.totpEnabledAt) {
    return NextResponse.json(
      { error: "Turn on two-factor before generating recovery codes." },
      { status: 400 },
    );
  }

  const limit = rateLimit(clientKey(request, "recovery-codes"), 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const recoveryCodes = await replaceRecoveryCodes(user.id);

  await recordAuthEvent({
    type: "RECOVERY_CODES_REGENERATED",
    userId: user.id,
    email: user.email,
  });

  return NextResponse.json({
    ok: true,
    recoveryCodes,
    message: "New codes generated. The old ones no longer work.",
  });
}
