# The commission runner — what runs unattended, and what never will

The money lifecycle is: a policy is written in NowCerts → it lands on
`commission_ledger` with an expected commission → carrier statements are
reconciled against it → the shortfalls get worked. Everything in that sentence
happens on a schedule now except the one step that shouldn't: **nothing approves
a statement but a person, by name.**

## The nightly chain (America/New_York)

| Time | Job | Where it lives | What it does |
|---|---|---|---|
| 2:20 | `hermes --sync-canonical-book` | rsg-hermes | NowCerts → `canonical_clients` / `canonical_policies`. Upsert by GUID, never deletes. **This is the new-business + renewal pull.** |
| 2:25 | `hermes --sync-commissions` | rsg-hermes | Book → `commission_ledger` EXPECTED side. Preserves statement-sourced actuals. |
| 2:30 | `hermes --renewal-refresh` | rsg-hermes | Rebuilds renewal candidates from the same book. |
| 2:40 | `hermes --commission-inbox` | rsg-hermes (mirrored) | Stages every new statement in the Nextcloud drop folder. |
| 2:50 | `hermes --commission-reconcile` | rsg-hermes (mirrored) | Links orphaned statement lines, then re-derives actual/status for every affected ledger row. |
| 6:00 | `hermes --commission-watchdog` | rsg-hermes (mirrored) | Checks the chain above actually ran and that coverage still balances. Alerts `#systems-check` only on a problem. |
| 6:15 | `hermes --commission-dq` | rsg-hermes | Report-only AMS vs rulebook vs ledger anomalies (NB/renewal, rate, timing, Agency Bill). See rsg-hermes `docs/commission-dq.md`. |

The first three already existed and work — `canonical_policies` and the ledger
were both refreshed by them this morning. The last three are what this repo
adds. Commission DQ lives in rsg-hermes (not mirrored here).

### Why reconcile runs on a clock

