-- Commission Reconciliation — cancel-handling fix (spec §4.3, previously unimplemented).
--
-- BUG: reconcile_carrier classified every policy with the single rule
--   actual < expected  =>  'underpaid'
-- A CANCELED policy nets to its pro-rated actual (e.g. Shamara Douglas: full-term
-- expected ~$564, but the policy canceled so only $131 was ever owed and paid).
-- The old logic reported the $433 gap as a carrier SHORTAGE TO CHASE, when it is
-- actually CHURN (a realized clawback / forgone commission). Same dollars were
-- already booked in v_loss_on_cancel, so cancels were double-counted: once right
-- (churn) and once wrong (a phantom short in Gretchen's chase queue).
--
-- FIX: a policy that has any cancel/chargeback transaction is reconciled as
-- 'canceled' — its actual is correct, it leaves the shorts queue, and the gap
-- lives only as churn (v_loss_on_cancel + the new canceled_* summary fields).
--
-- Applied to project wibscqhkvpijzqbhjphg 2026-07-08 as migrations:
--   commission_recon_cancel_branch_fn (function), commission_recon_summary_canceled_bucket (view).
-- Followed by: select public.reconcile_carrier('Progressive');  (reclassified 3 canceled policies).
--
-- This CREATE OR REPLACE keeps the
-- SECURITY DEFINER + allowlist guard that the live function already carries
-- (migration commission_recon_reconcile_fn_guard). Before applying, dump the
-- current definition to confirm nothing else has diverged:
--   select pg_get_functiondef('public.reconcile_carrier(text,numeric)'::regprocedure);
-- EXECUTE grants/revokes survive CREATE OR REPLACE, so anon stays revoked.
--
-- NOTE: commission_ledger.delta and .unearned_balance are GENERATED — never assigned.

create or replace function public.reconcile_carrier(
  p_canonical text,
  p_tolerance numeric default 1.00
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_summary jsonb;
  v_model text;
begin
  -- Allowlist guard (mirrors commit_ingest_batch): a self-signup authenticated
  -- user who isn't a commission user cannot run reconciliation.
  if not (is_commission_user() or session_user in ('postgres','supabase_admin','service_role')) then
    raise exception 'reconcile_carrier: not authorized';
  end if;

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

  -- Per-policy actuals. has_cancel flags any cancel/chargeback line so the status
  -- CASE can branch on it (spec §4.3). Net actual already reflects the clawback
  -- for advance carriers, so no separate math is needed to get the true earned $.
  create temporary table _sums on commit drop as
  select policy_number,
         round(sum(commission_amount)::numeric, 2) as actual,
         count(*) as txn_count,
         bool_or(transaction_type in ('cancel','chargeback')) as has_cancel
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
        when s.has_cancel then 'canceled'                       -- §4.3: churn, not a short
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
    'canceled_policies', (select count(*) from _sums where has_cancel),
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

-- §11a health strip gains a Canceled (churn) bucket. 'canceled' MUST be included
-- in the status filter or those policies (and their correct actual) vanish from
-- the summary entirely. canceled_churn = expected − actual = the lost commission.
create or replace view public.v_reconciliation_summary with (security_invoker = true) as
with l as (
  select reconciliation_status s, actual_commission a, expected_commission e
  from public.commission_ledger
  where reconciliation_status in ('matched','underpaid','overpaid','no_expected','missing_statement','canceled')
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
  (select cnt from u) as unmatched_count, (select amt from u) as unmatched_actual,
  -- appended last: CREATE OR REPLACE VIEW can only add columns at the end.
  count(*) filter (where s = 'canceled')                                                   as canceled_count,
  coalesce(round(sum(a) filter (where s = 'canceled')::numeric,2),0)                       as canceled_actual,
  coalesce(round(sum(e - a) filter (where s = 'canceled')::numeric,2),0)                   as canceled_churn
from l;
grant select on public.v_reconciliation_summary to authenticated, service_role;

-- v_reconciliation_exceptions is unchanged here: its filter already lists only
-- ('underpaid','overpaid','no_expected','missing_statement'), so 'canceled'
-- policies drop out of the shorts/chase queue automatically. They remain visible
-- as churn via v_loss_on_cancel (the Churn panel).
