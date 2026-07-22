-- slice5_ledger_grants.sql
-- Fix: "permission denied for table commission_ledger" in the SPA.
--
-- commission_ledger predates the slice-1 allowlist RLS work and was never
-- granted to the `authenticated` role, so signed-in (allowlisted) users get a
-- table-privilege error (42501) the moment fetchAllData() queries it — even
-- though commission_rules / commission_reconciliation load fine. This brings
-- the ledger in line with the other money tables: table-level CRUD grants for
-- `authenticated`, allowlist-gated RLS policies, and a service_role bypass.
--
-- Idempotent: safe to re-run. delta / unearned_balance stay GENERATED — the
-- grants below never let the client assign them (Postgres blocks writes to
-- generated columns regardless of privilege).

alter table public.commission_ledger enable row level security;

-- Table-level privileges (the missing piece that caused 42501).
grant select, insert, update, delete on public.commission_ledger to authenticated;
grant all on public.commission_ledger to service_role;

-- Allowlist-gated RLS policies, mirroring the slice-1 tables. Drop-then-create
-- so re-running picks up any definition change.
drop policy if exists commission_ledger_allowlist_select on public.commission_ledger;
drop policy if exists commission_ledger_allowlist_insert on public.commission_ledger;
drop policy if exists commission_ledger_allowlist_update on public.commission_ledger;
drop policy if exists commission_ledger_allowlist_delete on public.commission_ledger;
drop policy if exists commission_ledger_service_role on public.commission_ledger;

create policy commission_ledger_allowlist_select on public.commission_ledger
  for select to authenticated using (is_commission_user());
create policy commission_ledger_allowlist_insert on public.commission_ledger
  for insert to authenticated with check (is_commission_user());
create policy commission_ledger_allowlist_update on public.commission_ledger
  for update to authenticated using (is_commission_user()) with check (is_commission_user());
create policy commission_ledger_allowlist_delete on public.commission_ledger
  for delete to authenticated using (is_commission_user());
create policy commission_ledger_service_role on public.commission_ledger
  for all to service_role using (true) with check (true);
