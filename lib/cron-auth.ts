import { timingSafeEqual } from "node:crypto";

/**
 * Authorisation for the scheduler endpoints.
 *
 * These are meant to be called by a Render cron job (or any scheduler) with a
 * shared secret, never by a browser. Without CRON_SECRET set they refuse
 * everything, so an unconfigured deployment can't be triggered by a stranger.
 */
export function cronAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header =
    request.headers.get("authorization") ?? request.headers.get("x-cron-secret") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;

  if (presented.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}
