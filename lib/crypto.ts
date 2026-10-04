import { etherscanConfigured, fetchIncomingTransfers } from "./etherscan";
import { isAcceptedToken, toUsdCents, usdPrice } from "./prices";
import { isUniqueViolation } from "./prisma-errors";
import { prisma } from "./prisma";

/**
 * Crypto deposits.
 *
 * Flow: the user is assigned one receiving address (pre-generated in a custody
 * wallet and listed in DEPOSIT_ADDRESSES). We scan that address with Etherscan;
 * every incoming transfer becomes a CryptoDeposit row — unique on
 * `(chainId, txHash, assetKey)`, which is what stops a re-scan from crediting
 * twice. Once a transfer has enough confirmations *and* we know its USD price,
 * a conditional update flips `creditedAt` and writes the ledger entry in the
 * same transaction.
 *
 * Addresses are watch-only. Nothing here can move funds.
 */

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function chainId(): number {
  const raw = Number(process.env.CRYPTO_CHAIN_ID ?? 1);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
}

export function minConfirmations(): number {
  const raw = Number(process.env.CRYPTO_MIN_CONFIRMATIONS ?? 3);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 3;
}

export function configuredAddresses(): string[] {
  return (process.env.DEPOSIT_ADDRESSES ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter((address) => ADDRESS_RE.test(address));
}

export function cryptoConfigured(): boolean {
  return etherscanConfigured() && configuredAddresses().length > 0;
}

/** Sync the DEPOSIT_ADDRESSES list into the pool. Idempotent. */
export async function ensureAddressPool(): Promise<number> {
  let added = 0;
  for (const address of configuredAddresses()) {
    const existing = await prisma.depositAddress.findUnique({ where: { address } });
    if (existing) continue;
    await prisma.depositAddress.create({ data: { address, chainId: chainId() } });
    added += 1;
  }
  return added;
}

/** Assign this user a free address, if one is available and they don't have one. */
export async function assignDepositAddress(userId: string) {
  const existing = await prisma.depositAddress.findUnique({ where: { userId } });
  if (existing) return existing;

  await ensureAddressPool();

  // Retry the compare-and-set: another request may claim the same row first.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await prisma.depositAddress.findFirst({
      where: { userId: null },
      orderBy: { createdAt: "asc" },
    });
    if (!candidate) return null;

    const claimed = await prisma.depositAddress.updateMany({
      where: { id: candidate.id, userId: null },
      data: { userId, assignedAt: new Date() },
    });
    if (claimed.count === 1) {
      return prisma.depositAddress.findUnique({ where: { id: candidate.id } });
    }
  }

  return null;
}

export type SyncResult = {
  scanned: number;
  credited: number;
  awaitingConfirmations: number;
  unpriced: number;
};

export async function syncCryptoDeposits(accountId: string): Promise<SyncResult> {
  const result: SyncResult = {
    scanned: 0,
    credited: 0,
    awaitingConfirmations: 0,
    unpriced: 0,
  };

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, userId: true },
  });
  if (!account) return result;

  const address = await prisma.depositAddress.findUnique({ where: { userId: account.userId } });
  if (!address) return result;

  const transfers = await fetchIncomingTransfers(address.address, address.chainId);
  result.scanned = transfers.length;

  for (const transfer of transfers) {
    if (!isAcceptedToken(transfer.tokenSymbol)) continue;

    const unique = {
      chainId: address.chainId,
      txHash: transfer.txHash,
      assetKey: transfer.assetKey,
    };

    let row = await prisma.cryptoDeposit.findUnique({
      where: { chainId_txHash_assetKey: unique },
    });

    if (!row) {
      try {
        row = await prisma.cryptoDeposit.create({
          data: {
            ...unique,
            accountId,
            fromAddress: transfer.fromAddress,
            tokenSymbol: transfer.tokenSymbol,
            decimals: transfer.decimals,
            amountRaw: transfer.value.toString(),
            confirmations: transfer.confirmations,
          },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        continue; // Another sync won the race; it owns this transfer.
      }
    } else if (row.confirmations !== transfer.confirmations) {
      row = await prisma.cryptoDeposit.update({
        where: { id: row.id },
        data: { confirmations: transfer.confirmations },
      });
    }

    if (!row || row.creditedAt) continue;

    if (row.confirmations < minConfirmations()) {
      result.awaitingConfirmations += 1;
      continue;
    }

    const price = usdPrice(row.tokenSymbol);
    if (price === null) {
      result.unpriced += 1;
      continue;
    }

    const amountCents = toUsdCents(row.amountRaw, row.decimals, price);
    if (amountCents <= 0) continue;

    const depositId = row.id;
    const symbol = row.tokenSymbol;

    const credited = await prisma.$transaction(async (tx) => {
      // Only the caller that flips `creditedAt` from null may write the ledger
      // entry, so a concurrent sync cannot double-credit.
      const claim = await tx.cryptoDeposit.updateMany({
        where: { id: depositId, creditedAt: null },
        data: { creditedAt: new Date(), amountCents },
      });
      if (claim.count !== 1) return false;

      await tx.ledgerEntry.create({
        data: {
          accountId,
          type: "DEPOSIT",
          amountCents,
          label: `Crypto deposit (${symbol})`,
          note: `On-chain ${address.chainId}:${transfer.txHash}`,
        },
      });
      return true;
    });

    if (credited) result.credited += 1;
  }

  return result;
}

/** Used by the scheduler endpoint to sweep every funded account. */
export async function syncAllDeposits(): Promise<{ accounts: number; credited: number }> {
  const addresses = await prisma.depositAddress.findMany({
    where: { userId: { not: null } },
    select: { user: { select: { account: { select: { id: true } } } } },
  });

  let accounts = 0;
  let credited = 0;

  for (const row of addresses) {
    const id = row.user?.account?.id;
    if (!id) continue;
    accounts += 1;
    try {
      const result = await syncCryptoDeposits(id);
      credited += result.credited;
    } catch (error) {
      console.error("deposit sync failed for account", id, error);
    }
  }

  return { accounts, credited };
}
