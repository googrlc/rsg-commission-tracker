# Mid-term cancel dates

## The problem

When a policy cancels mid-term, NowCerts keeps the **original** term
`expiration_date` (still +6 / +12 months). Status becomes `Cancelled`, but the
portal was only showing that full-term end date — so a chargeback/clawback on
the statement looked like it came out of nowhere.

NowCerts also has a **`cancellationDate`** custom field (see hermes-core
`custom-fields-camelcase-audit.csv`). That field is **not** mapped into
`canonical_policies` today (`hermes_core.canonical._map_policy_volatile` only
copies status / effective / expiration). So the AMS cancel date never reaches
`commission_ledger`.

## What identifies a mid-term cancel

| Signal | Source | Role |
|---|---|---|
| `expiration_date` | NowCerts → ledger `policy_expiration_date` | **Original term end** (keep it) |
| `cancellation_date` | NowCerts `cancellationDate` (not synced yet) | AMS SoR cancel date |
| Statement cancel date | `commission_transactions` where type ∈ {cancel, chargeback} | Operational fallback today |
| Mid-term? | `cancel_date < expiration_date` | Why a chargeback makes sense |

## Estimated chargeback (automatic)

When a cancel date is known, the portal (and `hermes_finance.cancel_math`)
pro-rates the unearned remainder of the term:

```
unearnedFraction = daysRemaining / termDays   # [effective → expiration)
amount           = expected_commission × unearnedFraction
```

| Carrier `payment_model` | Lead figure | Meaning |
|---|---|---|
| **advance** | estimated chargeback | Carrier should claw back the unearned $ |
| **as_earned** | estimated forgone | No clawback; opportunity loss on remainder |
| **hybrid / unconfirmed** | est. (review) | Same pro-rata $, flagged for manual review |

Cancel on/after original term end → **$0**. Missing dates or expected → no
estimate. If statement cancel/chargeback lines already posted, the UI also shows
**realized** clawback next to the estimate.

## What this repo does

1. **Portal UI** — Exception queue "Term end / Cancel" + **Est. chargeback**
   columns, slide-over estimate card, and Churn per-policy cancel dates. Cancel
   dates are joined from statement lines until the AMS field is synced.
2. **Math** — `src/utils/cancelChargeback.ts` and
   `backend/hermes_finance/cancel_math.py` (pytest-covered).
3. **`db/slice8_midterm_cancel_dates.sql`** — adds
   `commission_ledger.cancellation_date`, `v_policy_cancel_dates`, and extends
   `v_reconciliation_exceptions` with `cancel_date` / `is_mid_term_cancel`.
   Apply on the Supabase project when ready.

## What still belongs in rsg-hermes-core

1. Add `cancellation_date` to `canonical_policies`.
2. Map NowCerts `cancellationDate` / `CancellationDate` in `_map_policy_volatile`.
3. Commission sync: copy `canonical_policies.cancellation_date` (+ status) onto
   `commission_ledger.cancellation_date`.
4. **Never** overwrite `policy_expiration_date` with the cancel date — that
   collapses “mid-term cancel” into “short term” and breaks the badge.
