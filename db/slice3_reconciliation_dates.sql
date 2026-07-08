-- Commission Reconciliation — dates on the reconciliation layer.
-- Applied to project wibscqhkvpijzqbhjphg 2026-07-08 as migration:
--   commission_recon_dates_on_exceptions.
-- Backfill so far (NowCerts, matched on policy_number + effective_date): the 3
-- canceled + 6 underpaid Progressive policies. Remaining ledger rows still NULL.
-- Adds effective date, expiration date, term length, and an expected pay month
-- to the exception queue, so a reconciler can see WHEN a policy's commission is
-- due and reason about term-length differences (6-mo vs annual vs 20-yr term life).
--
-- Sources (Lamar 2026-07-08): NowCerts AMS is the system of record for policy
-- dates. effective_date already lands on commission_ledger via the AMS ingest;
-- policy_expiration_date is added here and backfilled from NowCerts (see the
-- backfill runbook comment at the bottom). Carrier statements also carry both
-- dates (e.g. Progressive cols 2–3, now preserved in commission_transactions.raw_row)
-- as an independent cross-check.
--
-- Expected pay month is derived BY PAYMENT MODEL (carrier_commission_profile):
--   advance      -> paid ~at bind:      pay month = effective month
--   as_earned    -> trickles monthly:   window = effective month .. expiration month
--   hybrid/other -> model unconfirmed:  fall back to effective month, flag it
-- (One-time products like a 20-yr term life paid once at 90% of annual are an
--  AMOUNT rule in commission_rules, not a month rule — the effective-month pay
--  date still holds; the 90%/one-time factor is priced on the expected side.)

alter table public.commission_ledger
  add column if not exists policy_expiration_date date;

create or replace view public.v_reconciliation_exceptions with (security_invoker = true) as
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
  end                                                      as pay_basis
from public.commission_ledger l
left join public.carrier_alias_map am on am.raw_name = l.carrier_name
left join public.carrier_commission_profile cp
       on cp.carrier_name = coalesce(am.canonical_carrier, l.carrier_name)
where l.reconciliation_status in ('underpaid','overpaid','no_expected','missing_statement')
union all
select
  'unmatched_statement', 'unmatched_statement', t.carrier_name, t.policy_number,
  max(t.insured_name), null::numeric, round(sum(t.commission_amount)::numeric,2), null::numeric, max(t.lob),
  null::date, null::date, null::int, null::int, null::text
from public.commission_transactions t
where t.ledger_id is null
group by t.carrier_name, t.policy_number;

grant select on public.v_reconciliation_exceptions to authenticated, service_role;

-- ── Backfill runbook (run in an authed session; needs NowCerts + Supabase) ──
-- policy_expiration_date is NULL until backfilled. Populate from NowCerts (the
-- policy SoR) keyed on the ledger's nowcerts_policy_id:
--   for each commission_ledger row with nowcerts_policy_id and NULL expiration,
--   look up the NowCerts policy and set policy_expiration_date (and refresh
--   policy_effective_date if the ledger's is null). Statement-sourced dates in
--   commission_transactions.raw_row are the fallback for policies with no AMS link.
-- Until backfilled, term_months/pay_basis degrade gracefully (show '?').
