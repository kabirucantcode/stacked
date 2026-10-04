import { NextResponse } from "next/server";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { consumeToken } from "@/lib/tokens";
import { firstIssue, resetPasswordSchema } from "@/lib/validation";

/**
 * Consume a reset token and set a new password.
 *
 * Bumping `tokenVersion` in the same write invalidates every JWT issued before
 * this moment, so anyone already signed in as the user is signed out.
 */
export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "reset"), 10, 15 * 60 * 1000);
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

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const { token, password } = parsed.data;

  const userId = await consumeToken(token, "PASSWORD_RESET");
  if (!userId) {
    return NextResponse.json(
      { error: "That reset link has expired or was already used. Request a new one." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, tokenVersion: { increment: 1 } },
  });

  return NextResponse.json({ ok: true, message: "Password updated. You can sign in now." });
}
