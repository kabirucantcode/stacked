"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";

import CryptoDepositPanel from "@/components/CryptoDepositPanel";
import { dollarsToCents, formatMoney, formatPct, formatSignedMoney } from "@/lib/format";

type VibeKey = "CHILL" | "BALANCED" | "FULL_SEND";

type Position = {
  symbol: string;
  label: string;
  weight: number;
  why: string;
  valueCents: number;
  quantity: number | null;
  price: number | null;
};

type ActivityEntry = {
  id: string;
  type: string;
  amountCents: number;
  label: string;
  note: string | null;
  at: string;
};

type DemoTrade = {
  id: string;
  symbol: string;
  side: string;
  reason: string;
  quantity: number;
  priceUsd: number;
  pnlCents: number;
  at: string;
};

type CryptoDeposit = {
  id: string;
  tokenSymbol: string;
  amountRaw: string;
  amountCents: number | null;
  confirmations: number;
  credited: boolean;
  txHash: string;
  at: string;
};

type AccountPayload = {
  user: { name: string; email: string; emailVerified: boolean };
  account: {
    vibe: VibeKey;
    vibeLabel: string;
    vibeNote: string;
    status: string;
    balanceCents: number;
    netDepositedCents: number;
    profitLossCents: number;
    todayPnlCents: number;
    todayPct: number;
  };
  positions: Position[];
  activity: ActivityEntry[];
  trades: DemoTrade[];
  crypto: {
    configured: boolean;
    accepted: string[];
    minConfirmations: number;
    deposits: CryptoDeposit[];
  };
  demo: { enabled: boolean };
};

const VIBE_CHOICES: { key: VibeKey; label: string }[] = [
  { key: "CHILL", label: "Chill" },
  { key: "BALANCED", label: "Balanced" },
  { key: "FULL_SEND", label: "Full send" },
];

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Stable, unique-enough key for one money-moving intent. */
function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type WithdrawDialog = { amount: string; error: string | null; busy: boolean; key: string };

