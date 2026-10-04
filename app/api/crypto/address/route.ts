import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { assignDepositAddress, chainId, cryptoConfigured, minConfirmations } from "@/lib/crypto";
import { acceptedTokens } from "@/lib/prices";

export const dynamic = "force-dynamic";

/**
 * The signed-in user's receiving address, assigning one on first request.
 * Returns `address: null` when no address pool is configured yet.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const address = await assignDepositAddress(user.id);

  return NextResponse.json({
    configured: cryptoConfigured(),
    chainId: chainId(),
    address: address?.address ?? null,
    accepted: acceptedTokens(),
    minConfirmations: minConfirmations(),
  });
}
