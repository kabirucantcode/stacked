"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      setBusy(false);

      if (!response.ok) {
        setError(payload.error ?? "Something went wrong. Try again.");
        return;
      }
      setSent(payload.message ?? "If that email is on an account, a reset link is on its way.");
    } catch {
      setBusy(false);
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  if (sent) {
    return (
      <div className="paper">
        <h1>
          check your <span className="serif">inbox.</span>
        </h1>
        <p className="lede">{sent}</p>
        <div className="mrow">
          <Link className="btn dark" href="/signin">
            back to sign in
          </Link>
        </div>
        <p className="foot mono muted">
          Nothing arrived? Check spam, or confirm you used the address you signed up with.
        </p>
      </div>
    );
  }

  return (
    <form className="paper" noValidate onSubmit={submit}>
      <h1>
        forgot your <span className="serif">password?</span>
      </h1>
      <p className="lede">Enter your email and we&apos;ll send a link to set a new one.</p>

      {error ? (
        <div className="alert" role="alert">
          {error}
        </div>
      ) : null}

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

      <div className="mrow">
        <button className="btn dark" type="submit" disabled={busy}>
          {busy ? "sending…" : "send reset link"}
        </button>
        <Link className="lnk" href="/signin">
          back to sign in
        </Link>
      </div>
    </form>
  );
}
