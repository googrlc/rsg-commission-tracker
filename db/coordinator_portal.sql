-- Commission Statement Coordinator portal — roles, control log, handoff,
-- escalations, and agency-bill prep desks.
-- Apply on the hosted Supabase project (RLS helpers is_commission_user /
-- app_allowlist already live in Hermes infra). Idempotent.

-- ── Capabilities RPC (SPA auth) ─────────────────────────────────────────────
-- Approver = app_allowlist.is_admin; everyone else allowlisted is coordinator.
create or replace function public.commission_user_capabilities()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_admin boolean;
begin
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' or not public.is_commission_user() then
    return jsonb_build_object(
      'role', null,
      'can_approve', false,
      'allowlisted', false,
      'email', nullif(v_email, '')
    );
  end if;
  select coalesce(a.is_admin, false) into v_admin
    from public.app_allowlist a
   where lower(a.email) = v_email
   limit 1;
  if coalesce(v_admin, false) then
    return jsonb_build_object(
      'role', 'approver',
      'can_approve', true,
      'allowlisted', true,
      'email', v_email
    );
  end if;
  return jsonb_build_object(
    'role', 'coordinator',
    'can_approve', false,
    'allowlisted', true,
    'email', v_email
  );
end;
$$;

grant execute on function public.commission_user_capabilities() to authenticated;
grant execute on function public.commission_user_capabilities() to service_role;

-- ── Ingest batch handoff (coordinator → approver) ───────────────────────────
alter table public.commission_ingest_batches
  add column if not exists prep_checklist jsonb not null default '{}'::jsonb,
  add column if not exists prepared_by text,
  add column if not exists prepared_at timestamptz,
  add column if not exists handoff_status text not null default 'draft';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'commission_ingest_batches_handoff_status_check'
  ) then
    alter table public.commission_ingest_batches
      add constraint commission_ingest_batches_handoff_status_check
      check (handoff_status in ('draft', 'ready_for_approval', 'returned'));
  end if;
end $$;

