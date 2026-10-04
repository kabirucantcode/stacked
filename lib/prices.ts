/**
 * USD pricing for incoming crypto.
 *
 * Deliberately conservative: a deposit whose price we don't know is *recorded*
 * but never credited, because crediting at a guessed price would silently move
 * money. In production this should be a proper oracle (Chainlink, a CEX feed)
 * with staleness checks — not an environment variable.
 */

const STABLECOINS = new Set(["USDC", "USDT", "DAI", "BUSD", "TUSD", "USDP"]);

let cache: { raw: string | undefined; parsed: Record<string, number> } = {
  raw: undefined,
  parsed: {},
};

function overrides(): Record<string, number> {
  const raw = process.env.CRYPTO_USD_PRICES;
  if (cache.raw === raw) return cache.parsed;

  const parsed: Record<string, number> = {};
  for (const pair of (raw ?? "").split(",")) {
    const [symbol, value] = pair.split("=");
    const price = Number(value);
    if (symbol?.trim() && Number.isFinite(price) && price > 0) {
      parsed[symbol.trim().toUpperCase()] = price;
    }
  }

  cache = { raw, parsed };
  return parsed;
}

/** Returns null when we have no trustworthy price, meaning "do not credit yet". */
export function usdPrice(symbol: string): number | null {
  const key = symbol.trim().toUpperCase();
  const configured = overrides();
  if (key in configured) return configured[key];
  if (STABLECOINS.has(key)) return 1;
  return null;
}

/**
 * Convert raw base units to USD cents using integer maths.
 * `raw * priceCents / 10^decimals` — BigInt throughout so uint256 values survive.
 */
export function toUsdCents(amountRaw: string, decimals: number, priceUsd: number): number {
  const priceCents = BigInt(Math.round(priceUsd * 100));
  const divisor = 10n ** BigInt(Math.max(0, decimals));
  const cents = (BigInt(amountRaw) * priceCents) / divisor;
  return cents > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(cents);
}

export function acceptedTokens(): string[] {
  const raw = process.env.CRYPTO_ACCEPTED_TOKENS ?? "USDC,USDT,DAI,ETH";
  return raw
    .split(",")
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean);
}

export function isAcceptedToken(symbol: string): boolean {
  return acceptedTokens().includes(symbol.trim().toUpperCase());
}
