# Commission Reconciliation & Statement-Ingestion Build Spec

**Owner:** Lamar (RSG) · **Executor:** Claude Code · **Repo:** `rsg-commission-tracker`
**Written:** 2026-07-07 · **Status:** Slice 1 BUILT (uncommitted). Slices 2–3 pending.
**Supabase project:** `wibscqhkvpijzqbhjphg` (rsg-infrastructure, us-east1)
**Deploy target:** existing Cloud Run service `rsg-commission-tracker` (project `pelagic-bison-486600-j0`, region `us-east1`). **Do NOT migrate off Cloud Run.** See deploy runbook in `README.md` (the AI Studio `sources`-annotation workaround: build image → `gcloud builds submit` → export service YAML → strip `run.googleapis.com/sources` annotation → `gcloud run services replace`. Plain `gcloud run deploy --source` FAILS.).

**⚠️ Canonical schema lives in `db/slice1_schema.sql`** — that file is the applied, verified DDL (tables, `reconcile_carrier()`, 9 `v_*` views, RLS). This doc is the narrative + the not-yet-built parts (§6–§11). If they ever disagree, the SQL file wins for §2–§5.

---

## 0. Purpose

`commission_ledger` (existing) is the **snapshot / EXPECTED** side: one row per active policy = "what this policy should pay." This build adds the **transaction layer** = what carriers ACTUALLY paid, from uploaded statements → `commission_transactions`. Reconciliation joins them. Analytics recompute off real transactions (effective comm %, avg premium by segment, fee drag, monthly trend, NB-vs-renewal, loss-on-cancel).

**Golden rule:** once statements are uploaded, transactions are the source of truth; rollups recompute from them. Nothing hardcoded.

**Architecture boundary:** this is the MONEY system. Client PROFILE data lives in EspoCRM, joined by key (`client_id`/`espocrm_*`), never duplicated here.

**Slice 1 reconciliation result (2026-07-07, Progressive):** 54 statement policies vs 40 ledger; only 11 priced-and-matched ($6,173 actual vs $4,268 expected, +$1,905). $10,241 "paid but never priced" (25 policies, rules engine never matched — the §2c name-variant problem: 31 of 45 Progressive ledger rows had NULL expected). $3,071 on-statement-not-in-ledger (18 policies). Churn: 19 cancels = −$8,157 clawback, concentrated in Negril ATL (−$3,601, 2 cancels), Smart Integ (−$2,053), Frybaby (−$586). Real shorts to chase: Saw Jr Trucking −$115, Judith Fuller −$8.38. **→ the alias map (§2c) is the highest-leverage fix; it turns the $10,241 from invisible to reconciled.**

---

## 1. The earned-vs-advance distinction (core logic)

| Model | How paid | On mid-term cancel | RSG needs to see |
|---|---|---|---|
| **as_earned** | monthly as premium earned | stop earning, no clawback | **forgone commission** (opportunity loss on unearned remainder) |
| **advance** | full-term upfront at bind | carrier **claws back** unearned → NEGATIVE txn on later statement | **realized clawback** (real dollars back) |
| **hybrid** | varies by product | per-policy | flag for manual review |

Payment model is a **carrier-level** attribute (`carrier_commission_profile`), not per-transaction. Every cancel calc reads it to pick the math. **Retention tie-in:** each cancel = a lost policy with carrier/line/date/$; summed by client + carrier = the dollar cost of churn (`v_loss_on_cancel`), the number that aims marketing/retention.

---

## 2. Schema — CANONICAL in `db/slice1_schema.sql`. Summary:

- **2a. `commission_ledger` (EXISTING, reused, NOT recreated)** — the EXPECTED side. Already has: `expected_commission, actual_commission, delta (GENERATED — never assign), reconciliation_status, payment_timing, commission_basis, advance_amount, earned_to_date, unearned_balance (GENERATED), chargeback_expiry_date`, plus `client_id`/`espocrm_*` join keys. Reconciliation writes `actual_commission` + `reconciliation_status`.
- **2b. `carrier_commission_profile`** — carrier · `payment_model` (as_earned/advance/hybrid/confirm_on_upload) · default rates · clawback_window · statement_format · statement_parser_key.
- **2c. `carrier_alias_map`** — `raw_name` → `canonical_carrier`. **THE fix for the 31 NULL-expected rows**: PROGRESSIVE MOUNTAIN / PROGRESSIVE FREEDOM / bare PROGRESSIVE all collapse to canonical Progressive. Also GEICO MARINE/CHOICE→GEICO, STATE AUTOMOBILE MUT→State Auto, etc.
- **2d. `commission_statements`** — upload header: carrier · period · source_filename/format · carrier_stated_total_premium/commission/net_due (for cross-check) · row_count · upload_status.
- **2e. `commission_transactions`** — one row per statement line: statement_id · carrier_name · policy_number · insured_name · client_id · ledger_id · lob · segment · transaction_code (raw) · transaction_type (normalized: new/renewal/endorsement/cancel/chargeback/fee/adjustment) · transaction_date · month_key (YYYYMM) · gross_premium · commission_rate · commission_amount (signed) · is_negative (generated) · fee_type · fee_amount · raw_row (jsonb).

