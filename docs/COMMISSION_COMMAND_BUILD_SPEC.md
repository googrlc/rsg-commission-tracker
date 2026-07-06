# RSG Commission Command — Build Spec (for Claude Code)
Date: 2026-07-06 · Owner: Lamar · Status: Ready to build (see HARD GATE)

## Goal
One surface for the money lifecycle: policy written in NowCerts → lands in
Supabase commission_ledger with expected commission computed → carrier
statements reconciled against it → shortages worked as a queue (Gretchen).
CarrierHub (rsg-carrierhub) remains the appetite front door. Same spine.

## Spine (already exists — do NOT create new tables without checking)
Supabase project: wibscqhkvpijzqbhjphg (rsg-infrastructure)
- commission_rules (216 rows): rates by carrier/lob/state/tier.
  Lookup: filter carrier+lob+state(GA→ALL), ORDER BY lookup_priority ASC LIMIT 1.
- commission_ledger (0 rows, 35 cols): the working table. Key fields:
  nowcerts_policy_id (UNIQUE upsert key), policy_number, carrier_name, lob,
  client_name, gross_premium, expected_commission, actual_commission, delta,
  reconciliation_status, commission_rule_id, rsg_net_commission.
- commission_reconciliation (0 rows): discrepancy queue. delta, discrepancy_type,
  priority, assigned_to, resolution_notes, amount_recovered.
- portal_carrier_commissions (view): read-only feed for CarrierHub UI.
- medicare_carriers: contacts only. Medicare rate load deferred to Sept 2026.

## HARD GATE — do not skip
NowCerts currently contains ~4,000 glitched duplicate policies pending bulk
delete (ETA within 48h of 2026-07-06). The ingest job (Phase 2) MUST NOT run
until Lamar confirms the purge is complete. Additionally: exclude any policy
tagged PURGE-POLICY-2026-07 as a permanent belt-and-suspenders filter.

## Non-negotiable guardrails
1. NowCerts is READ-ONLY for this system. No writes to the AMS, ever.
   (Policy Sync v2 wrote back and created the 4,000-dupe incident. Retired.)
2. All ingest is idempotent: upsert keyed on nowcerts_policy_id. Re-running
   the job N times yields identical state.
3. Tracker app requires Supabase Auth (email allowlist: Lamar + Gretchen)
   BEFORE any real data renders. Client names + premiums + income are not
   public-URL material.
4. No API keys in frontend code or git. Server-side env only. Keys live in
   1Password "RSG Infrastructure" vault; runtime copies in env/secrets.

## Phase 1 — Tracker app → Supabase + Auth
Repo: googrlc/rsg-commission-tracker (Vite/React/TS, src/App.tsx ~3100 lines,
currently localStorage/seed data in src/utils.ts).
- Add @supabase/supabase-js. Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY.
- Supabase Auth: email OTP/magic link, allowlist enforcement via RLS
  (policies on commission_ledger/reconciliation: authenticated role only).
  Remove anon read access to these two tables if any exists.
- Map app models → tables:
  CarrierRule ↔ commission_rules (read; edits allowed for Lamar).
  WonPolicy ↔ commission_ledger (read + manual add/edit for non-AMS items
  like PEO deals; manualExpectedAmount → expected_commission w/ method Manual).
  ReconciliationStatement ↔ commission_reconciliation + actual_commission
  on ledger rows. Chargebacks: negative received / transaction_type.
  CarrierSchedule ↔ commission_schedule table (verify schema before mapping).
- Keep existing UI/UX. Data layer swap only. Delete seed data.
- Deploy: existing Cloud Run service rsg-commission-tracker
  (project 339396843209, us-east1) via gcloud run deploy, or re-import to
  AI Studio if gcloud auth is unavailable. Verify auth wall before sharing URL.

## Phase 2 — NowCerts → ledger ingest (post-purge ONLY)
New Hermes module: hermes/commissions/ in rsg-hermes (Python, local Mac,
launchd-scheduled like existing jobs).
- Nightly pull via Momentum/NowCerts API: policies created/modified since
  last watermark (store watermark in Supabase, table hermes_job_state or
  equivalent — check for existing pattern in hermes/digest/).
- For each policy: compute expected_commission from commission_rules lookup
  (carrier+lob+state, priority ASC). If no rule matches → insert ledger row
  with reconciliation_status='needs_rule' and expected NULL. Never guess.
- Upsert on nowcerts_policy_id. Log inserts/updates/skips to Slack
  #systems-check (C0ANSEP6SSD) as a one-line summary, not per-row spam.
- One-time backfill script for current active book (~104 policies) after
  purge confirmation. Same code path as nightly (idempotency proves itself).
- pytest suite required (follow hermes/renewals/ precedent: ~14 tests).
  Minimum: rule lookup precedence, no-rule path, idempotent re-run, purge-tag
  exclusion, watermark advance.

## Phase 3 — Statement ingestion & reconciliation
- Input: carrier statement CSV/XLSX/PDF. Prefer momentum-mcp
  commission_scan_tool output where usable; else parse in Hermes.
- Match statement lines → ledger rows (policy_number + carrier fuzzy).
  Set actual_commission, compute delta. |delta| > $1 → create
  commission_reconciliation row (priority by $ size, assigned_to Gretchen
  by default). Unmatched statement lines → reconciliation row with
  discrepancy_type='unmatched_statement_line'.
- Tracker UI: reconciliation queue view with resolve/recover actions,
  writing resolution_notes + amount_recovered.

## Phase 4 — Medicare (September 2026, calendar item — DO NOT BUILD NOW)
Schema already supports CMS flat per-app rates (flat_fee), plan_name,
tier_label, advance_months, chargeback_period_months. Load 2027 CMS rates
+ carrier schedules during AEP prep.

## Acceptance (Phase 1+2 done means)
- Lamar/Gretchen log in; strangers with the URL see a login wall.
- Nightly job runs; a policy written yesterday shows expected commission
  computed from the correct rule (spot-check 5 across carriers/LOBs).
- Re-running the job changes nothing (idempotency check).
- Zero write calls to NowCerts anywhere in the codebase (grep-verifiable).
