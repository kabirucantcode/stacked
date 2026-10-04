"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type State =
  | { kind: "working" }
  | { kind: "ok" }
  | { kind: "error"; message: string };

export default function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>({ kind: "working" });
  const started = useRef(false);

  useEffect(() => {
    // React StrictMode runs effects twice in development; only fire once.
    if (started.current) return;
    started.current = true;

    if (!token) {
      setState({ kind: "error", message: "This link is missing its token." });
      return;
    }

    void (async () => {
      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          setState({ kind: "error", message: payload.error ?? "We couldn't confirm that link." });
          return;
        }
        setState({ kind: "ok" });
      } catch {
        setState({ kind: "error", message: "We couldn't reach the server. Try again." });
      }
    })();
  }, [token]);

  if (state.kind === "working") {
    return (
      <div className="paper">
        <h1>
          confirming your <span className="serif">email.</span>
        </h1>
        <p className="lede">One moment…</p>
      </div>
    );
  }

  if (state.kind === "ok") {
    return (
      <div className="paper">
        <h1>
          email <span className="serif">confirmed.</span>
        </h1>
        <p className="lede">
          You&apos;re all set — trade receipts and statements will reach this address.
        </p>
        <div className="mrow">
          <Link className="btn dark" href="/dashboard">
            go to my dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="paper">
      <h1>
        that didn&apos;t <span className="serif">work.</span>
      </h1>
      <p className="lede">{state.message}</p>
      <div className="mrow">
        <Link className="btn dark" href="/dashboard">
          go to my dashboard
        </Link>
        <Link className="lnk" href="/signin">
          sign in
        </Link>
      </div>
      <p className="foot mono muted">
        Link expired? Open your dashboard and use “resend confirmation”.
      </p>
    </div>
  );
}
