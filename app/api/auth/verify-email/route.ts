import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { consumeToken } from "@/lib/tokens";
import { firstIssue, verifyEmailSchema } from "@/lib/validation";

/**
 * Confirm an email address from the link we mailed at sign-up.
 *
 * The emailed link points at the /verify-email page, which POSTs the token here
 * so verification stays a side-effecting POST rather than a GET.
 */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "verify"), 20, 15 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = verifyEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const userId = await consumeToken(parsed.data.token, "EMAIL_VERIFICATION");
  if (!userId) {
    return NextResponse.json(
      { error: "That confirmation link has expired or was already used." },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: userId },
    // Only set it the first time, so a re-issued link can't rewrite the date.
    data: { emailVerified: new Date() },
  });

  return NextResponse.json({ ok: true, message: "Email confirmed." });
}
