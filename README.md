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
  api/
    auth/[...nextauth]        Auth.js handlers
    register                  create user + account + risk profile + opening entry
    waitlist                  public, idempotent on email
    account                   GET  summary + positions + activity
    account/move              POST sandbox deposit / withdrawal
    account/vibe              PUT  change risk level (re-records acknowledgement)
    session/ephemeral         POST "keep me signed in" = off
    health                    liveness + DB check (Render health check)
components/
  Cursor.tsx                  the custom #dot cursor
  Landing.tsx                 the marketing page, ported to React
  SignupForm.tsx              5-step onboarding
  SigninForm.tsx              credentials sign-in
  Dashboard.tsx               KPI cards, feed, positions, activity, money dialog
lib/
  prisma.ts  password.ts  auth.ts  ledger.ts  vibes.ts  validation.ts  format.ts
prisma/schema.prisma
```

### Data model

- **User** — email (unique), `passwordHash` (scrypt), name, phone.
- **Account** — one per user; holds the risk `vibe` and status.
- **LedgerEntry** — append-only, signed cents. Balance = `SUM(amountCents)`.
- **RiskProfile** — the audit trail for a risk acknowledgement: which vibe, which
  disclosure version, and when. Updating the vibe re-records it.
- **WaitlistEntry** — marketing signups.

Passwords are hashed with Node's built-in **scrypt** (no native dependency, so
Render builds stay simple).

---

## What's real vs simulated

**Real (persisted in Postgres):**

- Registration, sign-in, sessions, sign-out, protected routes.
- Account, risk profile, and the risk-acknowledgement audit trail.
- Balances derived from the ledger; deposits and withdrawals as ledger entries.
- The dashboard **activity** list and all KPI figures.
- The marketing waitlist.

**Simulated (clearly labelled in the UI):**

- **Positions / allocation** — derived from `balance × vibe weights`
  (`lib/vibes.ts`). There is no broker, so these are illustrative.
- **Prices and the trade feed** — client-side sample data, labelled
  "sample data, not real trades".
- **Deposits / withdrawals** — write real ledger rows, but **no payment rail is
  connected**, so no money moves. Every entry they create says "Sandbox".

**Not implemented:** KYC/AML, email verification, password reset, bank linking,
notifications, admin tooling, and per-user session lifetime beyond the
"keep me signed in" cookie downgrade.

---

## Security notes

- The API is the security boundary: every data route calls `getSessionUser()`
  and returns 401 without a session. The `/dashboard` redirect is UX only.
- Passwords: scrypt with a per-user random salt, compared in constant time.
- Requests are validated with Zod before touching the database.
- **No middleware file on purpose** — Auth.js middleware would pull Prisma into
  the Edge runtime. Page-level gates + API checks cover it without that hazard.
- `AUTH_SECRET` must be set in every environment; it is never committed.

---

## Roadmap

| Phase | Scope |
|---|---|
| **0 · done** | Database, auth, ledger, authenticated dashboard, waitlist |
| **1** | Email verification, password reset, KYC screens, provider integration |
| **2** | Payment rail + broker in sandbox, real positions, statements, admin |
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
