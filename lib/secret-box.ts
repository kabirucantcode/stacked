import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Sealed secrets — currently just the TOTP secret.
 *
 * AES-256-GCM with a key derived via HKDF from TOTP_ENCRYPTION_KEY (falling back
 * to AUTH_SECRET). Storing a TOTP secret in plaintext would mean a database leak
 * hands over the second factor, so it is encrypted at rest.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>`, base64url throughout.
 */

const VERSION = "v1";
const SALT = "stacked:secret-box:v1";
const INFO = "totp";

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const material = process.env.TOTP_ENCRYPTION_KEY ?? process.env.AUTH_SECRET;
  if (!material) {
    throw new Error(
      "Cannot store a 2FA secret: set TOTP_ENCRYPTION_KEY (or AUTH_SECRET) first.",
    );
  }

  cachedKey = Buffer.from(
    hkdfSync("sha256", Buffer.from(material), Buffer.from(SALT), Buffer.from(INFO), 32),
  );
  return cachedKey;
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function openSecret(sealed: string): string {
  const [version, ivPart, tagPart, dataPart] = sealed.split(".");
  if (version !== VERSION || !ivPart || !tagPart || !dataPart) {
    throw new Error("Unrecognised sealed-secret format.");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
