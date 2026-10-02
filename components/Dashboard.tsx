"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";

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

type AccountPayload = {
  user: { name: string; email: string };
  account: {
    vibe: VibeKey;
    vibeLabel: string;
    vibeNote: string;
    status: string;
    balanceCents: number;
    netDepositedCents: number;
    profitLossCents: number;
  };
  positions: Position[];
  activity: ActivityEntry[];
};

const VIBE_CHOICES: { key: VibeKey; label: string }[] = [
  { key: "CHILL", label: "Chill" },
  { key: "BALANCED", label: "Balanced" },
  { key: "FULL_SEND", label: "Full send" },
];

/** Sample market feed — explicitly labelled in the UI. Not real trades. */
const SAMPLE_TRADES = [
  ["NVDA", "BUY", "earnings momentum"],
  ["BTC", "SELL", "took profit at resistance"],
  ["AAPL", "BUY", "dip into support"],
  ["TSLA", "SELL", "volatility spike, trimming"],
  ["ETH", "BUY", "breakout on volume"],
  ["MSFT", "BUY", "steady cash flow, adding"],
  ["SOL", "SELL", "cutting risk before news"],
  ["AMZN", "BUY", "post-earnings pullback"],
] as const;

const SAMPLE_PRICE: Record<string, number> = {
  NVDA: 118,
  BTC: 64200,
  AAPL: 226,
  TSLA: 248,
  ETH: 2650,
  MSFT: 420,
  SOL: 148,
  AMZN: 185,
};

type SampleTrade = {
  id: string;
  side: string;
  symbol: string;
  why: string;
  quantity: string;
  price: number;
  at: string;
};