export default function Dashboard() {
  const [data, setData] = useState<AccountPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<WithdrawDialog | null>(null);
  const [cryptoOpen, setCryptoOpen] = useState(false);
  const [vibeBusy, setVibeBusy] = useState(false);
  const [resend, setResend] = useState<{
    busy: boolean;
    message: string | null;
    error: string | null;
  }>({ busy: false, message: null, error: null });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/account", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/signin");
        return;
      }
      if (!response.ok) throw new Error("request failed");
      setData((await response.json()) as AccountPayload);
      setLoadError(null);
    } catch {
      setLoadError("We couldn't load your account. Refresh to try again.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Server-authoritative heartbeat: each tick may execute one demo trade and
  // returns fresh state, so two open tabs can't disagree.
  useEffect(() => {
    if (!data?.demo.enabled) return;

    const reduced = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    const period = reduced ? 15000 : 7000;
    let cancelled = false;
    let inFlight = false;

    const timer = window.setInterval(() => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;

      void (async () => {
        try {
          const response = await fetch("/api/demo/tick", { method: "POST", cache: "no-store" });
          if (response.status === 401) {
            window.location.assign("/signin");
            return;
          }
          if (response.ok && !cancelled) {
            setData((await response.json()) as AccountPayload);
          }
        } catch {
          /* a dropped tick isn't worth telling the user about */
        } finally {
          inFlight = false;
        }
      })();
    }, period);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [data?.demo.enabled]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialog(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  async function withdraw() {
    if (!dialog) return;

    const amountCents = dollarsToCents(dialog.amount);
    if (!Number.isFinite(amountCents) || amountCents < 100) {
      setDialog({ ...dialog, error: "Enter an amount of at least $1." });
      return;
    }

    setDialog({ ...dialog, busy: true, error: null });
    try {
      const response = await fetch("/api/account/move", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Same key on retry → the server replays instead of debiting twice.
          "Idempotency-Key": dialog.key,
        },
        body: JSON.stringify({ direction: "withdraw", amountCents }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setDialog({ ...dialog, busy: false, error: payload.error ?? "That didn't work. Try again." });
        return;
      }

      setDialog(null);
      await refresh();
    } catch {
      setDialog({ ...dialog, busy: false, error: "We couldn't reach the server. Try again." });
    }
  }

  async function changeVibe(vibe: VibeKey) {
    if (!data || data.account.vibe === vibe || vibeBusy) return;
    setVibeBusy(true);
    try {
      const response = await fetch("/api/account/vibe", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vibe }),
      });
      if (response.ok) await refresh();
    } finally {
      setVibeBusy(false);
    }
  }

  async function resendVerification() {
    setResend({ busy: true, message: null, error: null });
    try {
      const response = await fetch("/api/auth/resend-verification", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setResend({ busy: false, message: null, error: payload.error ?? "Couldn't send that email." });
        return;
      }
      setResend({ busy: false, message: payload.message ?? "Confirmation email sent.", error: null });
    } catch {
      setResend({ busy: false, message: null, error: "We couldn't reach the server." });
    }
  }

  if (loadError) {
    return (
      <main className="wrap">
        <div className="panel">
          <h2>something went wrong.</h2>
          <p className="hint">{loadError}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="wrap">
        <div className="panel">
          <h2>loading your account…</h2>
        </div>
      </main>
    );
  }

  const { account } = data;
  const firstName = data.user.name.split(" ")[0];

  return (
    <>
      <nav className="nav">
        <b>stacked.</b>
        <span className="nav-links">
          <span className="who">{data.user.name}</span>
          <button className="pill" type="button" onClick={() => void signOut({ callbackUrl: "/signin" })}>
            sign out
          </button>
        </span>
      </nav>

      <main className="wrap">
        <div className="dash-head">
          <div>
            <h1>
              good {greeting()}, <span className="serif">{firstName}.</span>
            </h1>
            <p className="sub">
              Everything we did with your money today, live. Nothing hidden, nothing you need a
              finance degree to read.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span className="badge">{account.vibeLabel}</span>
            <button className="btn sm" type="button" onClick={() => setCryptoOpen(true)}>
              deposit
            </button>
            <button
              className="btn ghost sm"
              type="button"
              onClick={() =>
                setDialog({ amount: "100", error: null, busy: false, key: newIdempotencyKey() })
              }
            >
              withdraw
            </button>
          </div>
        </div>

        {!data.user.emailVerified ? (
          <section className="panel" style={{ marginBottom: 30 }}>
            <h2>
              confirm your <span className="serif">email.</span>
            </h2>
            <p className="hint">
              We sent a link to {data.user.email}. Confirm it so trade receipts and statements
              actually reach you.
            </p>
            {resend.error ? (
              <div className="alert" role="alert">
                {resend.error}
              </div>
            ) : null}
            {resend.message ? (
              <div className="alert ok" role="status">
                {resend.message}
              </div>
            ) : null}
            <div className="mrow" style={{ marginTop: 16 }}>
              <button
                className="btn sm"
                type="button"
                disabled={resend.busy}
                onClick={() => void resendVerification()}
              >
                {resend.busy ? "sending…" : "resend confirmation"}
              </button>
            </div>
          </section>
        ) : null}

        <section className="kpis" aria-label="Account summary">
          <div className="kpi">
            <span>portfolio value</span>
            <b>{formatMoney(account.balanceCents)}</b>
            <small className="mono">in your name</small>
          </div>
          <div className="kpi">
            <span>today</span>
            <b className={account.todayPnlCents < 0 ? "neg" : ""}>{formatPct(account.todayPct)}</b>
            <small className="mono">
              {account.todayPnlCents === 0 ? "no trades yet" : formatSignedMoney(account.todayPnlCents)}
            </small>
          </div>
          <div className="kpi">
            <span>you put in</span>
            <b>{formatMoney(account.netDepositedCents)}</b>
            <small className="mono">
              {data.activity.length} movement{data.activity.length === 1 ? "" : "s"}
            </small>
          </div>
          <div className="kpi">
            <span>profit / loss</span>
            <b className={account.profitLossCents < 0 ? "neg" : ""}>
              {formatSignedMoney(account.profitLossCents)}
            </b>
            <small className="mono">since you joined</small>
          </div>
        </section>

        <div className="dash-grid">
          <div className="col">
            <section className="pn" aria-label="Demo trade feed">
              <div className="ph">
                <div>
                  <span style={{ textAlign: "left", display: "block", marginBottom: 6 }}>
                    your account today
                  </span>
                  <b>{formatPct(account.todayPct)}</b>
                </div>
                <span className="mono">
                  demo trades,
                  <br />
                  not real money
                </span>
              </div>
              <div role="log" aria-live="polite">
                {data.trades.length === 0 ? (
                  <p className="hint" style={{ padding: "14px 0" }}>
                    No trades yet. Fund the account and demo trades will start landing here.
                  </p>
                ) : (
                  data.trades.map((trade) => (
                    <div className="tr" key={trade.id}>
                      <span className={`bd ${trade.side === "BUY" ? "b" : ""}`}>
                        {trade.side.toLowerCase()}
                      </span>
                      <div>
                        <strong>{trade.symbol}</strong>
                        <em className="serif">{trade.reason}</em>
                      </div>
                      <small className="mono">
                        {trade.quantity} @ $
                        {trade.priceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        <br />
                        {clockTime(trade.at)} · {formatSignedMoney(trade.pnlCents)}
                      </small>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <h2>
                what you <span className="serif">own.</span>
              </h2>
              <p className="hint">
                Target allocation for your risk level, scaled to your balance. Positions become real
                once a broker is connected.
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th>position</th>
                    <th className="r">value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.positions.map((position) => (
                    <tr key={position.symbol}>
                      <td>
                        <span className="sym">{position.label}</span>
                        <span className="why">
                          {position.why} · {position.weight}%
                        </span>
                        {position.quantity !== null && position.price !== null ? (
                          <span className="why mono">
                            {position.quantity.toFixed(4)} @ $
                            {position.price.toLocaleString("en-US")}
                          </span>
                        ) : null}
                      </td>
                      <td className="r num">{formatMoney(position.valueCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <div className="col">
            <section className="panel">
              <h2>
                your <span className="serif">vibe.</span>
              </h2>
              <p className="hint">
                Change how much risk you&apos;re taking. Saved to your account and your risk
                acknowledgement is re-recorded.
              </p>
              <div className="chips">
                {VIBE_CHOICES.map((choice) => (
                  <button
                    key={choice.key}
                    className="chip inv"
                    type="button"
                    aria-pressed={account.vibe === choice.key}
                    disabled={vibeBusy}
                    onClick={() => void changeVibe(choice.key)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              <p className="hint" style={{ marginTop: 16 }}>
                {account.vibeNote}
              </p>
            </section>

            <section className="panel">
              <h2>activity.</h2>
              <p className="hint">Every deposit, withdrawal, trade and fee, in order.</p>
              {data.activity.length === 0 ? (
                <p className="hint">Nothing yet.</p>
              ) : (
                <ul className="act">
                  {data.activity.map((entry) => {
                    const negative = entry.amountCents < 0;
                    return (
                      <li key={entry.id}>
                        <span>
                          <span className="what">{entry.label}</span>
                          <span className="when">
                            {new Date(entry.at).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })}{" "}
                            ·{" "}
                            {new Date(entry.at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </span>
                        <span className={`amt${negative ? " neg" : ""}`}>
                          {formatSignedMoney(entry.amountCents)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="panel">
              <h2>
                the fine <span className="serif">print.</span>
              </h2>
              <p className="hint" style={{ margin: 0 }}>
                <strong>This is a demo.</strong> Trades on this page are simulated — there is no
                broker, no order and no market data behind them, and no real money is at risk. Crypto
                deposits do arrive on-chain and are recorded in a real ledger, but they are not
                invested in anything yet.
              </p>
            </section>
          </div>
        </div>
      </main>

      <CryptoDepositPanel
        open={cryptoOpen}
        onClose={() => setCryptoOpen(false)}
        onCredited={() => void refresh()}
        deposits={data.crypto.deposits}
        minConfirmations={data.crypto.minConfirmations}
      />

      {dialog ? (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Withdraw money"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDialog(null);
          }}
        >
          <div className="paper">
            <h1>withdraw</h1>
            <p className="lede">Take money out. No lock-ins, no exit fee.</p>

            {dialog.error ? (
              <div className="alert" role="alert">
                {dialog.error}
              </div>
            ) : null}

            <label className="field">
              amount in USD
              <input
                type="number"
                min={1}
                step={1}
                value={dialog.amount}
                autoFocus
                onChange={(event) =>
                  // A different amount is a different intent, so it gets a new key.
                  setDialog({
                    ...dialog,
                    amount: event.target.value,
                    error: null,
                    key: newIdempotencyKey(),
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void withdraw();
                  }
                }}
              />
            </label>
            <div className="chips">
              {["50", "100", "500", "1000"].map((value) => (
                <button
                  key={value}
                  className="chip"
                  type="button"
                  onClick={() =>
                    setDialog({ ...dialog, amount: value, error: null, key: newIdempotencyKey() })
                  }
                >
                  ${Number(value).toLocaleString("en-US")}
                </button>
              ))}
            </div>
            <div className="mrow">
              <button className="btn dark" type="button" disabled={dialog.busy} onClick={() => void withdraw()}>
                {dialog.busy ? "working…" : "confirm"}
              </button>
              <button className="lnk" type="button" onClick={() => setDialog(null)}>
                cancel
              </button>
            </div>
            <p className="foot mono muted">
              You can withdraw up to {formatMoney(account.balanceCents)}. Sandbox mode — no funds
              leave anywhere yet.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
