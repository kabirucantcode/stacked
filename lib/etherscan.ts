/**
 * Etherscan client for detecting incoming crypto transfers.
 *
 * Uses the v2 API (`?chainid=…&apikey=…`), which is what Etherscan now requires;
 * the old keyless endpoints are gone. Reads are watch-only — we never handle
 * keys here, only public addresses, so a compromise of this service cannot move
 * funds.
 */

export type IncomingTransfer = {
  txHash: string;
  /** "native" for ETH, otherwise the lower-cased token contract address. */
  assetKey: string;
  fromAddress: string;
  tokenSymbol: string;
  decimals: number;
  value: bigint;
  confirmations: number;
};

type EtherscanRow = {
  hash?: string;
  from?: string;
  to?: string;
  value?: string;
  isError?: string;
  confirmations?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  contractAddress?: string;
};

const DEFAULT_API = "https://api.etherscan.io/v2/api";

export function etherscanConfigured(): boolean {
  return Boolean(process.env.ETHERSCAN_API_KEY);
}

function toBigInt(value: string | undefined): bigint {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
}

async function call(chainId: number, params: Record<string, string>): Promise<EtherscanRow[]> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) return [];

  const url = new URL(process.env.ETHERSCAN_API_URL ?? DEFAULT_API);
  url.searchParams.set("chainid", String(chainId));
  url.searchParams.set("apikey", apiKey);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Etherscan responded ${response.status}`);

  const payload = (await response.json()) as {
    status?: string;
    message?: string;
    result?: unknown;
  };

  if (!Array.isArray(payload.result)) {
    // Both "No transactions found" and rate limiting land here, and neither is
    // an error worth failing a sync over.
    if (payload.message && !/no transactions/i.test(payload.message)) {
      console.warn(`[crypto] Etherscan said: ${payload.message}`);
    }
    return [];
  }

  return payload.result as EtherscanRow[];
}

export async function fetchIncomingTransfers(
  address: string,
  chainId = 1,
): Promise<IncomingTransfer[]> {
  const target = address.toLowerCase();
  const common = {
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "200",
    sort: "desc",
  };

  const [native, tokens] = await Promise.all([
    call(chainId, { module: "account", action: "txlist", ...common }),
    call(chainId, { module: "account", action: "tokentx", ...common }),
  ]);

  const transfers: IncomingTransfer[] = [];

  for (const row of native) {
    if (!row.hash || !row.to || row.to.toLowerCase() !== target) continue;
    if (row.isError === "1") continue;
    const value = toBigInt(row.value);
    if (value <= 0n) continue;

    transfers.push({
      txHash: row.hash,
      assetKey: "native",
      fromAddress: (row.from ?? "").toLowerCase(),
      tokenSymbol: (process.env.CRYPTO_NATIVE_SYMBOL ?? "ETH").toUpperCase(),
      decimals: 18,
      value,
      confirmations: Number(row.confirmations ?? 0) || 0,
    });
  }

  for (const row of tokens) {
    if (!row.hash || !row.to || row.to.toLowerCase() !== target) continue;
    const value = toBigInt(row.value);
    if (value <= 0n) continue;

    const contract = (row.contractAddress ?? "").toLowerCase();
    if (!contract) continue;

    transfers.push({
      txHash: row.hash,
      assetKey: contract,
      fromAddress: (row.from ?? "").toLowerCase(),
      tokenSymbol: (row.tokenSymbol ?? "TOKEN").toUpperCase(),
      decimals: Number(row.tokenDecimal ?? 18) || 18,
      value,
      confirmations: Number(row.confirmations ?? 0) || 0,
    });
  }

  return transfers;
}
