-- Commission Reconciliation — Slice 1 re-pricing pass for Progressive.
-- The 31 NULL-expected Progressive ledger rows were unpriced because the rules
-- engine matches carrier NAME exactly and the ledger names (PROGRESSIVE MOUNTAIN
-- INS CO, …) never equalled the rule names (PROGRESSIVE MOUNTAIN, …). With the
-- alias map now covering both sides (slice1_seed_progressive.sql), this re-runs
-- pricing over the canonical name, replicating utils.lookupAndCalculate:
--   exact (canonical carrier + LOB + New/Renewal), '% of Premium' => premium*rate/100.
--
-- Result (2026-07-08): 10 rows priced (all New Business, +$3,988.93 expected).
-- The remaining 21 stay NULL: 19 renewals (rulebook has NO renewal_percent for
-- Progressive — a rules-completeness gap, NOT a name gap; do not invent a rate)
-- + 2 New Business rows with NULL gross_premium. Re-run reconcile after:
--   select public.reconcile_carrier('Progressive');

with alias as (
  select raw_name, canonical_carrier from public.carrier_alias_map
),
canon_rule as (
  select coalesce(a.canonical_carrier, r.carrier_name) as canon,
         lower(trim(r.lob)) as lob_key,
         r.commission_method, r.nb_percent, r.renewal_percent, r.lookup_priority
  from public.commission_rules r
  left join alias a on a.raw_name = r.carrier_name
  where r.active = true
),
target as (
  select l.id, l.gross_premium, l.is_renewal, lower(trim(l.lob)) as lob_key,
         coalesce(a.canonical_carrier, l.carrier_name) as canon
  from public.commission_ledger l
  left join alias a on a.raw_name = l.carrier_name
  where l.expected_commission is null
    and coalesce(a.canonical_carrier, l.carrier_name) = 'Progressive'
),
priced as (
  select distinct on (t.id) t.id,
    case when cr.commission_method = '% of Premium' and t.gross_premium is not null
         then round((t.gross_premium *
              (case when t.is_renewal then cr.renewal_percent else cr.nb_percent end) / 100.0)::numeric, 2)
         else null end as expected
  from target t
  join canon_rule cr on cr.canon = t.canon and cr.lob_key = t.lob_key
  where (case when t.is_renewal then cr.renewal_percent else cr.nb_percent end) is not null
  order by t.id, cr.lookup_priority asc nulls last
)
update public.commission_ledger l
set expected_commission = p.expected, updated_at = now()
from priced p
where l.id = p.id and p.expected is not null;
