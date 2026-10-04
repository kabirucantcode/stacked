import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { readIdempotencyKey, withIdempotency } from "@/lib/idempotency";
import { summarise } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { firstIssue, moveSchema } from "@/lib/validation";

type MoveBody = { ok?: boolean; error?: string; entry?: { id: string; at: string } };

/**
 * Sandbox deposits and withdrawals.
 *
 * Requires an `Idempotency-Key` header: the caller generates one key per intent
 * (not per click), so a double-submit, a retried request, or a refresh replays
 * the original result instead of moving money twice.
 *
 * Note: withdrawals debit the ledger immediately. Once crypto deposits are live
 * that should become a request → review → payout flow; see README.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.account) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: "This request needs an Idempotency-Key header." },
      { status: 400 },
    );
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
  const accountId = user.account.id;

  const outcome = await withIdempotency<MoveBody>(
    `account.move:${accountId}`,
    idempotencyKey,
    async () => {
      if (direction === "withdraw") {
        const { balanceCents } = await summarise(accountId);
        if (amountCents > balanceCents) {
          return {
            status: 400,
            body: { error: `You can withdraw up to ${formatMoney(balanceCents)}.` },
          };
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

      return {
        status: 201,
        body: { ok: true, entry: { id: entry.id, at: entry.createdAt.toISOString() } },
      };
    },
  );

  return NextResponse.json(outcome.body, {
    status: outcome.status,
    headers: outcome.replayed ? { "Idempotent-Replay": "true" } : undefined,
  });
}
