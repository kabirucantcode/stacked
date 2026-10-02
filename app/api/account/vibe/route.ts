import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { firstIssue, vibeSchema } from "@/lib/validation";
import { DISCLOSURE_VERSION } from "@/lib/vibes";

/**
 * Change risk level. Writes the new acknowledgement into the risk profile so the
 * audit trail records *when* the user opted into a different risk level.
 * Phase 2 also queues a rebalance to move the portfolio to the new target.
 */
export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user?.account) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = vibeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const { vibe } = parsed.data;

  await prisma.$transaction([
    prisma.account.update({ where: { id: user.account.id }, data: { vibe } }),
    prisma.riskProfile.upsert({
      where: { userId: user.id },
      update: { vibe, disclosureVersion: DISCLOSURE_VERSION, acknowledgedAt: new Date() },
      create: {
        userId: user.id,
        vibe,
        disclosureVersion: DISCLOSURE_VERSION,
        acknowledgedAt: new Date(),
      },
    }),
  ]);

  return NextResponse.json({ ok: true, vibe });
}
