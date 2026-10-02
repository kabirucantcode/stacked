import { REFERENCE_PRICE, VIBE_ALLOCATION, type Vibe } from "./vibes";
import { prisma } from "./prisma";

export type Summary = {
  balanceCents: number;
  /** Net of deposits minus withdrawals — the money the user actually put in. */
  netDepositedCents: number;
  profitLossCents: number;
};

/**
 * Balance is derived, never stored: sum every signed ledger entry.
 * Cheap at this scale; move to a cached balance column when it stops being cheap.
 */
export async function summarise(accountId: string): Promise<Summary> {
  const entries = await prisma.ledgerEntry.findMany({
    where: { accountId },
    select: { type: true, amountCents: true },
  });

  let balanceCents = 0;
  let netDepositedCents = 0;

  for (const entry of entries) {
    balanceCents += entry.amountCents;
    if (entry.type === "DEPOSIT" || entry.type === "WITHDRAWAL") {
      netDepositedCents += entry.amountCents;
    }
  }

  return {
    balanceCents,
    netDepositedCents,
    profitLossCents: balanceCents - netDepositedCents,
  };
}

export type Position = {
  symbol: string;
  label: string;
  weight: number;
  why: string;
  valueCents: number;
  quantity: number | null;
  price: number | null;
};

/**
 * Illustrative positions for the dashboard: the target allocation for the
 * user's vibe, scaled to their current balance. Phase 2 replaces this with the
 * positions actually reported by the broker.
 */
export function positionsFor(vibe: Vibe, balanceCents: number): Position[] {
  return VIBE_ALLOCATION[vibe].map((allocation) => {
    const valueCents = Math.round((balanceCents * allocation.weight) / 100);
    const price = REFERENCE_PRICE[allocation.symbol] ?? null;
    const isCash = allocation.symbol === "CASH";

    return {
      symbol: allocation.symbol,
      label: isCash ? "cash" : allocation.symbol,
      weight: allocation.weight,
      why: allocation.why,
      valueCents,
      quantity: isCash || price === null ? null : valueCents / 100 / price,
      price: isCash ? null : price,
    };
  });
}
