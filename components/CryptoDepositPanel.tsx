"use client";

import { useEffect, useState } from "react";

type AddressInfo = {
  configured: boolean;
  chainId: number;
  address: string | null;
  accepted: string[];
  minConfirmations: number;
};

export type PanelDeposit = {
  id: string;
  tokenSymbol: string;
  amountCents: number | null;
  confirmations: number;
  credited: boolean;
  txHash: string;
};

const NETWORK_NAME: Record<number, string> = {
  1: "Ethereum mainnet",
  11155111: "Sepolia testnet",
};

/**
 * Deposit panel. Shows the user's assigned receiving address and lets them
 * trigger a scan for new transfers.
 *
 * This is watch-only: the app never holds a private key, so it can display an
 * address but cannot move funds.
 */
export default function CryptoDepositPanel({
  open,
  onClose,
  onCredited,
  deposits,
  minConfirmations,
}: {
  open: boolean;
  onClose: () => void;
  onCredited: () => void;
  deposits: PanelDeposit[];
  minConfirmations: number;
}) {
  const [info, setInfo] = useState<AddressInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/crypto/address", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setError("We couldn't load your deposit address.");
          return;
        }
        const payload = (await response.json()) as AddressInfo;
        if (!cancelled) setInfo(payload);
      } catch {
        if (!cancelled) setError("We couldn't load your deposit address.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function check() {
    setBusy(true);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/crypto/sync", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        credited?: number;
        awaitingConfirmations?: number;
        unpriced?: number;
      };
      setBusy(false);

      if (!response.ok) {
        setError(payload.error ?? "We couldn't check for deposits right now.");
        return;
      }

      const credited = payload.credited ?? 0;
      const waiting = payload.awaitingConfirmations ?? 0;
      const unpriced = payload.unpriced ?? 0;

      if (credited > 0) {
        setStatus(`Credited ${credited} deposit${credited === 1 ? "" : "s"}.`);
        onCredited();
      } else if (waiting > 0) {
        setStatus(
          `${waiting} transfer${waiting === 1 ? "" : "s"} waiting for ${minConfirmations}+ confirmations.`,
        );
      } else if (unpriced > 0) {
        setStatus(
          `${unpriced} transfer${unpriced === 1 ? "" : "s"} found, but we don't have a USD price for that token yet.`,
        );
      } else {
        setStatus("No new deposits yet.");
      }
    } catch {
      setBusy(false);
      setError("We couldn't reach the server.");
    }
  }

  async function copy() {
    if (!info?.address) return;
    try {
      await navigator.clipboard.writeText(info.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the address is still selectable */
    }
  }

  async function depositDemoEth(amountEth: number) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/crypto/demo-deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountEth }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        amountCents?: number;
      };
      setBusy(false);
      if (!response.ok) {
        setError(payload.error ?? "Could not deposit demo ETH.");
        return;
      }
      const dollars = ((payload.amountCents ?? 0) / 100).toLocaleString("en-US", {
        maximumFractionDigits: 2,
      });
      setStatus(`Credited demo deposit of ${amountEth} ETH (+$${dollars}).`);
      onCredited();
    } catch {
      setBusy(false);
      setError("We couldn't reach the server.");
    }
  }

  if (!open) return null;

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Deposit crypto"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="paper">
        <h1>
          add <span className="serif">money.</span>
        </h1>
        <p className="lede">
          Send crypto to your own address. It lands in your balance once it has enough confirmations.
        </p>

        {error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : null}

        {!info ? (
          <p className="hint">Loading your address…</p>
        ) : !info.configured ? (
          <div className="alert" role="alert">
            Deposits aren&apos;t switched on yet — no receiving address has been configured. Ask an
            admin to set <span className="mono">DEPOSIT_ADDRESSES</span> and{" "}
            <span className="mono">ETHERSCAN_API_KEY</span>.
          </div>
        ) : info.address ? (
          <>
            <label className="field">
              your deposit address
              <input type="text" readOnly value={info.address} onFocus={(e) => e.target.select()} />
            </label>
            <div className="mrow" style={{ marginTop: 12 }}>
              <button className="chip" type="button" onClick={() => void copy()}>
                {copied ? "copied" : "copy address"}
              </button>
            </div>

            <p className="hint" style={{ marginTop: 18 }}>
              Network: <strong>{NETWORK_NAME[info.chainId] ?? `chain ${info.chainId}`}</strong>. Send
              only <strong>{info.accepted.join(", ")}</strong> — anything else is unrecoverable.
            </p>

            {status ? (
              <div className="alert ok" role="status">
                {status}
              </div>
            ) : null}

            <div className="mrow">
              <button className="btn dark" type="button" disabled={busy} onClick={() => void check()}>
                {busy ? "checking…" : "check for deposits"}
              </button>
              <button className="lnk" type="button" onClick={onClose}>
                close
              </button>
            </div>
          </>
        ) : (
          <div className="alert" role="alert">
            No deposit address is available right now — the pool is empty. Ask an admin to add more
            addresses.
          </div>
        )}

        <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(0,0,0,0.12)" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 18 }}>demo deposit (sandbox)</h3>
          <p className="hint" style={{ margin: "0 0 12px" }}>
            Isolate and test the trading loop: simulate an incoming ETH deposit without on-chain gas.
          </p>
          <div className="chips">
            <button
              className="chip"
              type="button"
              disabled={busy}
              onClick={() => void depositDemoEth(0.1)}
            >
              +0.1 ETH (~$265)
            </button>
            <button
              className="chip"
              type="button"
              disabled={busy}
              onClick={() => void depositDemoEth(0.5)}
            >
              +0.5 ETH (~$1,325)
            </button>
            <button
              className="chip"
              type="button"
              disabled={busy}
              onClick={() => void depositDemoEth(1.0)}
            >
              +1.0 ETH (~$2,650)
            </button>
          </div>
          {!info?.address ? (
            <div className="mrow" style={{ marginTop: 14 }}>
              <button className="lnk" type="button" onClick={onClose}>
                close
              </button>
            </div>
          ) : null}
        </div>

        {deposits.length > 0 ? (
          <>
            <h3 style={{ marginTop: 26, fontSize: 20 }}>recent transfers</h3>
            <ul className="act">
              {deposits.map((deposit) => (
                <li key={deposit.id}>
                  <span>
                    <span className="what">{deposit.tokenSymbol}</span>
                    <span className="when mono">
                      {deposit.credited
                        ? "credited"
                        : `${deposit.confirmations}/${minConfirmations} confirmations`}
                    </span>
                  </span>
                  <span className={`amt${deposit.credited ? "" : " neg"}`}>
                    {deposit.amountCents !== null
                      ? `+$${(deposit.amountCents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <p className="foot mono muted">
          Addresses are watch-only — this app can see deposits but never holds a key that could move
          funds.
        </p>
      </div>
    </div>
  );
}
