import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { syncCryptoDeposits } from "@/lib/crypto";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Scan the user's address for new transfers and credit any that are confirmed
 * and priced. Safe to call repeatedly — crediting is guarded by the unique
 * (chainId, txHash, assetKey) constraint plus a conditional update.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.account) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Each call may hit Etherscan twice, so keep it modest.
  const limit = rateLimit(clientKey(request, "crypto-sync"), 12, 5 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "We checked a moment ago. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const result = await syncCryptoDeposits(user.account.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("crypto sync failed", error);
    return NextResponse.json(
      { error: "We couldn't reach the network right now. Try again shortly." },
      { status: 502 },
    );
  }
}
