-- Carrier payment calendar — schedules that drive the year Pay Calendar page.
-- Applied to wibscqhkvpijzqbhjphg as migrations:
--   carrier_payment_schedule, carrier_payment_schedule_business_day_basis.
--
-- Two schedule shapes:
--   'day_of_month' : a rule. day_basis='calendar' → pay_day is the calendar day N
--                    (optional weekend roll); day_basis='business' → pay_day is the
--                    Nth WORKING day (Mon–Fri) of the month. Holidays are not skipped
--                    (a bank holiday's day-late shift happens regardless — Lamar).
--   'explicit'     : a published per-month table (e.g. Progressive's closing schedule)
--                    stored as jsonb [{month, close, pay}] for a schedule_year.

create table if not exists public.carrier_payment_schedule (
  id uuid primary key default gen_random_uuid(),
  carrier_name  text not null unique,
  kind          text not null check (kind in ('day_of_month','explicit')),
  pay_day       int,
  close_day     int,
  day_basis     text not null default 'calendar' check (day_basis in ('calendar','business')),
  weekend_rule  text not null default 'none' check (weekend_rule in ('none','prev','next')),
  explicit      jsonb,
  schedule_year int,
  color         text not null default 'blue',
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.carrier_payment_schedule enable row level security;
create policy cps_allowlist_select on public.carrier_payment_schedule for select to authenticated using (is_commission_user());
create policy cps_allowlist_insert on public.carrier_payment_schedule for insert to authenticated with check (is_commission_user());
create policy cps_allowlist_update on public.carrier_payment_schedule for update to authenticated using (is_commission_user()) with check (is_commission_user());
create policy cps_allowlist_delete on public.carrier_payment_schedule for delete to authenticated using (is_commission_user());
create policy cps_service_role on public.carrier_payment_schedule for all to service_role using (true) with check (true);
grant select, insert, update, delete on public.carrier_payment_schedule to authenticated;
grant all on public.carrier_payment_schedule to service_role;

-- Progressive: explicit 2026 Month-End Closing Schedule (commission month N closes +
-- pays EFT the following month). Source: foragentsonly.com Closing Schedule PDF.
insert into public.carrier_payment_schedule (carrier_name, kind, schedule_year, color, notes, explicit)
values ('Progressive', 'explicit', 2026, 'blue',
  'Published Month-End Closing Schedule 2026. Commission for month N closes + pays EFT the following month.',
  '[{"month":1,"close":"2026-02-06","pay":"2026-02-12"},
    {"month":2,"close":"2026-03-06","pay":"2026-03-12"},
    {"month":3,"close":"2026-04-03","pay":"2026-04-09"},
    {"month":4,"close":"2026-05-08","pay":"2026-05-14"},
    {"month":5,"close":"2026-06-05","pay":"2026-06-11"},
    {"month":6,"close":"2026-07-03","pay":"2026-07-09"},
    {"month":7,"close":"2026-08-07","pay":"2026-08-13"},
    {"month":8,"close":"2026-09-04","pay":"2026-09-11"},
    {"month":9,"close":"2026-10-02","pay":"2026-10-08"},
    {"month":10,"close":"2026-11-06","pay":"2026-11-13"},
    {"month":11,"close":"2026-12-04","pay":"2026-12-10"},
    {"month":12,"close":"2027-01-01","pay":"2027-01-07"}]'::jsonb)
on conflict (carrier_name) do update set
  kind=excluded.kind, schedule_year=excluded.schedule_year, color=excluded.color,
  notes=excluded.notes, explicit=excluded.explicit, updated_at=now();

-- GEICO: pays the 7th WORKING day of every month.
insert into public.carrier_payment_schedule (carrier_name, kind, pay_day, day_basis, weekend_rule, color, notes)
values ('GEICO', 'day_of_month', 7, 'business', 'none', 'emerald', 'Pays the 7th working (business) day of every month.')
on conflict (carrier_name) do update set
  kind=excluded.kind, pay_day=excluded.pay_day, day_basis=excluded.day_basis,
  weekend_rule=excluded.weekend_rule, color=excluded.color, notes=excluded.notes, updated_at=now();
