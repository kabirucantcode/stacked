import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { firstIssue, waitlistSchema } from "@/lib/validation";
import { toVibe } from "@/lib/vibes";

/**
 * Public endpoint used by the marketing page. Idempotent on email so someone
 * submitting twice doesn't error or create duplicates.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = waitlistSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const { email, name, amount } = parsed.data;
  const vibe = toVibe(parsed.data.vibe);

  try {
    await prisma.waitlistEntry.upsert({
      where: { email },
      update: {
        ...(name ? { name } : {}),
        ...(vibe ? { vibe } : {}),
        ...(amount ? { amount } : {}),
      },
      create: {
        email,
        name: name || null,
        vibe: vibe ?? null,
        amount: amount ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("waitlist failed", error);
    return NextResponse.json(
      { error: "We couldn't save that just now. Try again in a moment." },
      { status: 500 },
    );
  }
}
