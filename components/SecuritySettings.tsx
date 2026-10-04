"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";

import { describeUserAgent } from "@/lib/client-info";

type SessionSummary = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};

type Overview = {
  email: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  hasPendingSecret: boolean;
  unusedRecoveryCodes: number;
  sessions: SessionSummary[];
};

type Setup = { secret: string; otpauthUrl: string };

function when(iso: string) {
  const date = new Date(iso);
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} · ${date.toLocaleTimeString(
    [],
    { hour: "2-digit", minute: "2-digit" },
  )}`;
}

export default function SecuritySettings() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [showDisable, setShowDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/security/sessions", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/signin");
        return;
      }
      if (!response.ok) throw new Error("failed");
      setData((await response.json()) as Overview);
      setError(null);
    } catch {
      setError("We couldn't load your security settings.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(label: string, url: string, body?: unknown) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        secret?: string;
        otpauthUrl?: string;
        recoveryCodes?: string[];
        revoked?: number;
      };
      setBusy(null);
      if (!response.ok) {
        setError(payload.error ?? "That didn't work. Try again.");
        return null;
      }
      return payload;
    } catch {
      setBusy(null);
      setError("We couldn't reach the server.");
      return null;
    }
  }

  async function startSetup() {
    const payload = await call("setup", "/api/security/2fa/setup");
    if (payload?.secret && payload.otpauthUrl) {
      setSetup({ secret: payload.secret, otpauthUrl: payload.otpauthUrl });
      setRecoveryCodes(null);
    }
  }

  async function enable() {
    const payload = await call("enable", "/api/security/2fa/enable", { code });
    if (!payload) return;
    setSetup(null);
    setCode("");
    setRecoveryCodes(payload.recoveryCodes ?? []);
    setNotice(payload.message ?? "Two-factor is on.");
    await load();
  }

  async function disable() {
    const payload = await call("disable", "/api/security/2fa/disable", {
      password: disablePassword,
    });
    if (!payload) return;
    setDisablePassword("");
    setShowDisable(false);
    setRecoveryCodes(null);
    setNotice(payload.message ?? "Two-factor is off.");
    await load();
  }

  async function regenerate() {
    const payload = await call("regenerate", "/api/security/recovery-codes");
    if (!payload) return;
    setRecoveryCodes(payload.recoveryCodes ?? []);
    setNotice(payload.message ?? "New codes generated.");
    await load();
  }

  async function revokeOne(id: string) {
    const payload = await call("revoke", "/api/security/sessions/revoke", { id });
    if (!payload) return;
    setNotice(`Signed out ${payload.revoked ?? 0} session.`);
    await load();
  }

  async function revokeOthers() {
    const payload = await call("revoke", "/api/security/sessions/revoke", { all: true });
    if (!payload) return;
    // Revoking everything includes this device, so finish the job locally.
    await signOut({ callbackUrl: "/signin" });
  }

  async function endThisSession() {
    await call("signout", "/api/security/sessions/revoke", {});
    await signOut({ callbackUrl: "/signin" });
  }

  async function resendVerification() {
    const payload = await call("resend", "/api/auth/resend-verification");
    if (payload) setNotice(payload.message ?? "Confirmation email sent.");
  }

  if (!data) {
    return (
      <main className="wrap">
        <div className="panel">
          <h2>{error ? "something went wrong." : "loading your settings…"}</h2>
          {error ? <p className="hint">{error}</p> : null}
        </div>
      </main>
    );
  }

  return (
    <>
      <nav className="nav">
        <b>
          <Link href="/dashboard">stacked.</Link>
        </b>
        <span className="nav-links">
          <span className="who">{data.email}</span>
          <button className="pill" type="button" onClick={() => void endThisSession()}>
            sign out
          </button>
        </span>
      </nav>

      <main className="wrap">
        <div className="dash-head">
          <div>
            <h1>
              your <span className="serif">security.</span>
            </h1>
            <p className="sub">
              Two-factor, recovery codes, and every device currently signed in to your account.
            </p>
          </div>
          <Link className="btn ghost sm" href="/dashboard">
            back to dashboard
          </Link>
        </div>

        {error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="alert ok" role="status">
            {notice}
          </div>
        ) : null}

        {recoveryCodes ? (
          <section className="panel" style={{ marginBottom: 22 }}>
            <h2>
              save these <span className="serif">now.</span>
            </h2>
            <p className="hint">
              Each code works once, if you ever lose your authenticator. They won&apos;t be shown
              again.
            </p>
            <div className="chips" style={{ gap: 12 }}>
              {recoveryCodes.map((recovery) => (
                <span key={recovery} className="badge mono">
                  {recovery}
                </span>
              ))}
            </div>
            <div className="mrow">
              <button className="btn sm" type="button" onClick={() => setRecoveryCodes(null)}>
                I&apos;ve saved them
              </button>
            </div>
          </section>
        ) : null}

        <div className="dash-grid">
          <div className="col">
            <section className="panel">
              <h2>two-factor.</h2>
              <p className="hint">
                Adds a 6-digit code from an authenticator app on top of your password.
              </p>

              {data.twoFactorEnabled ? (
                <>
                  <p className="hint">
                    <strong>On.</strong> {data.unusedRecoveryCodes} unused recovery code
                    {data.unusedRecoveryCodes === 1 ? "" : "s"} left.
                  </p>
                  <div className="mrow" style={{ marginTop: 12 }}>
                    <button
                      className="btn sm"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void regenerate()}
                    >
                      {busy === "regenerate" ? "working…" : "new recovery codes"}
                    </button>
                    <button
                      className="lnk"
                      type="button"
                      onClick={() => setShowDisable((open) => !open)}
                    >
                      turn off two-factor
                    </button>
                  </div>

                  {showDisable ? (
                    <>
                      <label className="field inv">
                        confirm your password
                        <input
                          type="password"
                          value={disablePassword}
                          onChange={(event) => setDisablePassword(event.target.value)}
                          autoComplete="current-password"
                        />
                      </label>
                      <div className="mrow">
                        <button
                          className="btn sm"
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void disable()}
                        >
                          {busy === "disable" ? "working…" : "turn it off"}
                        </button>
                      </div>
                    </>
                  ) : null}
                </>
              ) : setup ? (
                <>
                  <p className="hint">
                    Add this secret to your authenticator app, then enter the code it shows.
                  </p>
                  <label className="field inv">
                    secret key
                    <input type="text" readOnly value={setup.secret} onFocus={(e) => e.target.select()} />
                  </label>
                  <p className="hint mono" style={{ wordBreak: "break-all" }}>
                    <a href={setup.otpauthUrl}>open in your authenticator app →</a>
                  </p>
                  <label className="field inv">
                    6-digit code
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="123456"
                    />
                  </label>
                  <div className="mrow">
                    <button
                      className="btn sm"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void enable()}
                    >
                      {busy === "enable" ? "verifying…" : "turn on two-factor"}
                    </button>
                    <button className="lnk" type="button" onClick={() => setSetup(null)}>
                      cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {data.hasPendingSecret ? (
                    <p className="hint">You have a half-finished setup — start again to continue.</p>
                  ) : null}
                  <div className="mrow" style={{ marginTop: 12 }}>
                    <button
                      className="btn sm"
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void startSetup()}
                    >
                      {busy === "setup" ? "starting…" : "set up two-factor"}
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className="panel">
              <h2>email.</h2>
              <p className="hint">
                {data.email} is {data.emailVerified ? "confirmed" : "not confirmed yet"}.
              </p>
              {!data.emailVerified ? (
                <div className="mrow" style={{ marginTop: 12 }}>
                  <button
                    className="btn sm"
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void resendVerification()}
                  >
                    {busy === "resend" ? "sending…" : "resend confirmation"}
                  </button>
                </div>
              ) : null}
            </section>
          </div>

          <div className="col">
            <section className="panel">
              <h2>
                signed-in <span className="serif">devices.</span>
              </h2>
              <p className="hint">
                If you don&apos;t recognise one, sign it out — or sign out everywhere.
              </p>

              {data.sessions.length === 0 ? (
                <p className="hint">No active sessions.</p>
              ) : (
                <ul className="act">
                  {data.sessions.map((session) => (
                    <li key={session.id}>
                      <span>
                        <span className="what">
                          {describeUserAgent(session.userAgent)}
                          {session.current ? " · this device" : ""}
                        </span>
                        <span className="when">
                          last seen {when(session.lastSeenAt)}
                          {session.ip ? ` · ${session.ip}` : ""}
                        </span>
                      </span>
                      {session.current ? (
                        <span className="amt">current</span>
                      ) : (
                        <button
                          className="lnk"
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void revokeOne(session.id)}
                        >
                          sign out
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mrow">
                <button
                  className="btn ghost sm"
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void revokeOthers()}
                >
                  sign out everywhere
                </button>
              </div>
            </section>

            <section className="panel">
              <h2>
                the fine <span className="serif">print.</span>
              </h2>
              <p className="hint" style={{ margin: 0 }}>
                Passwords are hashed with scrypt; 2FA secrets are encrypted at rest; recovery codes
                and session tokens are stored only as hashes. Changing your password signs out every
                other device.
              </p>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
