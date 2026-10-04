import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { appUrl, sendEmail, verificationEmail } from "@/lib/email";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { issueToken } from "@/lib/tokens";

/** Re-send the confirmation email for the signed-in user. */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  if (user.emailVerified) {
    return NextResponse.json({ error: "That email is already confirmed." }, { status: 400 });
  }

  const limit = rateLimit(clientKey(request, "resend"), 3, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "We already sent one. Give it a couple of minutes before trying again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const token = await issueToken(user.id, "EMAIL_VERIFICATION");
    const url = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
    const mail = verificationEmail(user.name.split(" ")[0] ?? user.name, url);
    await sendEmail({ to: user.email, ...mail });
  } catch (error) {
    console.error("resend-verification failed", error);
    return NextResponse.json({ error: "We couldn't send that email. Try again shortly." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, message: "Confirmation email sent." });
}
