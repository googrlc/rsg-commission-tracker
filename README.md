# RSG Commission Tracker & Reconciliation

Get commission rates out of your head, compute expected commissions on won
policies, and reconcile carrier payments to catch shorts before feeding
QuickBooks. Phase 1 of the **Commission Command** build spec
(`docs/COMMISSION_COMMAND_BUILD_SPEC.md`).

## Run locally

**Prerequisites:** Node.js 22+

1. `npm install`
2. Copy `.env.example` → `.env.local` and set the Supabase values (see below).
3. `npm run dev` — runs the Express + Vite dev server on http://localhost:3000
   (`npm run dev:vite` for the plain Vite server).

## Configuration (Supabase)

Only the **URL** and the **publishable** key are needed — both are browser-safe
and gated by Row Level Security. **Never** put the Supabase `service_role` /
secret key in this app.

```
VITE_SUPABASE_URL="https://wibscqhkvpijzqbhjphg.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_…"
```

`vite.config.ts` also accepts the un-prefixed `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY`.

## Auth

Login is required before any data renders (Supabase Auth, email magic-link + OTP
code fallback). Access is restricted to the `app_allowlist` table in Supabase
(currently Lamar = admin, Gretchen = user; both `@risksolutionsgroup.net`). Add a
user with:

```sql
insert into app_allowlist (email, display_name, is_admin)
values ('someone@risksolutionsgroup.net', 'Name', false);
```

For magic links to resolve on a deployed origin, add that origin to
**Supabase → Authentication → URL Configuration** (Site URL + Redirect URLs).
The 6-digit OTP code path works without this.

---

## RSG Ops Notes (July 2026)

- **Architecture:** deploys as a **Docker container on RSG's Elestio infra**
  (same as Onyx, Hermes, EspoCRM). The old Google Cloud Run / AI Studio path is
  being retired.
  - `npm run build` → static SPA in `dist/` + bundled server `dist/server.cjs`.
  - `npm start` (`NODE_ENV=production node dist/server.cjs`) serves it on `$PORT`
    (default 3000).
  - `Dockerfile` builds both stages; pass `VITE_SUPABASE_URL` and
    `VITE_SUPABASE_PUBLISHABLE_KEY` as build args.
- **Data spine:** Supabase `rsg-infrastructure` (project `wibscqhkvpijzqbhjphg`).
  - `commission_rules` (216 rows) — rate catalog, also feeds
    `portal_carrier_commissions` → **CarrierHub**.
  - `commission_ledger` — won policies / expected commission (WonPolicy).
  - `commission_reconciliation` — payment + discrepancy log.
- **Onyx** (appetite knowledge base): https://onyx-1t6jv-u69864.vm.elestio.app
- **Never** commit real keys. Publishable key + URL only; service key stays in
  1Password (`rsg_infrastructure`).
- **Phase 2+ (not built):** NowCerts→ledger nightly ingest is **blocked** until
  the ~4,000 glitched duplicate policies are purged (HARD GATE). NowCerts is
  READ-ONLY for this system — no writes to the AMS, ever.
