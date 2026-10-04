"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function SigninForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        // Only sent when the user revealed the field — the server decides whether
        // a second factor is actually required.
        token: showCode ? code.trim() : undefined,
        redirect: false,
      });

      if (!result || result.error) {
        setBusy(false);
        return setError("That email and password don't match an account.");
      }

      // "Keep me signed in" off → downgrade the session cookie so closing the
      // browser signs the user out.
      if (!remember) {
        await fetch("/api/session/ephemeral", { method: "POST" }).catch(() => undefined);
      }

      setBusy(false);
      router.replace(nextPath);
      router.refresh();
    } catch {
      setBusy(false);
      setError("We couldn't reach the server. Check your connection and try again.");
    }
  }

  return (
    <form className="paper" noValidate onSubmit={submit}>
      <h1>
        welcome <span className="serif">back.</span>
      </h1>
      <p className="lede">Sign in to watch your money work.</p>

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
      <label className="field">
        password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
          placeholder="your password"
        />
      </label>

      {showCode ? (
        <label className="field">
          authenticator code
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456 or a recovery code"
          />
          <small>6-digit code from your app, or one of your recovery codes.</small>
        </label>
      ) : (
        <button className="lnk" type="button" onClick={() => setShowCode(true)}>
          using an authenticator app?
        </button>
      )}

      <label className="ck">
        <input
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        />
        <span>Keep me signed in on this device</span>
      </label>

      <div className="mrow">
        <button className="btn dark" type="submit" disabled={busy}>
          {busy ? "signing in…" : "sign in"}
        </button>
      </div>

      <p className="foot mono">
        no account yet? <Link href="/signup">create one</Link> · forgot your password?{" "}
        <Link href="/forgot-password">reset it</Link>
      </p>
    </form>
  );
}
