# Commission API (`backend/`)

The Python service behind the tracker UI in this repo's root. Both live here
because they are one app — that is the polyglot repo split: two toolchains, one
thing to reason about.

Serves 12 routes on **:8801** — `/api/commissions`, `/api/commission-rules`,
`/api/commission-statements`.

```bash
cd backend
pip install -e '.[dev]'
rsg-finance-api               # or: uvicorn hermes_finance.service:app --port 8801
pytest                        # 120 tests
```

## The money gate

Carrier statements **stage** on upload and commit only on an explicit, named
approval, checked against `agency_crm_users`. A batch that is not pending
review, parsed nothing, or failed its totals crosscheck is refused. Nothing here
writes to the AMS — an override corrects the portal value and retires itself
once the AMS reports the same thing.

## No queue worker, deliberately

Finance's sync is a scheduled job, not a drained queue, so `SPEC` lists no
`queue_object_types`. Adding one without an executor that honours the backoff
would produce a retry that silently never happens.

## The shared core

```
rsg-hermes-core @ git+https://github.com/googrlc/rsg-hermes-core@8a85a2f3964bc45ca23646c9e70ee0fe7b8d0aba
```

Pinned by sha, so a core change lands here when this app takes it. It is
published from `rsg-hermes` via `scripts/publish-core.sh` — never commit to
the core repo directly, it is a mirror.

The commission ledger's persistence, the Supabase and NowCerts clients, the
`portal_overrides` store and the canonical policy book all come from there.
This repo owns the commission logic and nothing else.

## What stayed in rsg-hermes

`test_commission_provenance.py` — it exercises the natural-language agent,
which is the hub's, not this service's.
