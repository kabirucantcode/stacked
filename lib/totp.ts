import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP, implemented against Node's built-in crypto so there is nothing
 * to install. Compatible with Google Authenticator, Authy, 1Password, etc.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DIGITS = 6;
const PERIOD_SECONDS = 30;

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];

  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;

  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/** 160-bit secret, base32-encoded — what an authenticator app expects. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function currentCounter(now = Date.now()): number {
  return Math.floor(now / 1000 / PERIOD_SECONDS);
}

function codeForCounter(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, "0");
}

/**
 * Returns the counter a code matched, or null.
 *
 * Returning the counter (rather than a boolean) is what lets the caller reject a
 * code that was already used — otherwise a code could be replayed for its whole
 * 30-second window. `window` allows one step of clock drift either way.
 */
export function matchTotpCounter(secret: string, token: string, window = 1): number | null {
  const candidate = token.replace(/\D/g, "");
  if (candidate.length !== DIGITS) return null;

  const centre = currentCounter();
  for (let offset = -window; offset <= window; offset += 1) {
    const counter = centre + offset;
    const expected = codeForCounter(secret, counter);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))) return counter;
  }

  return null;
}

export function otpauthUrl(secret: string, account: string, issuer = "stacked"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
