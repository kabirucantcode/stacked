import { NextResponse } from "next/server";

import { appUrl, passwordResetEmail, sendEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { issueToken } from "@/lib/tokens";
import { firstIssue, forgotPasswordSchema } from "@/lib/validation";

/**
 * Request a password reset link.
 *
 * Always answers 200 with the same body, whether or not the email exists —
 * otherwise this endpoint becomes a user-enumeration oracle.
 */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "forgot"), 5, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many reset requests. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const { email } = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = await issueToken(user.id, "PASSWORD_RESET");
      const url = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      const mail = passwordResetEmail(user.name.split(" ")[0] ?? user.name, url);
      await sendEmail({ to: user.email, ...mail });
    }
  } catch (error) {
    // Log, but still return success — never leak existence via an error either.
    console.error("forgot-password failed", error);
  }

  return NextResponse.json({
    ok: true,
    message: "If that email is on an account, a reset link is on its way.",
  });
}
