import { NextResponse } from "next/server";

import { getSessionId, getSessionUser } from "@/lib/auth";
import { countUnusedRecoveryCodes } from "@/lib/recovery-codes";
import { listSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";

/** Everything the security section of the settings page needs. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const [sessions, unusedRecoveryCodes] = await Promise.all([
    listSessions(user.id, (await getSessionId()) ?? undefined),
    countUnusedRecoveryCodes(user.id),
  ]);

  return NextResponse.json({
    email: user.email,
    emailVerified: user.emailVerified !== null,
    twoFactorEnabled: user.totpEnabledAt !== null,
    hasPendingSecret: user.totpSecret !== null && user.totpEnabledAt === null,
    unusedRecoveryCodes,
    sessions,
  });
}
