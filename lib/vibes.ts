/**
 * Risk vibes, their user-facing copy, and the illustrative target allocation
 * each one maps to.
 *
 * The allocation here is a *Phase 0 placeholder*: the dashboard renders it from
 * `balance × weight` so the UI is meaningful before a broker is connected.
 * Phase 2 replaces `VIBE_ALLOCATION` with real, versioned strategies and the
 * dashboard reads actual positions from the broker.
 */

export const VIBES = ["CHILL", "BALANCED", "FULL_SEND"] as const;
export type Vibe = (typeof VIBES)[number];

export const VIBE_LABEL: Record<Vibe, string> = {
  CHILL: "Chill",
  BALANCED: "Balanced",
  FULL_SEND: "Full send",
};

export const VIBE_NOTE: Record<Vibe, string> = {
  CHILL: "Slow and steady. Smaller moves, fewer surprises.",
  BALANCED: "A mix of steady positions and bolder ones.",
  FULL_SEND: "More active, more volatile. Bigger swings both ways.",
};

/** Accepts the marketing site's labels ("Chill", "full send", "FULL_SEND"…). */
export function toVibe(input: string | null | undefined): Vibe | null {
  if (!input) return null;
  const needle = input.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (needle === "chill") return "CHILL";
  if (needle === "balanced") return "BALANCED";
  if (needle === "fullsend") return "FULL_SEND";
  return null;
}

export function isVibe(value: unknown): value is Vibe {
  return typeof value === "string" && (VIBES as readonly string[]).includes(value);
}

export type Allocation = { symbol: string; weight: number; why: string };

export const VIBE_ALLOCATION: Record<Vibe, Allocation[]> = {
  CHILL: [
    { symbol: "NVDA", weight: 30, why: "earnings momentum" },
    { symbol: "MSFT", weight: 25, why: "steady cash flow, adding" },
    { symbol: "AAPL", weight: 20, why: "dip into support" },
    { symbol: "CASH", weight: 25, why: "dry powder, ready to deploy" },
  ],
  BALANCED: [
    { symbol: "NVDA", weight: 25, why: "earnings momentum" },
    { symbol: "BTC", weight: 20, why: "took profit at resistance" },
    { symbol: "MSFT", weight: 15, why: "steady cash flow, adding" },
    { symbol: "TSLA", weight: 10, why: "volatility spike, trimming" },
    { symbol: "CASH", weight: 30, why: "dry powder, ready to deploy" },
  ],
  FULL_SEND: [
    { symbol: "TSLA", weight: 25, why: "volatility spike, trimming" },
    { symbol: "BTC", weight: 20, why: "took profit at resistance" },
    { symbol: "SOL", weight: 15, why: "cutting risk before news" },
    { symbol: "NVDA", weight: 10, why: "earnings momentum" },
    { symbol: "CASH", weight: 30, why: "dry powder, ready to deploy" },
  ],
};

/** Static reference prices used only to show a believable quantity per position. */
export const REFERENCE_PRICE: Record<string, number> = {
  NVDA: 118,
  BTC: 64200,
  AAPL: 226,
  TSLA: 248,
  ETH: 2650,
  MSFT: 420,
  SOL: 148,
  AMZN: 185,
};

/**
 * Version stamp for the risk disclosure a user acknowledges. Bump this whenever
 * the disclosure wording changes so the audit trail stays meaningful.
 */
export const DISCLOSURE_VERSION = "2026-01-risk-1";
