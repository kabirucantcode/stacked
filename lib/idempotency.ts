import { isUniqueViolation } from "./prisma-errors";
import { prisma } from "./prisma";

/**
 * Idempotency for money-moving endpoints.
 *
 * The client sends a unique key per *intent* (the dashboard generates one with
 * `crypto.randomUUID()` when the dialog opens, not per click). The unique
 * constraint on `(scope, key)` is the lock: whichever request inserts the row
 * first performs the operation, and everyone else replays the stored result.
 *
 * That makes a double-click, a retried fetch, or an impatient refresh a no-op
 * instead of a second credit.
 */

export type IdempotentResult<T> = { replayed: boolean; status: number; body: T };

export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("idempotency-key");
  if (!raw) return null;
  const key = raw.trim();
  // Bounded so a caller can't stuff arbitrary data into the table.
  if (key.length < 8 || key.length > 200) return null;
  return key;
}

export async function withIdempotency<T>(
  scope: string,
  key: string,
  run: () => Promise<{ status: number; body: T }>,
): Promise<IdempotentResult<T>> {
  try {
    await prisma.idempotencyKey.create({ data: { scope, key } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    const existing = await prisma.idempotencyKey.findUnique({
      where: { scope_key: { scope, key } },
    });

    if (existing && existing.status !== null && existing.response !== null) {
      return {
        replayed: true,
        status: existing.status,
        body: JSON.parse(existing.response) as T,
      };
    }

    // Claimed by a request that is still in flight.
    return {
      replayed: true,
      status: 409,
      body: { error: "A request with this idempotency key is already in progress." } as T,
    };
  }

  const result = await run();

  await prisma.idempotencyKey.update({
    where: { scope_key: { scope, key } },
    data: {
      status: result.status,
      response: JSON.stringify(result.body),
      completedAt: new Date(),
    },
  });

  return { replayed: false, status: result.status, body: result.body };
}