-- ── Carrier Control Log ─────────────────────────────────────────────────────
create table if not exists public.carrier_control_entries (
  id uuid primary key default gen_random_uuid(),
  carrier_name text not null,
  mga_name text,
  producer_code text,
  portal_url text,
  billing_mode text not null default 'direct_bill'
    check (billing_mode in ('direct_bill', 'agency_bill')),
  payment_model text not null default 'unknown'
    check (payment_model in ('advance', 'as_earned', 'hybrid', 'unknown')),
  statement_period text not null,
  expected_statement_date date,
  statement_date date,
  payment_date date,
  statement_number text,
  status text not null default 'not_due'
    check (status in (
      'not_due', 'ready_to_retrieve', 'retrieved', 'uploaded_pending_review',
      'needs_mapping', 'needs_review', 'approved', 'rejected_correction',
      'missing_from_carrier', 'carrier_dispute', 'closed'
    )),
  row_count int,
  gross_premium numeric,
  total_positive_commission numeric,
  total_chargebacks numeric,
  net_commission numeric,
  payment_reference text,
  original_filename text,
  retrieval_date date,
  carrier_stated_total numeric,
  parsed_total numeric,
  total_difference numeric,
  difference_severity text
    check (difference_severity is null or difference_severity in (
      'exact', 'rounding', 'low', 'medium', 'high', 'critical', 'missing_carrier_total'
    )),
  batch_id uuid references public.commission_ingest_batches(id),
  archive_path text,
  notes text,
  next_action text,
  prepared_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists carrier_control_entries_status_idx
  on public.carrier_control_entries (status);
create index if not exists carrier_control_entries_period_idx
  on public.carrier_control_entries (statement_period);
create index if not exists carrier_control_entries_expected_idx
  on public.carrier_control_entries (expected_statement_date);

alter table public.carrier_control_entries enable row level security;
drop policy if exists cce_allowlist_select on public.carrier_control_entries;
drop policy if exists cce_allowlist_insert on public.carrier_control_entries;
drop policy if exists cce_allowlist_update on public.carrier_control_entries;
drop policy if exists cce_allowlist_delete on public.carrier_control_entries;
drop policy if exists cce_service_role on public.carrier_control_entries;
create policy cce_allowlist_select on public.carrier_control_entries
  for select to authenticated using (is_commission_user());
create policy cce_allowlist_insert on public.carrier_control_entries
  for insert to authenticated with check (is_commission_user());
create policy cce_allowlist_update on public.carrier_control_entries
  for update to authenticated using (is_commission_user()) with check (is_commission_user());
create policy cce_allowlist_delete on public.carrier_control_entries
  for delete to authenticated using (is_commission_user());
create policy cce_service_role on public.carrier_control_entries
  for all to service_role using (true) with check (true);
grant select, insert, update, delete on public.carrier_control_entries to authenticated;
grant all on public.carrier_control_entries to service_role;

-- ── Escalations ─────────────────────────────────────────────────────────────
create table if not exists public.commission_escalations (
  id uuid primary key default gen_random_uuid(),
  reason_code text not null,
  reason_label text not null,
  detail text,
  carrier_name text,
  statement_period text,
  batch_id uuid references public.commission_ingest_batches(id),
  control_entry_id uuid references public.carrier_control_entries(id),
  amount numeric,
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved', 'closed')),
  created_by text not null,
  owner text,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists commission_escalations_status_idx
  on public.commission_escalations (status);

alter table public.commission_escalations enable row level security;
drop policy if exists ce_allowlist_select on public.commission_escalations;
drop policy if exists ce_allowlist_insert on public.commission_escalations;
drop policy if exists ce_allowlist_update on public.commission_escalations;
drop policy if exists ce_allowlist_delete on public.commission_escalations;
drop policy if exists ce_service_role on public.commission_escalations;
create policy ce_allowlist_select on public.commission_escalations
  for select to authenticated using (is_commission_user());
create policy ce_allowlist_insert on public.commission_escalations
  for insert to authenticated with check (is_commission_user());
create policy ce_allowlist_update on public.commission_escalations
  for update to authenticated using (is_commission_user()) with check (is_commission_user());
create policy ce_allowlist_delete on public.commission_escalations
  for delete to authenticated using (is_commission_user());
create policy ce_service_role on public.commission_escalations
  for all to service_role using (true) with check (true);
grant select, insert, update, delete on public.commission_escalations to authenticated;
grant all on public.commission_escalations to service_role;

-- ── Agency-bill prep desk ───────────────────────────────────────────────────
create table if not exists public.agency_bill_invoices (
  id uuid primary key default gen_random_uuid(),
  insured_name text not null,
  policy_number text not null,
  carrier_name text not null,
  mga_name text,
  invoice_number text,
  effective_date date,
  gross_premium numeric,
  taxes numeric,
  carrier_fees numeric,
  agency_fees numeric,
  commission numeric,
  total_client_invoice numeric,
  client_due_date date,
  carrier_due_date date,
  amount_due_to_carrier numeric,
  payment_status text not null default 'open'
    check (payment_status in (
      'open', 'partial', 'client_paid', 'ready_to_remit', 'remitted', 'exception', 'closed'
    )),
  verified_ok boolean not null default false,
  verification_notes text,
  prepared_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agency_bill_receipts (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.agency_bill_invoices(id) on delete cascade,
  payment_date date not null,
  amount numeric not null,
  payment_method text,
  check_or_ach_ref text,
  bank_deposit_ref text,
  cleared boolean not null default false,
  unapplied boolean not null default false,
  notes text,
  recorded_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.agency_bill_remittances (
  id uuid primary key default gen_random_uuid(),
  carrier_name text not null,
  statement_period text,
  policies_included text,
  gross_collected numeric,
  credits_return_premiums numeric,
  commission_retained numeric,
  net_amount_due numeric,
  carrier_due_date date,
  proposed_payment_ref text,
  status text not null default 'drafted'
    check (status in ('drafted', 'pending_approval', 'approved', 'paid', 'void')),
  prepared_by text,
  approved_by text,
  approved_at timestamptz,
  paid_at timestamptz,
  confirmation_number text,
  supporting_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agency_bill_exceptions (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.agency_bill_invoices(id) on delete set null,
  remittance_id uuid references public.agency_bill_remittances(id) on delete set null,
  reason_code text not null,
  amount numeric,
  explanation text,
  owner text,
  follow_up_date date,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'closed')),
  created_by text,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array[
    'agency_bill_invoices',
    'agency_bill_receipts',
    'agency_bill_remittances',
    'agency_bill_exceptions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_allowlist_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_allowlist_insert', t);
    execute format('drop policy if exists %I on public.%I', t||'_allowlist_update', t);
    execute format('drop policy if exists %I on public.%I', t||'_allowlist_delete', t);
    execute format('drop policy if exists %I on public.%I', t||'_service_role', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (is_commission_user())',
      t||'_allowlist_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (is_commission_user())',
      t||'_allowlist_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (is_commission_user()) with check (is_commission_user())',
      t||'_allowlist_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (is_commission_user())',
      t||'_allowlist_delete', t);
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      t||'_service_role', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