**RLS:** all new tables mirror `commission_ledger` — `is_commission_user()` allowlist for authenticated CRUD + `service_role` bypass. Views use `security_invoker=true` to respect it.

---

## 3. Statement parsers (per-carrier — every statement shaped differently)

Parser registry: `statement_parser_key` → parser module normalizing rows into `commission_transactions`. Built: `src/parsers/progressive_v1.ts`, `registry.ts`, `types.ts`.
- Each parser: file in → normalized txn rows + statement header (with carrier-stated totals) out.
- Normalize transaction_code → transaction_type via shared map; derive segment from lob, month_key from date.
- CSV/XLSX first, then PDF.
- Unknown carrier/format → stage + flag, don't guess.

### PDF handling — three tiers (Lamar adds carrier-DIRECT PDFs, some scanned)
1. **Text PDF** (Chenango, SolePro): `pdfplumber.extract_text()` works → parse.
2. **Scanned/image PDF** (extract_text empty/garbled): route through OCR (`commission_scan_tool` pattern), THEN parse. Detection: per-page text < ~100 chars or missing expected column keywords → OCR path.
3. **Complex portal PDF**: `extract_tables()` + per-carrier layout rules; low confidence → stage + flag.
Log path taken on the statement row (`extraction_method`: text/ocr/tables). **Same carrier, multiple formats:** BTIS delivers xlsx AND pdf — select parser by content shape + carrier, not extension. Dedupe on (carrier, policy, transaction_date, commission_amount) so duplicate formats never double-count.

**Upload flow:** file → detect carrier → pick parser → parse → write statement header + transactions → `reconcile_carrier()` → cross-check parsed vs carrier-stated totals → surface mismatch.

---

## 4. Reconciliation logic — CANONICAL in `reconcile_carrier()` (`db/slice1_schema.sql`)

Joins transactions → ledger on policy_number (via alias map for carrier). **actual_commission** = SUM(commission_amount) per policy (nets endorsements/cancels/chargebacks). Writes `actual_commission` + `reconciliation_status` ∈ {`matched`,`underpaid`,`overpaid`,`no_expected`,`missing_statement`,`rolled_up`(multi-term prior),`unmatched_statement`(txn w/ no ledger)}. `delta` is a GENERATED column — never assigned. Multi-term policies: latest term is primary (rn=1), older terms flagged `rolled_up` (this is why some "overpaid" are really multi-term sums vs single-term expected).

**Cancel handling — branch on payment_model:** `advance` → book realized clawback, update unearned/chargeback_expiry; `as_earned` → compute forgone commission = expected annual × unearned-term-fraction (NOT a negative txn); `confirm_on_upload` → flag `unconfirmed_model`, no forgone math.

---

## 5. Analytics views — CANONICAL in `db/slice1_schema.sql` (all 9 live, security_invoker)

`v_book_summary` · `v_comm_by_line` · `v_comm_by_carrier` · `v_nb_vs_renewal` · `v_avg_premium_by_segment` · `v_monthly_trend` (renders negative months honestly) · `v_fee_drag` · `v_loss_on_cancel` (the retention view — realized clawback vs forgone, by client + carrier) · `v_reconciliation_exceptions` (underpaid/overpaid/no_expected + unmatched_statement).

---

## 6. Progressive statement shape — `progressive_v1` (BUILT)

