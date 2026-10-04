import { NextResponse } from "next/server";

import { buildAccountPayload } from "@/lib/account-payload";
import { getSessionUser } from "@/lib/auth";
import { maybeExecuteDemoTrade } from "@/lib/demo-trading";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * The dashboard's heartbeat.
 *
 * Executes at most one demo trade (respecting the cooldown) and returns the
 * fresh account payload. Server-authoritative on purpose: the trade and the
 * balance change are persisted, so two open tabs can't disagree.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.account) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const limit = rateLimit(clientKey(request, "demo-tick"), 30, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Slow down a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const trade = await maybeExecuteDemoTrade(user.account.id);
  const payload = await buildAccountPayload(user);
  if (!payload) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  return NextResponse.json({
    ...payload,
    tick: { executed: trade !== null, trade },
  });
}
