/** Money helpers. Cents in, human strings out. Shared by server and client. */

export function formatMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = abs % 100 === 0;
  const body = (abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${negative ? "-" : ""}$${body}`;
}

export function formatSignedMoney(cents: number): string {
  return `${cents >= 0 ? "+" : "-"}$${formatMoney(Math.abs(cents)).slice(1)}`;
}

export function formatPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** "1,234.50" or "$1,234" → integer cents. NaN when unparseable. */
export function dollarsToCents(input: string | number): number {
  const n = typeof input === "number" ? input : Number(String(input).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return Number.NaN;
  return Math.round(n * 100);
}

export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}
