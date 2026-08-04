# AGENTS.md

## Cursor Cloud specific instructions

This repo is one app made of two toolchains (see `README.md` "Run locally"):

- Frontend/UI at the repo root — Vite/React 19/TypeScript + a thin Express server (`server.ts`). Package manager is **npm** (`package-lock.json`). Node 22 is preinstalled.
- Commission service in `backend/` — Python 3.11+/FastAPI. Package manager is **pip** (`pyproject.toml`, no lockfile). Installed with `pip install -e '.[dev]'` from `backend/` (or `pip install -e './backend[dev]'` from the repo root). Entry points land in `~/.local/bin` — ensure that is on `PATH` (`export PATH="$HOME/.local/bin:$PATH"`).

Standard commands are already documented in `README.md`, `backend/README.md`, and `package.json` scripts. Notable: `npm run dev` (Express+Vite on :3000), `npm run lint` (= `tsc --noEmit`), `npm run build`, backend `rsg-finance-api` (:8801), `pytest` in `backend/` (~185 tests). Frontend `npm test` is intentionally a **no-op**.

### Non-obvious gotchas discovered during setup

- **Private `rsg-hermes-core` dependency needs `GH_TOKEN`.** `backend/pyproject.toml` pins `rsg-hermes-core @ git+https://github.com/googrlc/rsg-hermes-core@<sha>`. The default Cursor GitHub token cannot read that private repo. With secret `GH_TOKEN` (a PAT that can read `googrlc/rsg-hermes-core`), configure a credential helper that reads the env var at clone time — do **not** embed the token in `url.*.insteadOf` (that writes the secret into `~/.gitconfig`):

  ```bash
  git config --global credential.helper '!f() { if [ -n "$GH_TOKEN" ]; then echo "username=x-access-token"; echo "password=$GH_TOKEN"; fi; }; f'
  ```

  Then `pip install -e './backend[dev]'` succeeds. Without `GH_TOKEN`, backend install / `rsg-finance-api` / `pytest` all fail.

- **The SPA needs Supabase env to render at all.** With no `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`, the app throws before mounting and the page is blank. Create a `.env.local` (gitignored) from `.env.example`. Any non-empty URL+key lets the React shell mount; **real** browser-safe values (URL + publishable key, RLS-gated — never the service_role key) are needed to load actual data. Env is read at Vite startup (`vite.config.ts` `define`), so **restart `npm run dev` after editing `.env.local`.**

- **Backend writes need the service role key.** `hermes_integrations.supabase_client` requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_KEY`). Without them the finance API still boots and `/health` works, but `/api/commission-statements` (and other write routes) 500 on `deps.get_supa()`.

- **A faithful local Supabase cannot be built from this repo alone.** The SQL in `db/` is not self-contained: `slice1_schema.sql` reuses an existing `commission_ledger` table and every RLS policy calls `is_commission_user()` — neither is defined anywhere in this repo (they live in the external private `rsg-hermes` infrastructure, along with `app_allowlist`). Use the hosted Supabase project instead of trying to reconstruct the schema locally.

- **Login behavior differs by build.** The public/dev build renders through with no login screen (`AuthGate` in `src/lib/auth.tsx`); Supabase RLS is the real boundary. The private tailnet build auto-signs-in via `VITE_AUTOLOGIN_EMAIL` / `VITE_AUTOLOGIN_PASSWORD` build args. Data still requires an allowlisted account session under RLS.

- **Statement writes require the backend.** Reads go browser → Supabase directly; every statement write is proxied `/api/finance/*` → the Python service on :8801 (the client path is `/api/finance` + `/api/commission-statements` → upstream `/api/commission-statements`). With the backend down, reports render but uploads/approvals fail by design.
