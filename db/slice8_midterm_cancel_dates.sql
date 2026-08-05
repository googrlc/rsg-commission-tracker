-- Mid-term cancel dates on the reconciliation surface.
--
-- Problem: NowCerts keeps the ORIGINAL term expiration when a policy cancels
-- mid-term (status=Cancelled, expiration still +6mo/+12mo). The portal was
-- showing that full-term expiration with no cancel date, so a chargeback looked
-- unexplained. NowCerts also has cancellationDate (custom field) but
-- rsg-hermes-core's canonical_policies mapper does NOT sync it yet — that is
-- the durable SoR fix (separate core change). Until then, the statement
-- Cancel Pro Rate / chargeback line date is the operational cancel date.
--
-- This slice:
--   1. Adds commission_ledger.cancellation_date (AMS SoR landing spot).
--   2. Rebuilds v_reconciliation_exceptions with:
--        cancel_date          — coalesce(ledger.cancellation_date, max cancel/chargeback txn date)
--        is_mid_term_cancel   — cancel_date < policy_expiration_date
--   3. Keeps expiration_date as the ORIGINAL term end (never overwrite with cancel).
--
-- Apply on the Supabase project after review. Idempotent.

alter table public.commission_ledger
  add column if not exists cancellation_date date;

comment on column public.commission_ledger.cancellation_date is
  'AMS (NowCerts) cancellation date. Distinct from policy_expiration_date (original term end). Mid-term cancel when cancellation_date < policy_expiration_date.';

-- Per-policy cancel evidence from statement lines (fallback when AMS date null).
create or replace view public.v_policy_cancel_dates with (security_invoker = true) as
select
  coalesce(am.canonical_carrier, t.carrier_name) as carrier_name,
  t.policy_number,
  min(t.transaction_date) filter (
    where t.transaction_type in ('cancel', 'chargeback')
  ) as statement_cancel_date,
  count(*) filter (
    where t.transaction_type in ('cancel', 'chargeback')
  )::int as cancel_chargeback_lines,
  round(sum(t.commission_amount) filter (
    where t.transaction_type in ('cancel', 'chargeback')
  )::numeric, 2) as cancel_chargeback_total
from public.commission_transactions t
left join public.carrier_alias_map am on am.raw_name = t.carrier_name
where t.policy_number is not null
group by 1, 2
having min(t.transaction_date) filter (
  where t.transaction_type in ('cancel', 'chargeback')
) is not null;

grant select on public.v_policy_cancel_dates to authenticated, service_role;

-- Rebuild exceptions with cancel_date + mid-term flag.
-- Preserves columns added after slice3 (term_type, *_count) when present on ledger
-- via left joins to transaction aggregates — same shape the portal already selects.
create or replace view public.v_reconciliation_exceptions with (security_invoker = true) as
with txn_type_counts as (
  select
    coalesce(am.canonical_carrier, t.carrier_name) as carrier_name,
    t.policy_number,
    count(*) filter (where t.transaction_type = 'new')::int as new_count,
    count(*) filter (where t.transaction_type = 'renewal')::int as renewal_count,
    count(*) filter (where t.transaction_type = 'endorsement')::int as endorsement_count,
    count(*) filter (where t.transaction_type in ('cancel', 'chargeback'))::int as cancel_count
  from public.commission_transactions t
  left join public.carrier_alias_map am on am.raw_name = t.carrier_name
  group by 1, 2
)
select
  'ledger_variance'                                       as exception_type,
  l.reconciliation_status                                 as reconciliation_status,
  coalesce(am.canonical_carrier, l.carrier_name)          as carrier_name,
  l.policy_number, l.client_name, l.expected_commission,
  l.actual_commission, l.delta, l.lob,
  l.policy_effective_date                                 as effective_date,
  l.policy_expiration_date                                as expiration_date,
  case when l.policy_effective_date is not null and l.policy_expiration_date is not null
       then (extract(year  from age(l.policy_expiration_date, l.policy_effective_date)) * 12
            + extract(month from age(l.policy_expiration_date, l.policy_effective_date)))::int
       end                                                as term_months,
  case when l.policy_effective_date is not null
       then (extract(year from l.policy_effective_date) * 100
            + extract(month from l.policy_effective_date))::int
       end                                                as expected_pay_month,
  case coalesce(cp.payment_model, 'confirm_on_upload')
    when 'advance'   then 'advance — full at bind ('        || coalesce(to_char(l.policy_effective_date,'YYYY-MM'),'?') || ')'
    when 'as_earned' then 'as earned — monthly '           || coalesce(to_char(l.policy_effective_date,'YYYY-MM'),'?')
                        || ' → ' || coalesce(to_char(l.policy_expiration_date,'YYYY-MM'),'?')
    when 'hybrid'    then 'hybrid — confirm per policy'
    else 'model unconfirmed — set carrier profile'
  end                                                      as pay_basis,
  case when l.is_renewal then 'Renewal' else 'New' end     as term_type,
  coalesce(tc.new_count, 0)                               as new_count,
  coalesce(tc.renewal_count, 0)                           as renewal_count,
  coalesce(tc.endorsement_count, 0)                       as endorsement_count,
  coalesce(tc.cancel_count, 0)                            as cancel_count,
  -- Prefer AMS cancellation_date; fall back to first statement cancel/chargeback.
  coalesce(l.cancellation_date, cd.statement_cancel_date) as cancel_date,
  case
    when coalesce(l.cancellation_date, cd.statement_cancel_date) is null then false
    when l.policy_expiration_date is null then true
    else coalesce(l.cancellation_date, cd.statement_cancel_date) < l.policy_expiration_date
  end                                                      as is_mid_term_cancel
from public.commission_ledger l
left join public.carrier_alias_map am on am.raw_name = l.carrier_name
left join public.carrier_commission_profile cp
       on cp.carrier_name = coalesce(am.canonical_carrier, l.carrier_name)
left join public.v_policy_cancel_dates cd
       on cd.policy_number = l.policy_number
      and cd.carrier_name = coalesce(am.canonical_carrier, l.carrier_name)
left join txn_type_counts tc
       on tc.policy_number = l.policy_number
      and tc.carrier_name = coalesce(am.canonical_carrier, l.carrier_name)
where l.reconciliation_status in (
  'underpaid','overpaid','no_expected','missing_statement','canceled'
)
union all
select
  'unmatched_statement', 'unmatched_statement', t.carrier_name, t.policy_number,
  max(t.insured_name), null::numeric, round(sum(t.commission_amount)::numeric,2), null::numeric, max(t.lob),
  null::date, null::date, null::int, null::int, null::text,
  null::text, 0, 0, 0,
  count(*) filter (where t.transaction_type in ('cancel','chargeback'))::int,
  min(t.transaction_date) filter (where t.transaction_type in ('cancel','chargeback')),
  min(t.transaction_date) filter (where t.transaction_type in ('cancel','chargeback')) is not null
from public.commission_transactions t
where t.ledger_id is null
group by t.carrier_name, t.policy_number;

grant select on public.v_reconciliation_exceptions to authenticated, service_role;

-- ── Follow-up (rsg-hermes-core, NOT this repo) ──────────────────────────────
-- Map NowCerts Policy.cancellationDate → canonical_policies.cancellation_date
-- (column + _map_policy_volatile), then commission sync copies it onto
-- commission_ledger.cancellation_date. Until that lands, cancel_date above is
-- statement-derived only.
