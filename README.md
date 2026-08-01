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

> **Note:** the private (Tailscale) build **auto-signs-in** as a shared allowlisted
> account and shows no login screen — see *Private deployment* under RSG Ops Notes.
> Access is still enforced by RLS + the allowlist. Only the public/dev build shows
> the login gate below.

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

- **Architecture (current):** runs **privately on the `hermes-gretch` box**,
  Docker container `rsg-commission-tracker-tailnet` on `127.0.0.1:3300`, exposed
  **Tailscale-only** at `https://hermes-gretch.tail1cbc83.ts.net:8446/`
  (`tailscale serve --https=8446 http://127.0.0.1:3300`). It's embedded as the
  **Finance** lane of the RSG Master Workspace. The public **Cloud Run** service
  was **deleted** (2026-07-22) — there is no public URL anymore; the tailnet is
  the only way in. Data stays protected by Supabase RLS + the allowlist.
  - `npm run build` → static SPA in `dist/` + bundled server `dist/server.cjs`.
  - `Dockerfile` builds both stages; pass `VITE_SUPABASE_URL` +
    `VITE_SUPABASE_PUBLISHABLE_KEY` (browser-safe) as build args, plus the
    optional private-build auto-login args below.

### Private deployment — rebuild / rotate the shared login (the ONE command)

The private build **auto-signs-in** as a dedicated shared account
(`lc-rsg@risksolutionsgroup.net`, on the `app_allowlist`) so the Finance lane
shows **no login screen** — RLS still enforces access. To rebuild the container
(after a code change, or to rotate that shared password):

```bash
ssh hermes 'bash /opt/rsg-commission-tracker/setup-shared-login.sh'
```

That script (on the box) reads the Supabase service key from
`/opt/rsg-hermes/.env`, generates a fresh password for the shared account, sets
it via the GoTrue admin API, **verifies sign-in**, then rebuilds + restarts the
container. The password is saved to `/opt/rsg-commission-tracker/.autologin-pw`
(chmod 600) and baked into that private build only. Source lives at
`/opt/rsg-commission-tracker` (tar'd from this repo — the box can't clone it).

Auto-login is driven by two build args (empty in any public build → normal login
gate): `VITE_AUTOLOGIN_EMAIL`, `VITE_AUTOLOGIN_PASSWORD`. To rebuild as a
*different* existing account instead, use the interactive variant:
`ssh hermes 'bash /opt/rsg-commission-tracker/deploy-tailnet.sh'` (prompts for
email + password).

### Deploy to Cloud Run (DECOMMISSIONED — kept for history)

> The public Cloud Run service was deleted 2026-07-22 in favour of the private
> tailnet deployment above. The runbook below is retained only if it ever needs
> to be recreated.

### Deploy (the working path — do NOT use `gcloud run deploy --source`)

This service was originally created by Google AI Studio, which leaves a
`run.googleapis.com/sources` annotation on the revision template. That annotation
makes every `gcloud run deploy --source .` **and** `--image` deploy fail with:
`Source annotation has sources that are not referenced by a container`.
The reliable path is: build the image, push it, then apply a service YAML that
has the annotation stripped.

```bash
GC=/opt/homebrew/share/google-cloud-sdk/bin/gcloud   # gcloud isn't on the default PATH
PROJECT=pelagic-bison-486600-j0
IMG=us-east1-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/rsg-commission-tracker:v$(date +%Y%m%d-%H%M%S)

# 1. Build + push the container
$GC builds submit --tag "$IMG" --project $PROJECT --region us-east1

# 2. Export current service, strip the poison annotation, point at the new image
$GC run services describe rsg-commission-tracker --region us-east1 --project $PROJECT --format=export > /tmp/svc.yaml
python3 - "$IMG" <<'PY'
import sys,re
img=sys.argv[1]; s=open('/tmp/svc.yaml').read()
s='\n'.join(l for l in s.splitlines() if 'run.googleapis.com/sources' not in l)+'\n'
s=s.replace('image: scratch','image: '+img)          # AI Studio labels the container 'scratch'
open('/tmp/svc.yaml','w').write(s)
PY

# 3. Apply
$GC run services replace /tmp/svc.yaml --region us-east1 --project $PROJECT
```

**If step 1 crashes with `lost gzip_file` / `OSError: unexpected end of data`** —
a gcloud bug creating the source tarball on Python 3.12+ (hits every local Python
here, 3.11–3.14). Build the archive with system `tar` and submit it from GCS, which
skips gcloud's broken gzip path entirely:
```bash
tar czf /tmp/src.tgz --exclude=node_modules --exclude=dist --exclude=.git \
  --exclude='.env' --exclude='.env.local' .
$GC storage cp /tmp/src.tgz gs://${PROJECT}_cloudbuild/source/manual.tgz
$GC builds submit gs://${PROJECT}_cloudbuild/source/manual.tgz --config cloudbuild.yaml \
  --substitutions=_IMAGE=$IMG,_SUPA_URL=…,_SUPA_KEY=… --project $PROJECT --region us-east1
```
Then continue with steps 2–3 above. (`.gcloudignore` keeps the normal path's tarball
lean, but does not by itself fix the gzip crash.)

One-time setup already done (July 7 2026): created the Artifact Registry repo
`cloud-run-source-deploy` (us-east1), granted `roles/artifactregistry.writer` to
the compute + cloudbuild service accounts, enabled `cloudresourcemanager` API,
ran `gcloud auth configure-docker us-east1-docker.pkg.dev`.
- **Data spine:** Supabase `rsg-infrastructure` (project `wibscqhkvpijzqbhjphg`).
  - `commission_rules` (216 rows) — rate catalog, also feeds
    `portal_carrier_commissions` → **CarrierHub**.
  - `commission_ledger` — won policies / expected commission (WonPolicy).
  - `commission_reconciliation` — payment + discrepancy log.
- **File archive:** carrier statements + rate sheets are archived to **Nextcloud**
  (see the commission-inbox module); `commission_statements.archive_url` stores the path.
- **Never** commit real keys. Publishable key + URL only; service key stays in
  1Password (`rsg_infrastructure`).
- **Phase 2+ (not built):** NowCerts→ledger nightly ingest is **blocked** until
  the ~4,000 glitched duplicate policies are purged (HARD GATE). NowCerts is
  READ-ONLY for this system — no writes to the AMS, ever.
