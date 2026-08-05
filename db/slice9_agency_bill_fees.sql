-- Agency Bill + agency fees on commission_ledger (Money workstation).
-- Apply on the Supabase project after hermes migration
-- 20260805160000_billing_type_agency_fee.sql (or this slice alone if ledger-only).
-- Idempotent.

alter table public.commission_ledger
  add column if not exists billing_type text,
  add column if not exists agency_fee_amount numeric;

comment on column public.commission_ledger.billing_type is
  'AMS billing type: Direct Bill | Agency Bill | Direct Bill 100 | Agency Bill 100.';
comment on column public.commission_ledger.agency_fee_amount is
  'Agency fee charged to the insured (NowCerts agencyFee). Distinct from carrier commission.';

-- Optional: seed admin_fee_amount from agency fee for "% of Admin Fee" rules.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'commission_ledger'
      and column_name = 'admin_fee_amount'
  ) then
    update public.commission_ledger
    set admin_fee_amount = agency_fee_amount
    where agency_fee_amount is not null
      and (admin_fee_amount is null or admin_fee_amount = 0);
  end if;
end $$;
