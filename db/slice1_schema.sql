-- Commission Reconciliation — Slice 1 schema (DDL only).
-- Spec: docs/COMMISSION_RECONCILIATION_BUILD_SPEC.md §2–§5.
-- Applied to Supabase project wibscqhkvpijzqbhjphg (rsg-infrastructure) as
-- migrations: commission_recon_slice1_tables, _reconcile_fn_v2, _views.
-- Reuses existing commission_ledger (EXPECTED side) untouched. Idempotent-ish:
-- tables use plain CREATE (drop first to re-run); functions/views CREATE OR REPLACE.
--
-- NOTE: reconciliation writes to commission_ledger.actual_commission and
-- reconciliation_status. commission_ledger.delta and .unearned_balance are
-- GENERATED columns — never assign them.

-- ── §2b carrier_commission_profile ─────────────────────────────────────────
create table if not exists public.carrier_commission_profile (
  id uuid primary key default gen_random_uuid(),
  carrier_name text not null unique,
  payment_model text not null default 'confirm_on_upload'
    check (payment_model in ('as_earned','advance','hybrid','confirm_on_upload')),
  default_nb_percent numeric,
  default_renewal_percent numeric,
  clawback_window_months integer,
  statement_format text,
  statement_parser_key text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── §2c carrier_alias_map ──────────────────────────────────────────────────
create table if not exists public.carrier_alias_map (
  id uuid primary key default gen_random_uuid(),
  raw_name text not null unique,
  canonical_carrier text not null,
  created_at timestamptz default now()
);

-- ── §2d commission_statements ──────────────────────────────────────────────
create table if not exists public.commission_statements (
  id uuid primary key default gen_random_uuid(),
  carrier_name text not null,
  statement_period_start date,
  statement_period_end date,
  source_filename text,
  source_format text,
  carrier_stated_total_premium numeric,
  carrier_stated_total_commission numeric,
  carrier_stated_net_due numeric,
  row_count integer,
  upload_status text default 'parsed' check (upload_status in ('parsed','reconciled','error')),
  uploaded_by text,
  created_at timestamptz default now()
);

-- ── §2e commission_transactions ────────────────────────────────────────────
create table if not exists public.commission_transactions (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid references public.commission_statements(id) on delete cascade,
  carrier_name text not null,
  policy_number text,
  insured_name text,
  client_id text,
  ledger_id uuid references public.commission_ledger(id),
  lob text,
  segment text,
  transaction_code text,
  transaction_type text,
  transaction_date date,
  month_key integer,
  gross_premium numeric,
  commission_rate numeric,
  commission_amount numeric,
  is_negative boolean generated always as (commission_amount < 0) stored,
  fee_type text,
  fee_amount numeric,
  raw_row jsonb,
  created_at timestamptz default now()
);
create index if not exists commission_transactions_carrier_name_idx on public.commission_transactions (carrier_name);
create index if not exists commission_transactions_policy_number_idx on public.commission_transactions (policy_number);
create index if not exists commission_transactions_month_key_idx on public.commission_transactions (month_key);
create index if not exists commission_transactions_transaction_type_idx on public.commission_transactions (transaction_type);
create index if not exists commission_transactions_statement_id_idx on public.commission_transactions (statement_id);
create index if not exists commission_transactions_ledger_id_idx on public.commission_transactions (ledger_id);

-- ── RLS: mirror commission_ledger (allowlist CRUD + service_role bypass) ────
do $$
declare t text;
begin
  foreach t in array array[
    'carrier_commission_profile','carrier_alias_map',
    'commission_statements','commission_transactions'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (is_commission_user());$p$, t||'_allowlist_select', t);
    execute format($p$create policy %I on public.%I for insert to authenticated with check (is_commission_user());$p$, t||'_allowlist_insert', t);
    execute format($p$create policy %I on public.%I for update to authenticated using (is_commission_user()) with check (is_commission_user());$p$, t||'_allowlist_update', t);
    execute format($p$create policy %I on public.%I for delete to authenticated using (is_commission_user());$p$, t||'_allowlist_delete', t);
    execute format($p$create policy %I on public.%I for all to service_role using (true) with check (true);$p$, t||'_service_role', t);
  end loop;
end $$;

-- ── §4 reconciliation write-back function ──────────────────────────────────
-- (See docs spec §4 for statuses. delta is a generated column; not assigned.)
create or replace function public.reconcile_carrier(
  p_canonical text,
  p_tolerance numeric default 1.00
) returns jsonb
language plpgsql
as $fn$
declare
  v_summary jsonb;
  v_model text;
begin
  select payment_model into v_model
  from public.carrier_commission_profile where carrier_name = p_canonical;

  create temporary table _pl on commit drop as
  with canon as (
    select l.id, l.policy_number, l.expected_commission,
      row_number() over (
        partition by coalesce(am.canonical_carrier, l.carrier_name), l.policy_number
        order by l.policy_effective_date desc nulls last,
                 l.policy_year desc nulls last,
                 l.created_at desc nulls last, l.id
      ) as rn
    from public.commission_ledger l
    left join public.carrier_alias_map am on am.raw_name = l.carrier_name
    where coalesce(am.canonical_carrier, l.carrier_name) = p_canonical
  )
  select id, policy_number, expected_commission, rn from canon;

  create temporary table _sums on commit drop as
  select policy_number,
         round(sum(commission_amount)::numeric, 2) as actual,
         count(*) as txn_count
  from public.commission_transactions
  where carrier_name = p_canonical
  group by policy_number;

  update public.commission_transactions t
  set ledger_id = pl.id
  from _pl pl
  where t.carrier_name = p_canonical and pl.rn = 1 and t.policy_number = pl.policy_number;

  update public.commission_transactions t
  set ledger_id = null
  where t.carrier_name = p_canonical
    and not exists (select 1 from _pl pl where pl.rn = 1 and pl.policy_number = t.policy_number);

  update public.commission_ledger l
  set actual_commission = s.actual,
      reconciliation_status = case
        when l.expected_commission is null then 'no_expected'
        when abs(s.actual - l.expected_commission) <= p_tolerance then 'matched'
        when s.actual < l.expected_commission then 'underpaid'
        else 'overpaid' end,
      updated_at = now()
  from _pl pl
  join _sums s on s.policy_number = pl.policy_number
  where pl.rn = 1 and l.id = pl.id;

  update public.commission_ledger l
  set actual_commission = null,
      reconciliation_status = 'missing_statement', updated_at = now()
  from _pl pl
  where pl.rn = 1 and l.id = pl.id
    and not exists (select 1 from _sums s where s.policy_number = pl.policy_number);

  update public.commission_ledger l
  set actual_commission = null,
      reconciliation_status = 'rolled_up', updated_at = now()
  from _pl pl
  where pl.rn > 1 and l.id = pl.id;

  update public.commission_statements set upload_status = 'reconciled'
  where carrier_name = p_canonical;

  select jsonb_build_object(
    'canonical', p_canonical,
    'payment_model', v_model,
    'tolerance', p_tolerance,
    'ledger_primary_rows', (select count(*) from _pl where rn = 1),
    'ledger_rolled_up', (select count(*) from _pl where rn > 1),
    'statement_policies', (select count(*) from _sums),
    'unmatched_statement_policies', (
       select count(*) from _sums s
       where not exists (select 1 from _pl pl where pl.rn = 1 and pl.policy_number = s.policy_number)),
    'status_breakdown', (
       select coalesce(jsonb_object_agg(reconciliation_status, c), '{}'::jsonb) from (
         select l.reconciliation_status, count(*) c
         from public.commission_ledger l
         join _pl pl on pl.id = l.id and pl.rn = 1
         group by 1) z)
  ) into v_summary;

  return v_summary;
end;
$fn$;

-- ── §5 analytics views (security_invoker → respect allowlist RLS) ───────────
create or replace view public.v_book_summary with (security_invoker = true) as
select count(*) as txn_count, count(distinct carrier_name) as carrier_count,
  count(distinct policy_number) as policy_count,
  round(sum(gross_premium)::numeric,2) as net_written_premium,
  round(sum(commission_amount)::numeric,2) as total_commission,
  round(sum(coalesce(fee_amount,0))::numeric,2) as fee_drag,
  round((sum(commission_amount)-sum(coalesce(fee_amount,0)))::numeric,2) as net_due,
  round((sum(commission_amount)/nullif(sum(gross_premium),0)*100)::numeric,2) as effective_comm_pct
from public.commission_transactions;

create or replace view public.v_comm_by_line with (security_invoker = true) as
select lob, count(*) as txn_count, count(distinct policy_number) as policy_count,
  round(sum(gross_premium)::numeric,2) as net_written_premium,
  round(sum(commission_amount)::numeric,2) as total_commission,
  round((sum(commission_amount)/nullif(sum(gross_premium),0)*100)::numeric,2) as effective_comm_pct,
  min(commission_rate) filter (where commission_rate>0) as min_rate,
  max(commission_rate) filter (where commission_rate>0) as max_rate
from public.commission_transactions group by lob order by net_written_premium desc nulls last;

create or replace view public.v_comm_by_carrier with (security_invoker = true) as
select carrier_name, count(*) as txn_count, count(distinct policy_number) as policy_count,
  round(sum(gross_premium)::numeric,2) as net_written_premium,
  round(sum(commission_amount)::numeric,2) as total_commission,
  round(sum(coalesce(fee_amount,0))::numeric,2) as fee_drag,
  round((sum(commission_amount)/nullif(sum(gross_premium),0)*100)::numeric,2) as effective_comm_pct,
  min(commission_rate) filter (where commission_rate>0) as min_rate,
  max(commission_rate) filter (where commission_rate>0) as max_rate
from public.commission_transactions group by carrier_name order by net_written_premium desc nulls last;

create or replace view public.v_nb_vs_renewal with (security_invoker = true) as
select transaction_type as business_type, count(*) as term_count,
  round(sum(gross_premium)::numeric,2) as written_premium,
  round(avg(gross_premium)::numeric,2) as avg_premium,
  round(sum(commission_amount)::numeric,2) as total_commission,
  round((sum(commission_amount)/nullif(sum(gross_premium),0)*100)::numeric,2) as effective_comm_pct
from public.commission_transactions where transaction_type in ('new','renewal')
group by transaction_type order by transaction_type;

create or replace view public.v_avg_premium_by_segment with (security_invoker = true) as
select segment, count(*) as term_count,
  round(avg(gross_premium)::numeric,2) as avg_premium,
  round(sum(gross_premium)::numeric,2) as written_premium
from public.commission_transactions
where transaction_type in ('new','renewal') and segment is not null
group by segment order by segment;

create or replace view public.v_monthly_trend with (security_invoker = true) as
select month_key, count(*) as txn_count,
  round(sum(gross_premium)::numeric,2) as net_premium,
  round(sum(commission_amount)::numeric,2) as commission,
  round(sum(coalesce(fee_amount,0))::numeric,2) as fees
from public.commission_transactions where month_key is not null
group by month_key order by month_key;

create or replace view public.v_fee_drag with (security_invoker = true) as
select carrier_name, coalesce(fee_type,'other') as fee_type,
  count(*) as fee_count, round(sum(coalesce(fee_amount,0))::numeric,2) as fee_total
from public.commission_transactions where fee_amount is not null and fee_amount<>0
group by carrier_name, coalesce(fee_type,'other') order by fee_total desc;

create or replace view public.v_loss_on_cancel with (security_invoker = true) as
select t.carrier_name, cp.payment_model, t.policy_number, t.insured_name, t.client_id,
  l.client_name, t.ledger_id, t.lob, t.segment, t.transaction_date, t.month_key,
  round(t.commission_amount::numeric,2) as realized_clawback,
  case when cp.payment_model='advance' then round(abs(t.commission_amount)::numeric,2)
       when cp.payment_model='as_earned' then null
       else round(abs(t.commission_amount)::numeric,2) end as loss_amount,
  case when cp.payment_model in ('advance','as_earned') then cp.payment_model
       else 'unconfirmed_model' end as loss_basis
from public.commission_transactions t
left join public.carrier_commission_profile cp on cp.carrier_name = t.carrier_name
left join public.commission_ledger l on l.id = t.ledger_id
where t.transaction_type='cancel';

create or replace view public.v_reconciliation_exceptions with (security_invoker = true) as
select 'ledger_variance' as exception_type, l.reconciliation_status,
  coalesce(am.canonical_carrier,l.carrier_name) as carrier_name, l.policy_number,
  l.client_name, l.expected_commission, l.actual_commission, l.delta
from public.commission_ledger l
left join public.carrier_alias_map am on am.raw_name=l.carrier_name
where l.reconciliation_status in ('underpaid','overpaid','no_expected')
union all
select 'unmatched_statement', 'unmatched_statement', t.carrier_name, t.policy_number,
  max(t.insured_name), null::numeric, round(sum(t.commission_amount)::numeric,2), null::numeric
from public.commission_transactions t where t.ledger_id is null
group by t.carrier_name, t.policy_number;

grant select on
  public.v_book_summary, public.v_comm_by_line, public.v_comm_by_carrier,
  public.v_nb_vs_renewal, public.v_avg_premium_by_segment, public.v_monthly_trend,
  public.v_fee_drag, public.v_loss_on_cancel, public.v_reconciliation_exceptions
to authenticated, service_role;
