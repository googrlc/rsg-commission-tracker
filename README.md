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

- **Architecture:** LIVE on **Google Cloud Run** at
  https://rsg-commission-tracker-339396843209.us-east1.run.app
  (project `pelagic-bison-486600-j0`, project number `339396843209`, region
  `us-east1`). An earlier note here claimed a migration to Elestio was underway;
  that never happened — Cloud Run is the real, current home. Scales to zero, ~free
  for a two-user internal app.
  - `npm run build` → static SPA in `dist/` + bundled server `dist/server.cjs`.
  - `npm start` (`NODE_ENV=production node dist/server.cjs`) serves it on `$PORT`
    (default 3000).
  - `Dockerfile` builds both stages; pass `VITE_SUPABASE_URL` and
    `VITE_SUPABASE_PUBLISHABLE_KEY` as build args.

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

One-time setup already done (July 7 2026): created the Artifact Registry repo
`cloud-run-source-deploy` (us-east1), granted `roles/artifactregistry.writer` to
the compute + cloudbuild service accounts, enabled `cloudresourcemanager` API,
ran `gcloud auth configure-docker us-east1-docker.pkg.dev`.
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
