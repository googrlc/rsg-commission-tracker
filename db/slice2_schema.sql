-- Commission Reconciliation — Slice 2/3 schema (DDL only).
-- Spec §10 (rate-intake rail + rules provenance) + §11 UI support views.
-- Applied to Supabase wibscqhkvpijzqbhjphg as migrations:
--   commission_recon_slice2_rate_intake, _summary_view, _exceptions_add_lob(_v2),
--   _exceptions_add_missing.

-- §10 commission_rules provenance columns (audit trail; edits supersede, never delete).
alter table public.commission_rules
  add column if not exists source_type text
    check (source_type in ('rate_sheet','statement_derived','manual')),
  add column if not exists observed_date date,
  add column if not exists last_confirmed_date date,
  add column if not exists confidence text check (confidence in ('high','medium','low')),
  add column if not exists superseded_by uuid references public.commission_rules(id);

-- §10 carrier_rate_intake — pending rate rows awaiting approval (in-app twin of the Slack card).
create table if not exists public.carrier_rate_intake (
  id uuid primary key default gen_random_uuid(),
  carrier_name text not null,
  canonical_carrier text,
  lob text, sub_lob text, state text, mga_name text,
  proposed_nb_percent numeric, proposed_renewal_percent numeric, flat_fee numeric,
  commission_method text default '% of Premium',
  source_type text default 'rate_sheet' check (source_type in ('rate_sheet','statement_derived')),
  source_document text,
  observed_date date,
  confidence text default 'medium' check (confidence in ('high','medium','low')),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  conflict_rule_id uuid references public.commission_rules(id),
  raw jsonb, reviewed_by text, reviewed_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists carrier_rate_intake_status_idx on public.carrier_rate_intake (status);
create index if not exists carrier_rate_intake_carrier_idx on public.carrier_rate_intake (canonical_carrier);

alter table public.carrier_rate_intake enable row level security;
create policy carrier_rate_intake_allowlist_select on public.carrier_rate_intake for select to authenticated using (is_commission_user());
create policy carrier_rate_intake_allowlist_insert on public.carrier_rate_intake for insert to authenticated with check (is_commission_user());
create policy carrier_rate_intake_allowlist_update on public.carrier_rate_intake for update to authenticated using (is_commission_user()) with check (is_commission_user());
create policy carrier_rate_intake_allowlist_delete on public.carrier_rate_intake for delete to authenticated using (is_commission_user());
create policy carrier_rate_intake_service_role on public.carrier_rate_intake for all to service_role using (true) with check (true);

-- Let the app run reconciliation via RPC after an upload. reconcile_carrier is
-- SECURITY DEFINER (temp tables + ledger writes run as owner) but carries an
-- in-body guard: `is_commission_user() OR session_user in (postgres/…)`, so a
-- self-signup authenticated user who isn't allowlisted is rejected. Default
-- PUBLIC/anon EXECUTE is revoked; only authenticated may call it.
-- (Guarded function body lives with the function in migrations; see
--  commission_recon_reconcile_fn_guard.)
revoke execute on function public.reconcile_carrier(text, numeric) from public;
revoke execute on function public.reconcile_carrier(text, numeric) from anon;
grant execute on function public.reconcile_carrier(text, numeric) to authenticated;

-- §11c coverage indicator: unpriced (NULL-expected) ledger rows per canonical carrier.
create or replace view public.v_rule_coverage with (security_invoker = true) as
select coalesce(am.canonical_carrier, l.carrier_name) as carrier,
       count(*) as ledger_policies,
       count(*) filter (where l.expected_commission is null) as unpriced,
       count(*) filter (where l.expected_commission is not null) as priced
from public.commission_ledger l
left join public.carrier_alias_map am on am.raw_name = l.carrier_name
group by 1 order by unpriced desc;
grant select on public.v_rule_coverage to authenticated, service_role;

-- §11a 4-bucket health strip.
create or replace view public.v_reconciliation_summary with (security_invoker = true) as
with l as (
  select reconciliation_status s, actual_commission a, expected_commission e
  from public.commission_ledger
  where reconciliation_status in ('matched','underpaid','overpaid','no_expected','missing_statement')
),
u as (
  select coalesce(round(sum(commission_amount)::numeric,2),0) amt, count(distinct policy_number) cnt
  from public.commission_transactions where ledger_id is null
)
select
  count(*) filter (where s in ('matched','underpaid','overpaid'))                          as priced_matched_count,
  coalesce(round(sum(a) filter (where s in ('matched','underpaid','overpaid'))::numeric,2),0) as priced_matched_actual,
  count(*) filter (where s = 'underpaid')                                                  as underpaid_count,
  coalesce(round(sum(a - e) filter (where s = 'underpaid')::numeric,2),0)                  as underpaid_delta,
  count(*) filter (where s = 'overpaid')                                                   as overpaid_count,
  count(*) filter (where s = 'no_expected')                                                as no_expected_count,
  coalesce(round(sum(a) filter (where s = 'no_expected')::numeric,2),0)                    as no_expected_actual,
  count(*) filter (where s = 'missing_statement')                                          as missing_count,
  (select cnt from u) as unmatched_count, (select amt from u) as unmatched_actual
from l;
grant select on public.v_reconciliation_summary to authenticated, service_role;

-- §11a exception queue gains lob + missing_statement rows (see slice1_schema.sql for base).
create or replace view public.v_reconciliation_exceptions with (security_invoker = true) as
select 'ledger_variance', l.reconciliation_status, coalesce(am.canonical_carrier, l.carrier_name),
       l.policy_number, l.client_name, l.expected_commission, l.actual_commission, l.delta, l.lob
from public.commission_ledger l
left join public.carrier_alias_map am on am.raw_name = l.carrier_name
where l.reconciliation_status in ('underpaid','overpaid','no_expected','missing_statement')
union all
select 'unmatched_statement', 'unmatched_statement', t.carrier_name, t.policy_number,
       max(t.insured_name), null::numeric, round(sum(t.commission_amount)::numeric,2), null::numeric, max(t.lob)
from public.commission_transactions t where t.ledger_id is null
group by t.carrier_name, t.policy_number;
grant select on public.v_reconciliation_exceptions to authenticated, service_role;