function makeTrade(): SampleTrade {
  const [symbol, side, why] = SAMPLE_TRADES[Math.floor(Math.random() * SAMPLE_TRADES.length)];
  const base = SAMPLE_PRICE[symbol] ?? 100;
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    side,
    symbol,
    why,
    quantity: (Math.random() * 4 + 0.2).toFixed(2),
    price: base * (1 + (Math.random() - 0.5) * 0.02),
    at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

export default function Dashboard() {
  const [data, setData] = useState<AccountPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feed, setFeed] = useState<SampleTrade[]>([]);
  const [todayPct, setTodayPct] = useState(1.42);
  const dayDrift = useRef<Record<string, number>>({});

  const [dialog, setDialog] = useState<{ mode: "deposit" | "withdraw"; amount: string; error: string | null; busy: boolean } | null>(
    null,
  );
  const [vibeBusy, setVibeBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/account", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/signin");
        return;
      }
      if (!response.ok) throw new Error("request failed");
      const payload = (await response.json()) as AccountPayload;
      setData(payload);
      setLoadError(null);

      for (const position of payload.positions) {
        if (!(position.symbol in dayDrift.current)) {
          dayDrift.current[position.symbol] = position.symbol === "CASH" ? 0 : (Math.random() - 0.45) * 6;
        }
      }
    } catch {
      setLoadError("We couldn't load your account. Refresh to try again.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Sample feed + sample "today" movement, purely presentational.
  useEffect(() => {
    setFeed(Array.from({ length: 5 }, makeTrade));
    const reduced = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    const timer = window.setInterval(() => {
      setFeed((current) => [makeTrade(), ...current].slice(0, 6));
      setTodayPct((value) => value + (Math.random() - 0.42) * 0.09);
    }, reduced ? 6000 : 2600);
    return () => window.clearInterval(timer);
  }, []);

  // Close the money dialog on Escape.
  useEffect(() => {
    if (!dialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialog(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  async function move() {
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: dialog.mode, amountCents }),
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

  const positions = data?.positions ?? [];
  const activity = data?.activity ?? [];

  const kpis = useMemo(() => {
    if (!data) return null;
    const { balanceCents, netDepositedCents, profitLossCents } = data.account;
    return { balanceCents, netDepositedCents, profitLossCents };
  }, [data]);

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

  if (!data || !kpis) {
    return (
      <main className="wrap">
        <div className="panel">
          <h2>loading your account…</h2>
        </div>
      </main>
    );
  }

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
            <span className="badge">{data.account.vibeLabel}</span>
            <button
              className="btn sm"
              type="button"
              onClick={() => setDialog({ mode: "deposit", amount: "100", error: null, busy: false })}
            >
              deposit
            </button>
            <button
              className="btn ghost sm"
              type="button"
              onClick={() => setDialog({ mode: "withdraw", amount: "100", error: null, busy: false })}
            >
              withdraw
            </button>
          </div>
        </div>

        <section className="kpis" aria-label="Account summary">
          <div className="kpi">
            <span>portfolio value</span>
            <b>{formatMoney(kpis.balanceCents)}</b>
            <small className="mono">in your name</small>
          </div>
          <div className="kpi">
            <span>today</span>
            <b>{formatPct(todayPct)}</b>
            <small className="mono">sample movement</small>
          </div>
          <div className="kpi">
            <span>you put in</span>
            <b>{formatMoney(kpis.netDepositedCents)}</b>
            <small className="mono">
              {activity.length} movement{activity.length === 1 ? "" : "s"}
            </small>
          </div>
          <div className="kpi">
            <span>profit / loss</span>
            <b className={kpis.profitLossCents < 0 ? "neg" : ""}>
              {formatSignedMoney(kpis.profitLossCents)}
            </b>
            <small className="mono">since you joined</small>
          </div>
        </section>

        <div className="dash-grid">
          <div className="col">
            <section className="pn" aria-label="Sample trade feed">
              <div className="ph">
                <div>
                  <span style={{ textAlign: "left", display: "block", marginBottom: 6 }}>
                    your account today
                  </span>
                  <b>{formatPct(todayPct)}</b>
                </div>
                <span className="mono">
                  sample data,
                  <br />
                  not real trades
                </span>
              </div>
              <div role="log" aria-live="polite">
                {feed.map((trade) => (
                  <div className="tr" key={trade.id}>
                    <span className={`bd ${trade.side === "BUY" ? "b" : ""}`}>
                      {trade.side.toLowerCase()}
                    </span>
                    <div>
                      <strong>{trade.symbol}</strong>
                      <em className="serif">{trade.why}</em>
                    </div>
                    <small className="mono">
                      {trade.quantity} @ $
                      {trade.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      <br />
                      {trade.at}
                    </small>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2>
                what you <span className="serif">own.</span>
              </h2>
              <p className="hint">
                Illustrative allocation for your risk level — positions become real once trading is
                connected.
              </p>
              <table className="table">
                <thead>
                  <tr>
                    <th>position</th>
                    <th className="r">value</th>
                    <th className="r">today</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => {
                    const drift = dayDrift.current[position.symbol] ?? 0;
                    return (
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
                        <td className={`r num${drift < 0 ? " neg" : ""}`}>{formatPct(drift)}</td>
                      </tr>
                    );
                  })}
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
                    aria-pressed={data.account.vibe === choice.key}
                    disabled={vibeBusy}
                    onClick={() => void changeVibe(choice.key)}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              <p className="hint" style={{ marginTop: 16 }}>
                {data.account.vibeNote}
              </p>
            </section>

            <section className="panel">
              <h2>activity.</h2>
              <p className="hint">Every deposit, withdrawal and fee, in order.</p>
              {activity.length === 0 ? (
                <p className="hint">Nothing yet.</p>
              ) : (
                <ul className="act">
                  {activity.map((entry) => {
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
                Trading carries risk and you can lose some or all of your money. Balances, deposits
                and withdrawals on this page are real records in the app database, but{" "}
                <strong>no real money moves</strong> until a payment rail is connected. Prices,
                positions and the trade feed are simulated for illustration.
              </p>
            </section>
          </div>
        </div>
      </main>

      {dialog ? (
        <div
          className="overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${dialog.mode} money`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setDialog(null);
          }}
        >
          <div className="paper">
            <h1>{dialog.mode}</h1>
            <p className="lede">
              {dialog.mode === "deposit"
                ? "Add money to your account. It stays in your name."
                : "Take money out. No lock-ins, no exit fee."}
            </p>

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
                onChange={(event) => setDialog({ ...dialog, amount: event.target.value, error: null })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void move();
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
                  onClick={() => setDialog({ ...dialog, amount: value, error: null })}
                >
                  ${Number(value).toLocaleString("en-US")}
                </button>
              ))}
            </div>
            <div className="mrow">
              <button className="btn dark" type="button" disabled={dialog.busy} onClick={() => void move()}>
                {dialog.busy ? "working…" : "confirm"}
              </button>
              <button className="lnk" type="button" onClick={() => setDialog(null)}>
                cancel
              </button>
            </div>
            <p className="foot mono muted">
              {dialog.mode === "deposit"
                ? `Available balance: ${formatMoney(kpis.balanceCents)}`
                : `You can withdraw up to ${formatMoney(kpis.balanceCents)}.`}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
