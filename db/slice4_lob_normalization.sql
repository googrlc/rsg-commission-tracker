-- Commission Reconciliation — Slice 4: LOB normalization.
-- The line-of-business twin of carrier_alias_map (slice1_schema.sql §2c). As more
-- carriers land, each labels the same coverage differently ("GL" / "General
-- Liability" / "CGL"), which fragments v_comm_by_line. This adds a raw→canonical
-- LOB map, rewires the by-line view through it, and exposes an unmapped-cleanup
-- worklist. Additive: commission_transactions.lob (free text) is left untouched;
-- normalization happens at read time so a bad map row is never destructive.
--
-- Apply to Supabase wibscqhkvpijzqbhjphg as migration: commission_recon_slice4_lob.

-- ── lob_alias_map ──────────────────────────────────────────────────────────
-- raw_lob is stored lowercased+trimmed (the join key); canonical_lob is the
-- display/rollup label. segment is optional and only fills gaps where a parser
-- couldn't derive personal/commercial.
create table if not exists public.lob_alias_map (
  id uuid primary key default gen_random_uuid(),
  raw_lob text not null unique,
  canonical_lob text not null,
  segment text check (segment in ('personal','commercial')),
  created_at timestamptz default now()
);

-- ── RLS: mirror the commission tables (allowlist CRUD + service_role bypass) ─
alter table public.lob_alias_map enable row level security;
create policy lob_alias_map_allowlist_select on public.lob_alias_map for select to authenticated using (is_commission_user());
create policy lob_alias_map_allowlist_insert on public.lob_alias_map for insert to authenticated with check (is_commission_user());
create policy lob_alias_map_allowlist_update on public.lob_alias_map for update to authenticated using (is_commission_user()) with check (is_commission_user());
create policy lob_alias_map_allowlist_delete on public.lob_alias_map for delete to authenticated using (is_commission_user());
create policy lob_alias_map_service_role on public.lob_alias_map for all to service_role using (true) with check (true);

-- ── Seed the common collisions (extend as carriers arrive) ─────────────────
insert into public.lob_alias_map (raw_lob, canonical_lob, segment) values
  ('gl',                        'General Liability',      'commercial'),
  ('cgl',                       'General Liability',      'commercial'),
  ('general liability',         'General Liability',      'commercial'),
  ('bop',                       'Business Owners',        'commercial'),
  ('bp',                        'Business Owners',        'commercial'),
  ('business owners',           'Business Owners',        'commercial'),
  ('wc',                        'Workers Comp',           'commercial'),
  ('workers comp',              'Workers Comp',           'commercial'),
  ('workers compensation',      'Workers Comp',           'commercial'),
  ('pl',                        'Professional Liability', 'commercial'),
  ('professional liability',    'Professional Liability', 'commercial'),
  ('e&o',                       'Professional Liability', 'commercial'),
  ('commercial auto',           'Commercial Auto',        'commercial'),
  ('comm auto',                 'Commercial Auto',        'commercial'),
  ('ca',                        'Commercial Auto',        'commercial'),
  ('personal auto',             'Personal Auto',          'personal'),
  ('auto',                      'Personal Auto',          'personal'),
  ('pa',                        'Personal Auto',          'personal'),
  ('ho',                        'Homeowners',             'personal'),
  ('homeowners',                'Homeowners',             'personal'),
  ('home',                      'Homeowners',             'personal')
on conflict (raw_lob) do nothing;

-- ── v_comm_by_line: rewired through the map ─────────────────────────────────
-- Unmapped lobs fall back to their raw (uppercased) label so they stay VISIBLE
-- for cleanup rather than collapsing into one bucket. is_mapped flags the gap.
create or replace view public.v_comm_by_line with (security_invoker = true) as
select
  coalesce(m.canonical_lob, upper(trim(t.lob)), '(no lob)') as lob,
  (m.canonical_lob is not null)                             as is_mapped,
  count(*)                                                   as txn_count,
  count(distinct t.policy_number)                           as policy_count,
  round(sum(t.gross_premium)::numeric, 2)                   as net_written_premium,
  round(sum(t.commission_amount)::numeric, 2)               as total_commission,
  round((sum(t.commission_amount) / nullif(sum(t.gross_premium), 0) * 100)::numeric, 2) as effective_comm_pct,
  min(t.commission_rate) filter (where t.commission_rate > 0) as min_rate,
  max(t.commission_rate) filter (where t.commission_rate > 0) as max_rate
from public.commission_transactions t
left join public.lob_alias_map m on m.raw_lob = lower(trim(t.lob))
group by 1, 2
order by net_written_premium desc nulls last;
grant select on public.v_comm_by_line to authenticated, service_role;

-- ── v_lob_unmapped: the cleanup worklist ────────────────────────────────────
-- Every raw lob seen in the data that has no map row yet, ranked by dollars so
-- you fix the ones that move the numbers first.
create or replace view public.v_lob_unmapped with (security_invoker = true) as
select
  lower(trim(t.lob))                          as raw_lob,
  count(*)                                     as txn_count,
  round(sum(t.gross_premium)::numeric, 2)     as net_written_premium,
  array_agg(distinct t.carrier_name)          as seen_for_carriers
from public.commission_transactions t
left join public.lob_alias_map m on m.raw_lob = lower(trim(t.lob))
where t.lob is not null and trim(t.lob) <> '' and m.raw_lob is null
group by 1
order by net_written_premium desc nulls last;
grant select on public.v_lob_unmapped to authenticated, service_role;
