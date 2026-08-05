# Agency Bill & agency fees

## Why

**Agency Bill** policies are billed by RSG, not the carrier. They still earn
commission, but they should not look like a missing carrier-statement short on
the Money workstation.

**Agency fees** are dollars RSG charges the insured (policy fee / admin fee) —
separate from carrier commission. NowCerts carries them as `agencyFee`.

## Fields

| Column | Source | Meaning |
|---|---|---|
| `billing_type` | NowCerts `billingType` | `Direct Bill` / `Agency Bill` / `* 100` |
| `agency_fee_amount` | NowCerts `agencyFee` | Fee charged by the agency |

Land on `canonical_policies` and `commission_ledger`. Commission sync also seeds
`admin_fee_amount` when that column exists (classic “% of Admin Fee” rate basis).

## Worklist rule

- Agency Bill stays on the chase list until received/retained commission is booked
- Badge **Agency Bill** so Pending ≠ “waiting on Progressive PDF”
- Agency fee is shown next to expected commission (income to the shop, not a short)

## Apply

1. Hermes migration `supabase/migrations/20260805160000_billing_type_agency_fee.sql`
   **or** this repo’s `db/slice9_agency_bill_fees.sql` (ledger only)
2. Redeploy Hermes API; append `billing_type,agency_fee_amount` to
   `LEDGER_COLUMNS` in `hermes/commissions/surface.py` once the columns exist
3. Run commission sync so AMS values land on open ledger rows
