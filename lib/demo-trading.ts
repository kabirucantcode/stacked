import { summarise } from "./ledger";
import { prisma } from "./prisma";
import { REFERENCE_PRICE } from "./vibes";

/**
 * DEMO trading engine.
 *
 * This is explicitly *not* a trading system: there is no broker, no order, no
 * fill and no market data. It picks an idea, invents a plausible P&L, and writes
 * a TRADE ledger entry so the dashboard has something real to read from the
 * database. Every entry it creates says so in its `note`.
 *
 * The real engine (routing to a broker/custodian) is deliberately last.
 */

export function demoEnabled(): boolean {
  return process.env.DEMO_TRADING !== "false";
}

export function cooldownMs(): number {
  const raw = Number(process.env.DEMO_TRADE_COOLDOWN_MS ?? 6000);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 6000;
}

const IDEAS: ReadonlyArray<readonly [string, "BUY" | "SELL", string]> = [
  ["NVDA", "BUY", "earnings momentum"],
  ["BTC", "SELL", "took profit at resistance"],
  ["AAPL", "BUY", "dip into support"],
  ["TSLA", "SELL", "volatility spike, trimming"],
  ["ETH", "BUY", "breakout on volume"],
  ["MSFT", "BUY", "steady cash flow, adding"],
  ["SOL", "SELL", "cutting risk before news"],
  ["AMZN", "BUY", "post-earnings pullback"],
];

export type ExecutedTrade = {
  symbol: string;
  side: string;
  reason: string;
  quantity: number;
  priceUsd: number;
  pnlCents: number;
  createdAt: Date;
};

export async function executeDemoTrade(accountId: string): Promise<ExecutedTrade | null> {
  const { balanceCents } = await summarise(accountId);
  if (balanceCents <= 0) return null; // nothing to trade with

  const [symbol, side, reason] = IDEAS[Math.floor(Math.random() * IDEAS.length)];
  const priceUsd = (REFERENCE_PRICE[symbol] ?? 100) * (1 + (Math.random() - 0.5) * 0.02);
  const notionalCents = Math.round(balanceCents * (0.02 + Math.random() * 0.05));
  const quantity = Number((notionalCents / 100 / priceUsd).toFixed(6));

  // Demo mode: every executed trade produces a profit so the balance and wallet
  // consistently move upwards. Returns between 0.25% and 1.25% profit of balance,
  // with a minimum of at least 1 cent ($0.01).
  const profitRate = 0.0025 + Math.random() * 0.01;
  const pnlCents = Math.max(1, Math.round(balanceCents * profitRate));

  const trade = await prisma.$transaction(async (tx) => {
    const created = await tx.demoTrade.create({
      data: { accountId, symbol, side, reason, quantity, priceUsd, pnlCents },
    });

    if (pnlCents !== 0) {
      await tx.ledgerEntry.create({
        data: {
          accountId,
          type: "TRADE",
          amountCents: pnlCents,
          label: `${side === "BUY" ? "Bought" : "Sold"} ${symbol}`,
          note: "Demo trade — simulated, not real money.",
        },
      });
    }

    return created;
  });

  return {
    symbol: trade.symbol,
    side: trade.side,
    reason: trade.reason,
    quantity: trade.quantity,
    priceUsd: trade.priceUsd,
    pnlCents: trade.pnlCents,
    createdAt: trade.createdAt,
  };
}

/** Execute at most one trade, respecting the cooldown. Returns null if skipped. */
export async function maybeExecuteDemoTrade(accountId: string): Promise<ExecutedTrade | null> {
  if (!demoEnabled()) return null;

  const last = await prisma.demoTrade.findFirst({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (last && Date.now() - last.createdAt.getTime() < cooldownMs()) return null;

  return executeDemoTrade(accountId);
}

/** Used by the scheduler endpoint: one trade per funded account. */
export async function runDemoTradesForAll(): Promise<{ accounts: number; traded: number }> {
  if (!demoEnabled()) return { accounts: 0, traded: 0 };

  const accounts = await prisma.account.findMany({ select: { id: true } });
  let traded = 0;

  for (const account of accounts) {
    try {
      const trade = await maybeExecuteDemoTrade(account.id);
      if (trade) traded += 1;
    } catch (error) {
      console.error("demo trade failed for account", account.id, error);
    }
  }

  return { accounts: accounts.length, traded };
}
