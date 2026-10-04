"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (password.length < 8) return setError("Your password needs at least 8 characters.");
    if (password !== confirm) return setError("Those passwords don't match.");

    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setBusy(false);

      if (!response.ok) {
        setError(payload.error ?? "Something went wrong. Request a new link.");
        return;
      }
      setDone(true);
    } catch {
      setBusy(false);
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  if (!token) {
    return (
      <div className="paper">
        <h1>
          link <span className="serif">incomplete.</span>
        </h1>
        <p className="lede">
          This page needs a reset token from your email. Request a fresh link and open it directly.
        </p>
        <div className="mrow">
          <Link className="btn dark" href="/forgot-password">
            request a new link
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="paper">
        <h1>
          password <span className="serif">updated.</span>
        </h1>
        <p className="lede">
          You can sign in with your new password now. Any other device that was signed in has been
          signed out.
        </p>
        <div className="mrow">
          <Link className="btn dark" href="/signin">
            sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className="paper" noValidate onSubmit={submit}>
      <h1>
        set a new <span className="serif">password.</span>
      </h1>
      <p className="lede">Pick something at least 8 characters long.</p>

      {error ? (
        <div className="alert" role="alert">
          {error}
        </div>
      ) : null}

      <label className="field">
        new password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="at least 8 characters"
        />
      </label>
      <label className="field">
        confirm password
        <input
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="type it again"
        />
      </label>

      <div className="mrow">
        <button className="btn dark" type="submit" disabled={busy}>
          {busy ? "saving…" : "save new password"}
        </button>
        <Link className="lnk" href="/signin">
          cancel
        </Link>
      </div>
    </form>
  );
}
