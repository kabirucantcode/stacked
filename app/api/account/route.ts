import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { positionsFor, summarise } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { VIBE_LABEL, VIBE_NOTE } from "@/lib/vibes";

export const dynamic = "force-dynamic";

/** Everything the dashboard needs, in one round trip. */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.account) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { account } = user;
  const summary = await summarise(account.id);
  const entries = await prisma.ledgerEntry.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    user: { name: user.name, email: user.email, emailVerified: user.emailVerified !== null },
    account: {
      vibe: account.vibe,
      vibeLabel: VIBE_LABEL[account.vibe],
      vibeNote: VIBE_NOTE[account.vibe],
      status: account.status,
      ...summary,
    },
    positions: positionsFor(account.vibe, summary.balanceCents),
    activity: entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amountCents: entry.amountCents,
      label: entry.label,
      note: entry.note,
      at: entry.createdAt.toISOString(),
    })),
  });
}
