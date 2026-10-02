import { z } from "zod";

import { VIBES } from "./vibes";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .email("That email doesn't look right.");

export const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, "Your password needs at least 8 characters."),
  name: z.string().trim().min(1, "We need a name for the account.").max(120),
  phone: z.string().trim().max(40).optional(),
  /** Free-form label from the onboarding UI ("Chill" / "Full send" …). */
  vibe: z.string().trim().max(40).optional(),
  amountCents: z
    .number()
    .int()
    .min(100, "Enter an amount of at least $1.")
    .max(10_000_000, "That's above the sandbox limit."),
  acknowledgedRisk: z.literal(true, {
    errorMap: () => ({ message: "Please acknowledge the risk before continuing." }),
  }),
});

export const waitlistSchema = z.object({
  email: emailSchema,
  name: z.string().trim().max(120).optional(),
  vibe: z.string().trim().max(40).optional(),
  /** Whole dollars, as sent by the marketing modal. */
  amount: z.number().int().positive().max(10_000_000).optional(),
});

export const moveSchema = z.object({
  direction: z.enum(["deposit", "withdraw"]),
  amountCents: z
    .number()
    .int()
    .min(100, "Enter an amount of at least $1.")
    .max(10_000_000, "That's above the sandbox limit."),
});

export const vibeSchema = z.object({
  vibe: z.enum(VIBES),
});

/** First human-readable message from a failed parse. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check your details and try again.";
}
