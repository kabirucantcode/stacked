import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { REFERENCE_PRICE } from "@/lib/vibes";

export const dynamic = "force-dynamic";

/**
 * Endpoint for testing / demo crypto deposits in Phase 0/1.
 * Allows depositing simulated ETH to test the full lifecycle:
 * deposit crypto -> updates wallet ledger -> demo trade engine executes -> balance moves up with profits.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user?.account) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { amountEth?: number } = {};
  try {
    body = (await request.json()) as { amountEth?: number };
  } catch {
    /* body optional, defaults to 0.1 ETH */
  }

  const amountEth = Number(body.amountEth) > 0 ? Number(body.amountEth) : 0.1;
  const ethPriceUsd = REFERENCE_PRICE.ETH ?? 2650;
  const amountCents = Math.round(amountEth * ethPriceUsd * 100);

  const accountId = user.account.id;
  const fakeTxHash = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("")}`;

  try {
    const [cryptoDeposit, ledgerEntry] = await prisma.$transaction(async (tx) => {
      const deposit = await tx.cryptoDeposit.create({
        data: {
          accountId,
          chainId: 1,
          txHash: fakeTxHash,
          assetKey: "native",
          fromAddress: "0x388C818CA8B9251b393131C08a73683246A16633",
          tokenSymbol: "ETH",
          decimals: 18,
          amountRaw: BigInt(Math.round(amountEth * 1e18)).toString(),
          amountCents,
          confirmations: 12,
          creditedAt: new Date(),
        },
      });

      const ledger = await tx.ledgerEntry.create({
        data: {
          accountId,
          type: "DEPOSIT",
          amountCents,
          label: "Crypto deposit (ETH) — Demo",
          note: `Simulated on-chain ETH deposit (${amountEth} ETH @ $${ethPriceUsd.toLocaleString()})`,
        },
      });

      return [deposit, ledger];
    });

    return NextResponse.json({
      ok: true,
      amountEth,
      amountCents,
      cryptoDeposit,
      ledgerEntry,
    });
  } catch (error) {
    console.error("demo crypto deposit failed", error);
    return NextResponse.json(
      { error: "Could not create demo deposit." },
      { status: 500 },
    );
  }
}