`run_rollup` used to fire only when a human approved a statement. A ledger row's
status is *derived* — from its transactions, against its term — so a row whose
term ended last week kept saying `missing_statement` ("more statements
expected") until somebody happened to upload something. It should say
`underpaid`, and somebody should be chasing it. That transition needs no new
money and no new upload, which is exactly why it needs a clock.

### Why the poller only stages

`--poll-inbox` reads the drop folder and creates a `pending_review` batch per
file, with its parse, its crosscheck, and a preview of where every line would
land. It does **not** create a statement, book a transaction, or touch the
ledger. Dropping a file in a folder is not an approval, and the approver's name
on a money write is the property worth never automating away.

Re-polling is free: a file already staged has the same `content_hash` and the
database rejects it before a line is parsed. The folder never needs clearing for
correctness.

## Running the jobs

**On the box** (this is what cron calls, and how the jobs were verified live):

```bash
ssh hermes
cd /opt/rsg-hermes
docker compose run --rm hermes hermes --commission-watchdog
docker compose run --rm hermes hermes --commission-inbox --commission-runner-dry-run
docker compose run --rm hermes hermes --commission-reconcile --commission-runner-dry-run
```

**From this repo** (same code, split-app namespace):

```bash
cd backend
pip install -e '.[dev]'
rsg-finance-jobs --watchdog                 # read-only; exits 1 if it finds a problem
rsg-finance-jobs --poll-inbox --dry-run     # lists what it would stage, downloads nothing
rsg-finance-jobs --reconcile --dry-run      # reports every status change without writing
```

Every job takes a dry-run flag (`--commission-runner-dry-run` on the box,
`--dry-run` here). The watchdog exits non-zero on a problem so a supervisor
notices even if Slack doesn't — and note it *does* post to Slack unless you pass
the dry-run flag, since alerting is the job.

### Environment

| Variable | Default | What it does |
|---|---|---|
| `HERMES_COMMISSION_INBOX` | `Commissions/Inbox` | Nextcloud folder the poller watches |
| `HERMES_COMMISSION_POLLER_ID` | `commission-inbox-poller` | The `uploaded_by` on a polled batch — deliberately not a person |
| `HERMES_COMMISSION_ALERT_CHANNEL` | `#systems-check` | Where the watchdog complains |
| `HERMES_COMMISSION_SINCE` | `2026-01-01` | The seeding floor. Read by both the seeder and the coverage report, so they can never disagree |
| `HERMES_OCR_MAX_PAGES` / `HERMES_OCR_DPI` | `15` / `180` | Bound the OCR tier's cost |
| `HERMES_STATEMENT_OCR_MODEL` | gateway default | Vision model for scanned statements |

Nextcloud and Supabase credentials come from the same env the rest of the box
uses (`NEXTCLOUD_*`, `SUPABASE_*`). If Nextcloud isn't configured the poller
says so rather than reporting "0 files" — those are different answers.

## What the watchdog checks

1. **Did the nightly chain run?** `commission_ledger.updated_at` older than 36h
   (`HERMES_COMMISSION_STALE_HOURS`) means the 2:25 seed didn't run — and since
   it reads the book the 2:20 sync refreshes, the sync probably didn't either.
   A dead cron otherwise looks exactly like a quiet week.

   It deliberately does **not** alarm on `canonical_policies`. That table has no
   `updated_at` — only `created_at`, which moves when a *new policy* appears,
   not when the sync runs. Several days this month added none at all, so a
   freshness rule there would fire on a quiet fortnight and train everyone to
   ignore the channel. The newest-policy date is reported as context instead.
2. **Does coverage balance?** Every active policy must fall into exactly one
   bucket: on the ledger, excluded by status, excluded by the date floor, or
   missing. If the buckets don't sum to the book, a policy fell off the map.
3. **Is work piling up?** Batches stuck in `pending_review`, statement lines
   that never matched a policy, and ledger rows with no expected commission
   (i.e. no matching rule — 23 rows today).

Healthy runs post nothing. A channel that only speaks when something is wrong
stays a channel people read.

## Statement ingestion: one path

There used to be three ways money reached `commission_transactions`:

1. the browser, parsing in-page and inserting straight over supabase-js;
2. this service, staging then committing on approval;
3. the `commit_ingest_batch()` SQL RPC.

(1) is gone. It had no staging, no dedupe and no named approver, and it called a
*different* reconciler (`reconcile_carrier`) than the service does — so the same
file loaded twice could double-count, and the two writers disagreed about what a
row's status meant. The browser now posts to the service and shows its review
card; reads still go straight to Supabase under RLS.

The carrier knowledge that lived only in the browser was ported to
`backend/hermes_finance/carriers.py` first, so nothing was lost with it:

* **Progressive** — fixed column positions, and the Summary sheet's own stated
  totals, which now make the crosscheck automatic instead of hand-typed. Its MVR
  lines (money in *Agency Due*, zero commission) stay fees; booked as commission
  they read as a carrier paying nothing on a live policy.
* **NEXT** — as-earned, so the statement carries both a cumulative "paid to
  date" and an incremental "paid this month". Only the incremental column is
  summable across monthly statements. Loading the cumulative one re-books every
  prior month, every month.

`transaction_type` was also aligned to the vocabulary already in the table
(`renewal`, `endorsement`, `adjustment`, `cancel`, `new`, `fee`,
`reinstatement`). The Python parser previously collapsed cancel/endorsement/
reinstatement into `adjustment`; as the sole writer it would have started naming
the same event differently from the 182 rows already on file.

## PDF statements

PDFs used to be refused, for a good reason: a mis-read column on money data
doesn't look like a failure, it looks like a successful parse. They are read
now, in two tiers, and neither is trusted enough to commit on its own.

* **Text layer** (`pdf_text`) — PyMuPDF's table finder reads the PDF's own text.
  Deterministic; the same file yields the same rows forever.
* **OCR** (`pdf_ocr`) — only when there is no text layer. Pages are rendered and
  transcribed by the vision model through the same gateway intake uses.

Both produce raw header→cell rows that go through the *same* `parse_row` as a
CSV, so the alias table, the money coercion and the subtotal-line exclusion all
still apply.

**Neither tier can be committed silently.** A PDF batch carries
`requires_confirmation`, and `POST /approve` refuses it unless the approver
sends `confirmed_source: true` — the UI makes that a separate checkbox stating
they compared the lines against the document. A CSV names its own columns and
needs no such attestation.

An unreadable PDF says which problem it is: "not installed on this build" (fix
the box) and "could not be opened" (re-export the file) are different errors and
send you to different places.

## Deploying this

**Production serves `rsg-hermes`'s copy of this code, not this repo's.** The
`rsg-hermes-finance` container is built from `/opt/rsg-hermes` and imports
`hermes/commissions/` — the same modules that live here as
`backend/hermes_finance/`. The two are kept in step by hand; the only namespace
difference is `hermes_finance.X` ↔ `hermes.commissions.X`.

So a change here is **not live** until it is mirrored, committed to rsg-hermes,
and both images are rebuilt on the box:

```bash
ssh hermes
cd /opt/rsg-hermes && git fetch origin && git reset --hard origin/main
docker compose build hermes                      # the image cron runs
docker compose -f docker-compose.yml -f docker-compose.services.yml \
  --profile services up -d --build hermes-finance # the API on :8801
```

Both are needed: the API serves the UI, and `docker compose run --rm hermes` —
what every cron line uses — runs from a *different* image that must be rebuilt
separately. Rebuilding only one is the easy mistake.

### Cron (not yet enabled)

```cron
# Commission statement inbox — stage new drops (never commits) 2:40am ET
40 2 * * * cd /opt/rsg-hermes && docker compose run --rm hermes hermes --commission-inbox >> /root/hermes-cron.log 2>&1
# Commission reconcile — link orphan lines, re-derive status 2:50am ET
50 2 * * * cd /opt/rsg-hermes && docker compose run --rm hermes hermes --commission-reconcile >> /root/hermes-cron.log 2>&1
# Commission pipeline watchdog — alerts #systems-check only on a problem, 6:00am ET
0 6 * * * cd /opt/rsg-hermes && docker compose run --rm hermes hermes --commission-watchdog >> /root/hermes-cron.log 2>&1
```

Run each once by hand with `--commission-runner-dry-run` before enabling the
line. That is the same go-live discipline the book sync used, and the reason it
went in cleanly.

### The UI

`/opt/rsg-commission-tracker` is a tarball of this repo (the box cannot clone
it), rebuilt with `bash /opt/rsg-commission-tracker/setup-shared-login.sh`. That
script passes `FINANCE_API_URL=http://172.17.0.1:8801` — the docker bridge
gateway, because the tracker sits on the default bridge while the finance
service publishes 8801 on the host. Without it the app defaults to
`127.0.0.1:8801`, which inside a container is the container itself.

### The UI's proxy

The browser reaches the service at `/api/finance/*`, which both `server.ts`
(production) and Vite (dev) forward to `FINANCE_API_URL`
(default `http://127.0.0.1:8801`). The service is not published to the tailnet —
same-origin through the app server means no CORS surface and no second address
to secure. The tracker container will need `FINANCE_API_URL` pointing at the
finance container, and the two on a shared docker network.
