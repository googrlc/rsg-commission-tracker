# AGENTS.md

## Cursor Cloud specific instructions

This repo is one app made of two toolchains (see `README.md` "Run locally"):

- Frontend/UI at the repo root — Vite/React 19/TypeScript + a thin Express server (`server.ts`). Package manager is **npm** (`package-lock.json`). Node 22 is preinstalled.
- Commission service in `backend/` — Python 3.11+/FastAPI. Package manager is **pip** (`pyproject.toml`, no lockfile). Installed with `pip install -e '.[dev]'`.

Standard commands are already documented in `README.md`, `backend/README.md`, and `package.json` scripts. Notable: `npm run dev` (Express+Vite on :3000), `npm run lint` (= `tsc --noEmit`), `npm run build`, and `npm test` is intentionally a **no-op** (frontend has no unit tests; parsing/reconciliation tests live in `backend/` under pytest).

### Non-obvious gotchas discovered during setup

- **Backend install is blocked in this environment.** `backend/pyproject.toml` pins `rsg-hermes-core @ git+https://github.com/googrlc/rsg-hermes-core@<sha>`, a **private** repo that is not reachable here (`git clone` → `Repository not found`, even with the preconfigured `gh` token). Because of this, `pip install -e '.[dev]'` fails and neither `rsg-finance-api` (FastAPI :8801) nor `pytest` can run. Running the backend requires GitHub credentials with access to `googrlc/rsg-hermes-core`.

- **The SPA needs Supabase env to render at all.** With no `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`, the app throws before mounting and the page is blank. Create a `.env.local` (gitignored) from `.env.example`. Any non-empty URL+key lets the React shell mount; **real** browser-safe values (URL + publishable key, RLS-gated — never the service_role key) are needed to load actual data. Env is read at Vite startup (`vite.config.ts` `define`), so **restart `npm run dev` after editing `.env.local`.**

- **A faithful local Supabase cannot be built from this repo alone.** The SQL in `db/` is not self-contained: `slice1_schema.sql` reuses an existing `commission_ledger` table and every RLS policy calls `is_commission_user()` — neither is defined anywhere in this repo (they live in the external private `rsg-hermes` infrastructure, along with `app_allowlist`). Use a real hosted Supabase project instead of trying to reconstruct the schema locally.

- **Login behavior differs by build.** The public/dev build renders through with no login screen (`AuthGate` in `src/lib/auth.tsx`); Supabase RLS is the real boundary. The private tailnet build auto-signs-in via `VITE_AUTOLOGIN_EMAIL` / `VITE_AUTOLOGIN_PASSWORD` build args. Data still requires an allowlisted account session under RLS.

- **Statement writes require the backend.** Reads go browser → Supabase directly; every statement write is proxied `/api/finance/*` → the Python service on :8801. With the backend down, reports render but uploads/approvals fail by design.
