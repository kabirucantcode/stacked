import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { summarise } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { firstIssue, moveSchema } from "@/lib/validation";

/**
 * Sandbox deposits and withdrawals.
 *
 * Phase 2 replaces this with a real payment rail: the client asks the provider
 * to start a transfer, and a signature-verified webhook credits the ledger once
 * funds settle. Until then this writes the ledger entry directly, which is why
 * every entry it creates is labelled "Sandbox".
 */
export async function POST(request: Request) {
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

  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const { direction, amountCents } = parsed.data;
  const { id: accountId } = user.account;

  if (direction === "withdraw") {
    const { balanceCents } = await summarise(accountId);
    if (amountCents > balanceCents) {
      return NextResponse.json(
        { error: `You can withdraw up to ${formatMoney(balanceCents)}.` },
        { status: 400 },
      );
    }
  }

  const entry = await prisma.ledgerEntry.create({
    data: {
      accountId,
      type: direction === "deposit" ? "DEPOSIT" : "WITHDRAWAL",
      amountCents: direction === "deposit" ? amountCents : -amountCents,
      label: direction === "deposit" ? "Deposit" : "Withdrawal",
      note: "Sandbox mode — connects to a real payment rail in Phase 2.",
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json(
    { ok: true, entry: { id: entry.id, at: entry.createdAt.toISOString() } },
    { status: 201 },
  );
}
