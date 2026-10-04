import { cryptoConfigured, minConfirmations } from "./crypto";
import { demoEnabled } from "./demo-trading";
import { positionsFor, summarise } from "./ledger";
import { acceptedTokens } from "./prices";
import { prisma } from "./prisma";
import { VIBE_LABEL, VIBE_NOTE, type Vibe } from "./vibes";

/**
 * One payload for the dashboard, built in one place so `/api/account` and the
 * demo-tick endpoint can never drift apart.
 */

export type AccountPayload = {
  user: { name: string; email: string; emailVerified: boolean };
  account: {
    vibe: Vibe;
    vibeLabel: string;
    vibeNote: string;
    status: string;
    balanceCents: number;
    netDepositedCents: number;
    profitLossCents: number;
    todayPnlCents: number;
    todayPct: number;
  };
  positions: ReturnType<typeof positionsFor>;
  activity: Array<{
    id: string;
    type: string;
    amountCents: number;
    label: string;
    note: string | null;
    at: string;
  }>;
  trades: Array<{
    id: string;
    symbol: string;
    side: string;
    reason: string;
    quantity: number;
    priceUsd: number;
    pnlCents: number;
    at: string;
  }>;
  crypto: {
    configured: boolean;
    accepted: string[];
    minConfirmations: number;
    deposits: Array<{
      id: string;
      tokenSymbol: string;
      amountRaw: string;
      amountCents: number | null;
      confirmations: number;
      credited: boolean;
      txHash: string;
      at: string;
    }>;
  };
  demo: { enabled: boolean };
};

export async function buildAccountPayload(user: {
  id: string;
  name: string;
  email: string;
  emailVerified: Date | null;
  account: { id: string; vibe: Vibe; status: string } | null;
}): Promise<AccountPayload | null> {
  if (!user.account) return null;

  const accountId = user.account.id;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [summary, entries, trades, dayTrades, deposits] = await Promise.all([
    summarise(accountId),
    prisma.ledgerEntry.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.demoTrade.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.demoTrade.findMany({
      where: { accountId, createdAt: { gte: since } },
      select: { pnlCents: true },
    }),
    prisma.cryptoDeposit.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const todayPnlCents = dayTrades.reduce((total, trade) => total + trade.pnlCents, 0);
  const openingBalance = summary.balanceCents - todayPnlCents;
  const todayPct = openingBalance > 0 ? (todayPnlCents / openingBalance) * 100 : 0;

  return {
    user: {
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified !== null,
    },
    account: {
      vibe: user.account.vibe,
      vibeLabel: VIBE_LABEL[user.account.vibe],
      vibeNote: VIBE_NOTE[user.account.vibe],
      status: user.account.status,
      ...summary,
      todayPnlCents,
      todayPct,
    },
    positions: positionsFor(user.account.vibe, summary.balanceCents),
    activity: entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amountCents: entry.amountCents,
      label: entry.label,
      note: entry.note,
      at: entry.createdAt.toISOString(),
    })),
    trades: trades.map((trade) => ({
      id: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      reason: trade.reason,
      quantity: trade.quantity,
      priceUsd: trade.priceUsd,
      pnlCents: trade.pnlCents,
      at: trade.createdAt.toISOString(),
    })),
    crypto: {
      configured: cryptoConfigured(),
      accepted: acceptedTokens(),
      minConfirmations: minConfirmations(),
      deposits: deposits.map((deposit) => ({
        id: deposit.id,
        tokenSymbol: deposit.tokenSymbol,
        amountRaw: deposit.amountRaw,
        amountCents: deposit.amountCents,
        confirmations: deposit.confirmations,
        credited: deposit.creditedAt !== null,
        txHash: deposit.txHash,
        at: deposit.createdAt.toISOString(),
      })),
    },
    demo: { enabled: demoEnabled() },
  };
}
