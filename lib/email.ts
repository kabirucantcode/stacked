/**
 * Outbound email.
 *
 * Uses Resend's REST API over plain `fetch` so there is no SDK dependency.
 * With no RESEND_API_KEY set (local dev, CI) the message is logged instead of
 * sent, so the whole flow stays testable without an email provider.
 */

const DEFAULT_FROM = "stacked <onboarding@resend.dev>";

export function appUrl(): string {
  const raw =
    process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

export type OutboundEmail = { to: string; subject: string; text: string };

export async function sendEmail({ to, subject, text }: OutboundEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.info(
      `[email] RESEND_API_KEY not set — logging instead of sending\n` +
        `To:      ${to}\n` +
        `Subject: ${subject}\n\n${text}\n`,
    );
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
      to,
      subject,
      text,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend rejected the email (${response.status}): ${detail.slice(0, 300)}`);
  }
}

/* ---- templates ------------------------------------------------------- */

export function verificationEmail(firstName: string, url: string): { subject: string; text: string } {
  return {
    subject: "Confirm your email for stacked.",
    text:
      `Hey ${firstName},\n\n` +
      `Confirm your email so we can send you trade receipts and statements:\n\n` +
      `${url}\n\n` +
      `This link expires in 24 hours. If you didn't create a stacked account, ignore this email.\n`,
  };
}

export function passwordResetEmail(firstName: string, url: string): { subject: string; text: string } {
  return {
    subject: "Reset your stacked password",
    text:
      `Hey ${firstName},\n\n` +
      `Someone asked to reset the password on your stacked account. If that was you:\n\n` +
      `${url}\n\n` +
      `This link expires in 1 hour and can only be used once. If it wasn't you, nothing has\n` +
      `changed and you can ignore this email.\n`,
  };
}
