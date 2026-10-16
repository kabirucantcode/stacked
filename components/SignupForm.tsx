"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";

import { dollarsToCents, formatMoney } from "@/lib/format";

const STEP_COUNT = 5;

const VIBE_OPTIONS = [
  { value: "Chill", blurb: "Slow and steady. Smaller moves, fewer surprises." },
  { value: "Balanced", blurb: "A mix of steady positions and bolder ones." },
  { value: "Full send", blurb: "More active, more volatile. Bigger swings both ways." },
] as const;

type VibeOption = (typeof VIBE_OPTIONS)[number]["value"];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function SignupForm() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vibe, setVibe] = useState<VibeOption | null>(null);
  const [amount, setAmount] = useState("100");
  const [acknowledged, setAcknowledged] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function goTo(next: number) {
    setError(null);
    setStep(next);
  }

  /** Validate the current step and move forward. */
  function next() {
    setError(null);

    if (step === 1) {
      if (!EMAIL_RE.test(email.trim())) return setError("That email doesn't look right. Try again.");
      if (password.length < 8) return setError("Your password needs at least 8 characters.");
      return setStep(2);
    }
    if (step === 2) {
      if (!name.trim()) return setError("We need a name for the account.");
      return setStep(3);
    }
    if (step === 3) {
      if (!vibe) return setError("Pick a risk level to continue.");
      return setStep(4);
    }
    return setStep(Math.min(STEP_COUNT, step + 1));
  }

  async function register() {
    setError(null);

    const amountCents = dollarsToCents(amount);
    if (!Number.isFinite(amountCents) || amountCents < 100) {
      return setError("Enter an amount of at least $1.");
    }
    if (!acknowledged) {
      return setError("Please acknowledge the risk before continuing.");
    }

    setBusy(true);
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim(),
          phone: phone.trim() || undefined,
          vibe,
          amountCents,
          acknowledgedRisk: true,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setBusy(false);
        return setError(data.error ?? "Something went wrong creating your account.");
      }

      // Account exists — sign the user straight in.
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      setBusy(false);

      if (!result || result.error) {
        router.push("/signin");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setBusy(false);
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  const firstName = name.trim().split(" ")[0] || "there";
  const startCents = Number.isFinite(dollarsToCents(amount)) ? dollarsToCents(amount) : 0;

  return (
    <form
      className="paper"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (step < 4) next();
        else if (step === 4) void register();
      }}
    >
      <div className="pg" aria-hidden="true">
        {Array.from({ length: STEP_COUNT }, (_, index) => (
          <i key={index} className={index < step ? "on" : ""} />
        ))}
      </div>

      {error ? (
        <div className="alert" role="alert">
          {error}
        </div>
      ) : null}

      {/* 1 · account */}
      <section className="stp" hidden={step !== 1}>
        <h1>
          let&apos;s get you <span className="serif">in.</span>
        </h1>
        <p className="lede">
          Create your account. It takes about a minute, and you can leave whenever.
        </p>
        <label className="field">
          email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            placeholder="you@email.com"
          />
        </label>
        <label className="field">
          password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="at least 8 characters"
          />
          <small>8 characters minimum. Hashed with scrypt — never stored in plain text.</small>
        </label>
        <div className="mrow">
          <button className="btn dark" type="button" onClick={next}>
            continue
          </button>
          <Link className="lnk" href="/">
            back to home
          </Link>
        </div>
      </section>

      {/* 2 · identity */}
      <section className="stp" hidden={step !== 2}>
        <h1>
          who are <span className="serif">you?</span>
        </h1>
        <p className="lede">So your account — and every trade in it — has a name on it.</p>
        <label className="field">
          full name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
            placeholder="Alex Rivera"
          />
        </label>
        <label className="field">
          phone <span className="opt">(optional)</span>
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            placeholder="+1 555 000 0000"
          />
        </label>
        <div className="mrow">
          <button className="btn dark" type="button" onClick={next}>
            continue
          </button>
          <button className="lnk" type="button" onClick={() => goTo(1)}>
            back
          </button>
        </div>
      </section>

      {/* 3 · risk vibe */}
      <section className="stp" hidden={step !== 3}>
        <h1>
          pick your <span className="serif">vibe.</span>
        </h1>
        <p className="lede">
          How much risk feels right? You can change this any time from your dashboard.
        </p>
        {VIBE_OPTIONS.map((option) => (
          <button
            key={option.value}
            className="vb"
            type="button"
            aria-pressed={vibe === option.value}
            onClick={() => {
              setVibe(option.value);
              goTo(4);
            }}
          >
            {option.value}
            <small>{option.blurb}</small>
          </button>
        ))}
        <div className="mrow">
          <button className="lnk" type="button" onClick={() => goTo(2)}>
            back
          </button>
        </div>
      </section>

      {/* 4 · funding */}
      <section className="stp" hidden={step !== 4}>
        <h1>
          how much to <span className="serif">start?</span>
        </h1>
        <p className="lede">
          You choose the amount. Your money stays in your name — we trade it, we don&apos;t own it.
        </p>
        <label className="field">
          amount in USD
          <input
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            required
          />
        </label>
        <div className="chips">
          {["50", "100", "500", "1000"].map((value) => (
            <button
              key={value}
              className="chip"
              type="button"
              onClick={() => setAmount(value)}
            >
              ${Number(value).toLocaleString("en-US")}
            </button>
          ))}
        </div>
        <label className="ck">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
            required
          />
          <span>I understand that trading involves risk and I can lose some or all of my money.</span>
        </label>
        <div className="mrow">
          <button className="btn dark" type="submit" disabled={busy}>
            {busy ? "creating…" : "create my account"}
          </button>
          <button className="lnk" type="button" onClick={() => goTo(3)}>
            back
          </button>
        </div>
      </section>

      {/* 5 · done */}
      <section className="stp" hidden={step !== STEP_COUNT}>
        <h1 className="serif">you&apos;re in, {firstName}.</h1>
        <p className="lede">
          Risk vibe: <strong>{vibe ?? "Balanced"}</strong>. Starting amount:{" "}
          <strong>{formatMoney(startCents)}</strong>.
        </p>
        <p className="lede">
          We sent a confirmation link to <strong>{email.trim()}</strong> — confirm it so trade
          receipts and statements reach you.
        </p>
        <div className="mrow">
          <Link className="btn dark" href="/dashboard">
            go to my dashboard
          </Link>
        </div>
        <p className="foot mono muted">
          Sandbox account — the opening deposit is a ledger entry, not real money.
        </p>
      </section>
    </form>
  );
}
