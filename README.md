# stacked.

> we trade, you chill.

A Next.js app for the **stacked** product: a marketing landing page, a real
sign-up / sign-in flow, and an authenticated dashboard backed by Postgres.

**Status: Phase 0.** The application shell is real — database, auth, ledger,
authenticated API. Trading and payments are **not** connected yet. See
[What's real vs simulated](#whats-real-vs-simulated) before reading anything as
a financial claim.

---

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 15 (App Router) + React 19 + TypeScript |
| Database | Postgres + Prisma |
| Auth | Auth.js (`next-auth` v5), Credentials provider, JWT sessions |
| Validation | Zod |
| Hosting | Render (see `render.yaml`) |

Money is stored as **integer cents** everywhere and balances are **derived** by
summing an append-only ledger — never stored on the account row.

---

## Quick start (cloud only — no local install)

### Option A · Replit + Neon

1. Create a free Postgres at [neon.tech](https://neon.tech) (email signup) and
   copy its connection string.
2. Create a Replit from `stacked-src.zip` (or drag the folder into the file tree).
3. In Replit **Secrets**, add:
   - `DATABASE_URL` = your Neon connection string
   - `AUTH_SECRET` = output of `openssl rand -base64 32`
   - `AUTH_TRUST_HOST` = `true`
4. In the Replit shell:
   ```bash
   npm install && npx prisma db push && npm run dev
   ```

### Option B · GitHub Codespaces / Dev Container

Open the repo in a Codespace (or *Dev Containers: Reopen in Container* locally).
`.devcontainer/devcontainer.json` + `docker-compose.yml` start Postgres, install
dependencies and push the schema automatically. Then:

```bash
npm run dev
```

### Option C · Render

Push to GitHub and create a Blueprint from `render.yaml`. Render provisions the
database, injects `DATABASE_URL`, generates `AUTH_SECRET`, pushes the schema and
builds. No local tooling involved.

---

## Local development (optional)

```bash
docker compose up -d db          # Postgres on :5432
cp .env.example .env             # fill in AUTH_SECRET
npm install
npx prisma db push               # create tables
npm run dev                      # http://localhost:3000
```

`AUTH_SECRET` can be generated with `npx auth secret`.

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | `prisma generate && next build` |
| `npm run start` | Production server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:push` | Sync schema without a migration |
| `npm run db:migrate` | Create a migration (dev) |
| `npm run db:deploy` | Apply migrations (prod) |
| `npm run db:studio` | Prisma Studio |

---

## Architecture

```
app/
  layout.tsx                  fonts, <div id="dot">, <Cursor>, SessionProvider
  globals.css                 shared design system (auth + dashboard)
  page.tsx / landing.css      marketing page (route-scoped CSS)
  signup/page.tsx             redirects to /dashboard when already signed in
  signin/page.tsx             ditto; reads ?next=
  dashboard/page.tsx          server-side auth gate, then renders the client UI
  forgot-password/page.tsx    request a reset link
  reset-password/page.tsx     set a new password from the emailed token
  verify-email/page.tsx       confirm the email from the emailed token
  api/
    auth/[...nextauth]        Auth.js handlers
    auth/forgot-password      POST request a link (never leaks whether the account exists)
    auth/reset-password       POST consume token, set password, invalidate old sessions
    auth/verify-email         POST consume token, mark the address confirmed
    auth/resend-verification  POST re-send the confirmation email (signed in)
    register                  create user + account + risk profile + opening entry
    waitlist                  public, idempotent on email
    account                   GET  summary + positions + activity + trades
    account/move              POST sandbox withdrawal (requires Idempotency-Key)
    account/vibe              PUT  change risk level (re-records acknowledgement)
    crypto/address            GET  the user's receiving address (assigns on first call)
    crypto/sync               POST scan that address and credit confirmed transfers
    demo/tick                 POST heartbeat: maybe one demo trade + fresh state
    cron/sync-deposits        POST scheduler sweep (Authorization: Bearer CRON_SECRET)
    cron/demo-trades          POST scheduler sweep (Authorization: Bearer CRON_SECRET)
    session/ephemeral         POST "keep me signed in" = off
    health                    liveness + DB check (Render health check)
components/
  Cursor.tsx                  the custom #dot cursor
  Landing.tsx                 the marketing page, ported to React
  SignupForm.tsx              5-step onboarding
  SigninForm.tsx              credentials sign-in
  ForgotPasswordForm.tsx      request a reset link
  ResetPasswordForm.tsx       consume the reset token
  VerifyEmail.tsx             consume the verification token
  Dashboard.tsx               KPI cards, demo feed, positions, activity, withdraw
  CryptoDepositPanel.tsx      receiving address, copy, "check for deposits"
lib/
  prisma.ts  password.ts  auth.ts  tokens.ts  email.ts  rate-limit.ts
  ledger.ts  vibes.ts  validation.ts  format.ts
  idempotency.ts  crypto.ts  etherscan.ts  prices.ts
  demo-trading.ts  account-payload.ts  cron-auth.ts  prisma-errors.ts
prisma/schema.prisma
```

### Data model

- **User** — email (unique), `passwordHash` (scrypt), name, phone.
- **Account** — one per user; holds the risk `vibe` and status.
- **LedgerEntry** — append-only, signed cents. Balance = `SUM(amountCents)`.
- **RiskProfile** — the audit trail for a risk acknowledgement: which vibe, which
  disclosure version, and when. Updating the vibe re-records it.
- **Token** — single-use email-verification / password-reset tokens. Only the
  SHA-256 hash is stored, so a database leak can't hand out working reset links.
- **IdempotencyKey** — one row per money-moving intent, unique on `(scope, key)`.
- **DepositAddress** — a watch-only receiving address, assigned to at most one user.
- **CryptoDeposit** — one on-chain transfer, unique on
  `(chainId, txHash, assetKey)`.
- **DemoTrade** — a simulated trade; the ledger entry it writes says so.
- **WaitlistEntry** — marketing signups.

Passwords are hashed with Node's built-in **scrypt** (no native dependency, so
Render builds stay simple).

---

## What's real vs simulated

**Real (persisted in Postgres):**

- Registration, sign-in, sessions, sign-out, protected routes.
- Email verification and password reset (token issuance, single-use consumption,
  expiry). Emails are logged to the console unless `RESEND_API_KEY` is set.
- Password changes bump a token version, which **invalidates every existing
  session** — a reset link can't be used to hijack a live session.
- Account, risk profile, and the risk-acknowledgement audit trail.
- Balances derived from the ledger.
- **Crypto deposits** — real on-chain transfers detected via Etherscan and
  credited once they are confirmed and priced.
- The dashboard **activity** list and all KPI figures.
- The marketing waitlist.

**Simulated (clearly labelled in the UI):**

- **Trades** — `lib/demo-trading.ts` invents a plausible P&L and writes a real
  ledger entry so the dashboard has live data. There is no broker, no order and
  no fill. Every entry it writes says "Demo trade — simulated, not real money."
- **Positions / allocation** — derived from `balance × vibe weights`
  (`lib/vibes.ts`). Illustrative until a broker is connected.
- **Withdrawals** — write a real ledger row and debit the balance, but no payout
  rail is connected, so nothing leaves. Every entry says "Sandbox".

**Not implemented:** KYC/AML, a withdrawal review/payout flow, fiat rails,
notifications beyond the verification/reset emails, admin tooling, and a password
change while already signed in (use the reset flow).

---

## Crypto deposits

1. Set `DEPOSIT_ADDRESSES` (comma-separated, pre-generated in your custody
   wallet) and `ETHERSCAN_API_KEY`.
2. Each user is assigned one address on first request, so attribution never
   relies on a memo field — ERC-20 transfers don't have one.
3. `POST /api/crypto/sync`, or the `cron/sync-deposits` sweep, scans that address.
4. A transfer is credited only when it has `CRYPTO_MIN_CONFIRMATIONS` **and** we
   know its USD price. Unpriced tokens are recorded but never credited, because
   crediting at a guessed price would silently move money.

Schedules: point a scheduler at `/api/cron/sync-deposits` and
`/api/cron/demo-trades` with `Authorization: Bearer $CRON_SECRET`. Render cron
jobs work, but so does anything else.

**Addresses are watch-only.** Nothing in this app holds a key that can move
funds; moving crypto into the custody wallet requires a key it never sees.

## Security notes

- The API is the security boundary: every data route calls `getSessionUser()`
  and returns 401 without a session. The `/dashboard` redirect is UX only.
- Passwords: scrypt with a per-user random salt, compared in constant time.
- Requests are validated with Zod before touching the database.
- Auth endpoints are rate-limited in-process (`lib/rate-limit.ts`). That map is
  per-process, so switch it to Redis/Upstash before running multiple instances.
- Reset tokens are single-use, expire after an hour, and are claimed atomically
  so a token can't be replayed by a racing request.
- `forgot-password` always returns the same response, so it can't be used to
  discover which emails have accounts.
- Money endpoints require an `Idempotency-Key`. The unique constraint on
  `(scope, key)` is the lock, so retries replay instead of double-crediting.
- Crypto crediting is guarded twice: the unique `(chainId, txHash, assetKey)`
  constraint, plus a conditional update that only flips `creditedAt` once.
- **No middleware file on purpose** — Auth.js middleware would pull Prisma into
  the Edge runtime. Page-level gates + API checks cover it without that hazard.
- `AUTH_SECRET` must be set in every environment; it is never committed.

---

## Roadmap

| Phase | Scope |
|---|---|
| **0 · done** | Database, auth, ledger, authenticated dashboard, waitlist |
| **1 · in progress** | ✅ email verification, ✅ password reset + session invalidation, ✅ rate limits, ✅ idempotent money operations, ✅ crypto deposits, ✅ demo trading — remaining: KYC screens, 2FA + session management |
| **2** | Broker/custodian integration, real positions, withdrawal review + payout, statements, admin |
| **3** | Live — only after legal and compliance sign-off |

Real trading and custody are **regulated**. The intended path is to integrate a
broker/custodian (Alpaca, DriveWealth, Interactive Brokers…), a KYC provider
(Persona, Onfido, Stripe Identity) and a payments provider — not to build them.

---

## Legacy files

`index.html`, `signup.html`, `signin.html`, `dashboard.html` and `assets/` at the
repo root are the **pre-Next.js static prototype** the React port was built from.
They are kept as a design reference and are not served. Delete them once you are
happy with the port.