File: `DetailedStatement20260708 (1).xlsx`, sheet `Detailed` (parser only needs Detailed + Summary; Analysis/Dashboard are prior-session derived).
**Detailed cols (0-idx):** 0 Insured · 1 Policy# · 2 Eff · 3 Exp · 4 Prod(Auto/Commercial) · 5 Agt Pre · 6 Tran Code · 7 Tran Date · 8 Gross Prem · 9 DP Collected · 10 DP Submitted · 11 Billed · 12 Agency Due · 13 Comm rate · 14 Gross Comm · 15 Net Due Agent · 16 Prod Name · 17 Agent Code · 18 Month End(YYYYMM) · 19 Renewal Count.
**Summary cross-check:** net written premium 195,067.75, commission 19,486.28, MVR 168, net due agent 19,318.28.
**Tran codes:** New Business→new, Renewal→renewal, Endorsement→endorsement, Credit Endorsement→chargeback/adjustment, Cancel Pro Rate→cancel.
**Payment model — CONFIRMED `advance`** (2026-07-07): 19 Cancel Pro Rate rows / −$8,157 = advance signature. ('advance' correct for personal auto bulk; commercial-auto Progressive as hybrid edge case later — don't over-engineer.)

## 6b. Additional carrier shapes (starter batch, need parsers in Slice 2)

Source: `~/Desktop/Commission statements various carriers/`. **Five formats.** Rates observed: Progressive 8–15%, BTIS 12%, Steadily 15%, Chenango 10%, SolePro/AmTrust 7% WC.

- **BTIS Co-Direct — `btis_v1` — XLSX+PDF.** Header rows 0–4; cols at row 5: `Policy|Insured|Transaction|Invoice No.|Invoice Date|Trans. Effective|Gross|Comm. Rate|Comm. Amount|Current|31-60|61-90|Over 90`. Signed pairs `IN`(+)/`RA`(−) per policy; SKIP `Policy Total`/`Statement Total` rows (cross-check only). Aging → raw_row. Ex: TrueCraft Drywall 7039313569, +622.92/−520.44=102.48. **Model: likely advance — CONFIRM.**
- **Steadily — `steadily_v1` — XLSX.** Header row 0, one row per policy (pre-netted): `Effective Date|Payee & ID|Producer|Agent|Insured Name|Policy|New or Renewal Business|Premium (Current Term)|Premium Collected|Commission Rate|Total Commission Owed|Previously Paid|Net Due`. Multiple batch files in subfolder — ingest all, dedupe. Ex: Kelley Berry FR3-GA-24488945-00, New, $2,683, 15%, owed 402.45, prev 369.51, net 32.94. **Model: likely as_earned (Previously Paid tracking) — CONFIRM. NOTE 15% observed vs 12% on file → first alias/rate-conflict test (§10).**
- **Chenango Brokers — `chenango_v1` — PDF (text).** Cols: `Insured|Policy|Bill|A/R|Inv#|Eff Date|LOB/Chg|Tran|Rate|Agency Gross|Net|Payable|Payable Bal|Pay Amount`. Tran: NBS→new, RWL→renewal. Rate like `10.00%P`. Skip Totals row. **WHOLESALE BROKER**, not carrier.
- **SolePro — `solepro_v1` — PDF (text). Producer AGT5067.** Cols: `Customer|Policy#|Carrier|Effective|Coverage|Annual Premium|Comm Premium Recvd|Comm %|Commission Amt`. Ex: Precise Flo WSS3800287, **carrier=AMTRUST**, WC, $1,494, 7%, $10.43. **MGA writing AmTrust paper.** carrier_name=AmTrust, mga_name=SolePro. **Model: likely as_earned — CONFIRM.**
- **EXCLUDE:** `Fw_ Essigmann...` = forwarded QuickBooks payment email, NOT a statement. `Login and Agency Details.docx` = credentials.

**Paying-entity vs carrier:** BTIS/Chenango = wholesale brokers, SolePro = MGA (AmTrust). Capture BOTH `paying_entity` (who sent statement) and underlying `carrier_name`+`mga_name`. Don't collapse — needed for concentration analysis ("how much rides on BTIS").

---

## 7. Build order (slices)

- **Slice 1 (BUILT, uncommitted):** tables + RLS + `reconcile_carrier()` + 9 views + `progressive_v1` + load script + `v_book_summary` read in recon tab. **→ commit + deploy, set Progressive=advance, build alias map (§2c), re-reconcile.**
- **Slice 2:** upload UI + per-carrier parsers (§6b) + rate intake (§10) + Reconciliation & Rates tabs (§11a,c). CSV/XLSX before PDF.
- **Slice 3:** full Dashboard tab (§11b, all views) + Carriers tab (§11d) + statement-derived rate learning (§10) + Slack auto-ingest (§9).

**Firefighter-Architect gate:** each slice must produce a number Lamar ACTS on before the next is gold-plated. Money infra justified — earns expansion by being used, not pretty.

---

## 8. Data Lamar is feeding

PDFs/CSVs into `~/Desktop/Commission statements various carriers/` (and now `#commission-inbox`). Per carrier: name, format, **payment model**, rates. No-statement carriers → verbal rates seed the profile. Append new shapes to §6b.
**Payment models still to CONFIRM:** BTIS, Steadily, Chenango, SolePro. **Progressive = advance (confirmed).**

---

## 9. Slack-drop auto-ingest (Hermes module — AFTER parsers proven, Slice 3)

Lives in **Hermes** (Mac, existing scheduler + Slack app). **Trigger: Slack file-drop into `#commission-inbox` (CREATED 2026-07-07)** — Lamar is mobile; phone-drop beats a Mac folder. **Mode: auto-parse → stage → Slack-approve → commit** (Lamar explicitly kept the approval gate; money data never auto-commits).

**Flow:** file in `#commission-inbox` → `slack_read_file` (or poll channel 5–10min) → dedupe by content hash (`~/.hermes/commission_ingest_state.json`) → identify carrier+format (§3 PDF tiers) → parse to `commission_transactions_staging` (+staging_batch_id, ingest_status pending_review/approved/rejected) → cross-check parsed vs stated totals → **post review card to `#commission-inbox`** (carrier, rows, parsed vs stated, extraction method, `⚠️ OCR — spot-check` tag if OCR, flags) → on approve: move to `commission_transactions`, run `reconcile_carrier()`, archive PDF to Nextcloud (below), set upload_status=reconciled → on reject: mark rejected, money tables untouched. Non-statement files auto-skip.

**End-of-day summary (~6pm ET, `#commission-inbox`):** files received, batches committed, **batches still pending approval** (nag so nothing rots), anomalies, refreshed book totals (`v_book_summary`).

**File archiving → NEXTCLOUD (not Slack long-term, NOT Onyx):** on commit, upload original to `Commission Statements/{Carrier}/{YYYY}/{YYYY-MM-DD}_{filename}` (rate sheets → `Commission Rate Sheets/{Carrier}/...`), store path in `commission_statements.archive_url`. Use existing Hermes Nextcloud module. **Onyx is explicitly NOT in the pipeline** — it's a RAG/search layer, can't parse to tables. If Lamar ever wants to SEARCH across statements, point Onyx at the Nextcloud folder THEN as a read-only bolt-on.

**Tool split:** Slack=inbox (transient doorway) · Supabase=data (queryable numbers) · Nextcloud=file archive (audit/dispute) · Onyx=future optional search.

**Guardrails:** approval gate mandatory · OCR batches tagged · idempotent dedupe · never auto-delete · read-only from Slack, idempotent writes to Supabase.

---

## 10. Commission RATE intake — the "expected" side

Statements feed ACTUALS; a new policy needs `expected_commission` BEFORE any statement, from `commission_rules` (existing, 216 rows, lookup_priority 1–4 by carrier/MGA/state/LOB). Keeps rules growing + accurate as Lamar feeds rate info.

**Two kinds of commission PDF — classify before parsing:** (1) **statement** → commission_transactions (§9); (2) **rate sheet / commission schedule** → commission_rules (here); (3) **both** → extract each. Heuristic: per-policy txn rows+dates → statement; rate grid by LOB, no per-policy rows → rate sheet. Low confidence → ask in Slack card. One drop zone (`#commission-inbox`) for everything; system sorts.

**NEW `carrier_rate_intake` (staging):** batch_id, carrier, mga, lob, state, nb_percent, renewal_percent, source_type (rate_sheet/statement_derived/manual), source_file, observed_date, confidence (high=rate sheet/contract, medium=statement-derived, low=single obs), ingest_status, conflicts_with_rule_id, raw_row.

**Provenance columns to ADD to `commission_rules`:** source_type, source_file, observed_date, last_confirmed_date, confidence, superseded_by (old rates SUPERSEDED not deleted — audit trail), active.

**Rate-sheet flow:** parse grid → staging → compare to existing rule (carrier+mga+state+lob): no rule=gap fill; matches=bump last_confirmed+confidence; **disagrees=set conflicts_with_rule_id, flag, show BOTH in Slack card, Lamar picks** (authority: fresh rate_sheet > statement_derived > stale manual). Approve → write with provenance, supersede conflicts (active=false). New policies immediately pick up new expected rate.

**Self-correcting loop:** on reconcile, observed rate = commission÷premium per line vs the rule that priced it. ≈ → confirm (bump last_confirmed). Materially differs → stage statement_derived rate as possible correction, Lamar approves. **Statement teaches the rules table.** Medium confidence; a rate sheet always outranks.

**Why (accuracy-at-scale):** the failure mode of a growing rate table is conflicting numbers with no adjudication. Provenance + supersede-don't-delete gives every rate authority + history. Two dims govern lookup: **specificity** (lookup_priority 1–4, which rule applies) + **authority/recency** (provenance, which version to trust).

**Seed NOW (from tonight's statements, statement_derived/medium):** Progressive 8–15% (needs schedule to break out by LOB), BTIS 12%, Steadily 15%, Chenango 10%, SolePro/AmTrust 7% WC. Existing verified: NEXT 14.5%. **Steadily 15% observed vs 12% on file = first real conflict test.**

**Build order:** rate-sheet parser + carrier_rate_intake + provenance cols parallel with Slice 2. Self-correcting loop post-Slice-2. Rates tab UI Slice 2/3.

---

## 11. UI spec — the commission workspace (Slices 2–3)

**Current state (2026-07-07):** app has ONE dashboard read (`v_book_summary` in a recon tab) + Won Policies ledger w/ click-to-edit slide-over. Everything below NOT built. All 9 `v_*` views live in DB, almost none surfaced. Follow `/mnt/skills/public/frontend-design`; match existing App.tsx styling (navy/slate, Fraunces display, existing Tailwind + recharts).

**Design principle:** every view works at three zoom levels — **book → carrier → policy**. Drill DOWN, never dead-end. Make tonight's findings ($10,241 unpriced, 18 missing, $123 shorts, −$8,157 churn in 3 clients) impossible to miss.

**Tabs (add to nav):** `Ledger (exists) · Reconciliation · Dashboard · Rates · Carriers`

### 11a. RECONCILIATION tab (build FIRST, Slice 2)
- **Top strip — 4 clickable bucket cards** (from `v_reconciliation_exceptions` + summary): Priced&matched · Paid-never-priced · On-statement-not-in-ledger · In-ledger-not-on-statement. Click filters table.
- **Exception queue:** Client·Carrier·Policy#·LOB·Expected·Actual·Delta·Status badge. Sort shorts first (most-negative delta top = money owed). Red=underpaid, amber=no_expected, green=matched. Row click → slide-over showing ALL `commission_transactions` for that policy (NB+renewals+endorsements+cancels netting to actual — reveals why "overpaid" = multi-term). Filter chips: carrier/status/LOB. **"no_expected" rows get one-click "Fix rule"** → jumps to Rates tab pre-filtered to that carrier/LOB (the $10,241 workflow).
- **Churn panel** (`v_loss_on_cancel`): Client·Carrier·LOB·Cancel date·Clawback/Forgone $·basis badge. Toggle rollup by client/carrier. Sort $ lost desc (Negril ATL −$3,601 leads). Bridge to retention calls.

### 11b. DASHBOARD tab (Slice 3)
Filter bar (carrier/line/date) re-scopes all tiles. Surface all views: book summary, by-line, by-carrier (w/ paying-entity vs carrier concentration), NB-vs-renewal, avg premium by segment, monthly trend (negative months honest), fee drag. recharts. Mobile-legible.

### 11c. RATES tab (Slice 2/3, §10)
- **Rules table** (commission_rules + provenance): Carrier·MGA·LOB·State·NB%·Renewal%·Source badge·Confidence·Last confirmed·Active. Filter/sort by confidence (low first) or staleness. Inline edit → source_type=manual. Superseded rows under expandable history. **Coverage indicator: count of active ledger policies with NO matching rule** (tonight=31) — shrinks as Lamar feeds rates; the health metric.
- **Rate intake review queue** (carrier_rate_intake): pending items, proposed vs existing on conflict, approve/reject. In-app twin of the Slack card.

### 11d. CARRIERS tab (Slice 3, reference)
`carrier_commission_profile` mgmt: carrier·payment_model·default rates·is_broker_or_mga·clawback window·parser key (where Lamar confirms pending models). `carrier_alias_map` view: raw→canonical (see/fix the §2c collapses).

**UI build order:** Reconciliation (11a) → Rates (11c) [Slice 2] → Dashboard (11b) → Carriers (11d) [Slice 3].
**F-A gate (UI):** Reconciliation tab must show a number Lamar acts on before Dashboard gets gold-plated. Exception queue that recovers $123 + surfaces $10K = the job; pretty charts nobody acts on = a hobby.
