-- Commission Reconciliation — Slice 7: carrier incentives.
--
-- Two different animals, deliberately kept apart:
--
--   PER-POLICY BONUS  — an enhanced or uplifted rate on qualifying policies.
--                       It is earned per policy and arrives inside the normal
--                       commission statement, so it BELONGS in expected_commission.
--   CONTINGENCY       — profit-sharing on the whole book, settled once a year on
--                       volume / loss ratio / growth. It is NOT per-policy, so it
--                       must NEVER touch commission_ledger. Writing a book-level
--                       bonus onto a policy row would corrupt `delta` (GENERATED
--                       as actual - expected) and make every policy read short.
--
-- The channel problem (this is why the bonus rule is not keyed on carrier alone):
-- the party that sets the rate is often not the carrier on the policy. RSG reaches
-- Employers' workers' comp through NVO Underwriting (an MGA), and the enhanced
-- rate is PI's deal. The AMS says "EMPLOYERS"; the statement says NVO or PI. A rule
-- keyed on carrier+LOB alone cannot express that, and would mis-price every policy
-- that comes through a different channel at the standard rate.
--
-- Idempotent: safe to re-run.

-- ── §1 commission_ledger: make the bonus visible, not baked in ──────────────
-- expected_commission stays the TOTAL (base + bonus) so reconciliation and the
-- generated delta keep working untouched. These columns record how that total was
-- reached, so an uplift is auditable and can be recomputed or backed out.
alter table public.commission_ledger
  add column if not exists mga_name         text,
  add column if not exists base_commission  numeric,
  add column if not exists bonus_percent    numeric,
  add column if not exists bonus_commission numeric,
  add column if not exists bonus_rule_id    uuid;

comment on column public.commission_ledger.mga_name is
  'Distribution channel the policy was placed through (e.g. NVO Underwriting). '
  'Null = written direct with the carrier. Drives bonus-rule matching and tells '
  'you which statement the money will actually appear on.';
comment on column public.commission_ledger.base_commission is
  'What commission_rules alone priced. expected_commission = base_commission + bonus_commission.';

-- ── §2 carrier_bonus_rule — the per-policy uplift ───────────────────────────
-- rate_kind is the part worth reading twice:
--   'replace' : this IS the rate for the match (15% total, standard rate ignored)
--   'add'     : these are percentage POINTS on top of the standard rate
-- Both exist in the wild and they pay very differently. Storing the intent means
-- nobody has to remember which kind a given deal was.
create table if not exists public.carrier_bonus_rule (
  id uuid primary key default gen_random_uuid(),
  carrier_name    text not null,              -- canonical carrier on the policy
  lob             text,                       -- null = every line of business
  mga_name        text,                       -- null = any channel, incl. direct
  applies_to      text not null default 'both'
    check (applies_to in ('new','renewal','both')),
  rate_kind       text not null default 'replace'
    check (rate_kind in ('replace','add')),
  bonus_percent   numeric not null,
  paid_via        text,                       -- who actually cuts the check (e.g. PI Insurance)
  effective_from  date not null,
  effective_to    date,                       -- null = still running
  lookup_priority int  not null default 100,  -- lower wins, matching commission_rules
  active          boolean not null default true,
  notes           text,
  -- Provenance, mirroring commission_rules (§10): edits supersede, never delete.
  superseded_by   uuid references public.carrier_bonus_rule(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists carrier_bonus_rule_lookup
  on public.carrier_bonus_rule (carrier_name, lob, mga_name)
  where active;

-- The natural key of a live deal. lob/mga_name are nullable and NULLs do not
-- compare equal, so they are coalesced — without this a re-run would quietly
-- insert a second copy of every seeded rule and double-price the book.
create unique index if not exists carrier_bonus_rule_natural_key
  on public.carrier_bonus_rule
     (carrier_name, coalesce(lob, ''), coalesce(mga_name, ''), effective_from);

-- ── §3 carrier_contingency_program — the book-level terms ───────────────────
-- Tiers live in jsonb because no two carriers band the same way. Shape:
--   [{"min_written":250000,"max_loss_ratio":40,"payout_percent":3.0}, ...]
create table if not exists public.carrier_contingency_program (
  id uuid primary key default gen_random_uuid(),
  carrier_name       text not null,
  program_year       int  not null,
  mga_name           text,
  tiers              jsonb not null default '[]'::jsonb,
  min_written_premium numeric,
  max_loss_ratio     numeric,
  min_growth_percent numeric,
  settles_on         date,        -- when the carrier is expected to pay it out
  notes              text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  unique (carrier_name, program_year)
);

-- ── §4 carrier_contingency_ledger — estimated vs actually received ──────────
-- The money side. Kept separate from commission_ledger on purpose (see header).
create table if not exists public.carrier_contingency_ledger (
  id uuid primary key default gen_random_uuid(),
  program_id        uuid references public.carrier_contingency_program(id) on delete set null,
  carrier_name      text not null,
  program_year      int  not null,
  written_premium   numeric,     -- measured book values that drive the tier
  loss_ratio        numeric,
  growth_percent    numeric,
  estimated_payout  numeric,
  actual_payout     numeric,
  received_date     date,
  status            text not null default 'projected'
    check (status in ('projected','qualified','missed','received','disputed')),
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (carrier_name, program_year)
);

-- ── §5 RLS + grants, in line with the other money tables ────────────────────
do $$
declare t text;
begin
  foreach t in array array['carrier_bonus_rule','carrier_contingency_program','carrier_contingency_ledger']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t||'_allowlist_select', t);
    execute format('drop policy if exists %I on public.%I', t||'_allowlist_write',  t);
    execute format('drop policy if exists %I on public.%I', t||'_service_role',     t);
    execute format('create policy %I on public.%I for select to authenticated using (is_commission_user())',
                   t||'_allowlist_select', t);
    execute format('create policy %I on public.%I for all to authenticated using (is_commission_user()) with check (is_commission_user())',
                   t||'_allowlist_write', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)',
                   t||'_service_role', t);
  end loop;
end $$;

-- ── §6 price_ledger_bonus — recompute base + bonus for a carrier ────────────
-- Mirrors the existing pricing pass (canonical carrier + LOB + New/Renewal,
-- '% of Premium' => premium * rate / 100) and layers the bonus on top. Only
-- touches rows it can price; a row with no matching rule is left alone rather
-- than being zeroed, so an incomplete rulebook never silently invents money.
create or replace function public.price_ledger_bonus(p_carrier text default null)
returns table (ledger_id uuid, base numeric, bonus numeric, total numeric)
language sql
security invoker
as $$
  with alias as (
    select raw_name, canonical_carrier from public.carrier_alias_map
  ),
  -- LOB is normalized on BOTH sides through lob_alias_map, for the same reason
  -- carrier names are: the ledger says "Worker's Compensation" and the rulebook
  -- says "Workers Comp". Comparing raw text is the exact bug that left 31
  -- Progressive rows unpriced (slice1_reprice_progressive.sql). Unmapped values
  -- fall back to their own lowercased text, so an unseeded LOB still self-matches.
  target as (
    select l.id, l.gross_premium, l.is_renewal, l.mga_name,
           coalesce(lm.canonical_lob, lower(trim(l.lob))) as lob_key,
           coalesce(a.canonical_carrier, l.carrier_name) as canon,
           l.policy_effective_date
    from public.commission_ledger l
    left join alias a on a.raw_name = l.carrier_name
    left join public.lob_alias_map lm on lm.raw_lob = lower(trim(l.lob))
    where l.gross_premium is not null
      and (p_carrier is null or coalesce(a.canonical_carrier, l.carrier_name) = p_carrier)
  ),
  base_rule as (
    select distinct on (t.id) t.id,
      round((t.gross_premium *
        (case when t.is_renewal then r.renewal_percent else r.nb_percent end) / 100.0)::numeric, 2) as base_amt
    from target t
    join public.commission_rules r
      on coalesce((select canonical_carrier from alias where raw_name = r.carrier_name), r.carrier_name) = t.canon
     and coalesce((select canonical_lob from public.lob_alias_map where raw_lob = lower(trim(r.lob))),
                  lower(trim(r.lob))) = t.lob_key
    where r.active
      and r.commission_method = '% of Premium'
      and (case when t.is_renewal then r.renewal_percent else r.nb_percent end) is not null
    order by t.id, r.lookup_priority asc nulls last
  ),
  -- Most specific channel wins: a rule naming the MGA beats a carrier-wide one.
  bonus_rule as (
    select distinct on (t.id) t.id, b.id as rule_id, b.rate_kind, b.bonus_percent,
      round((t.gross_premium * b.bonus_percent / 100.0)::numeric, 2) as bonus_amt
    from target t
    join public.carrier_bonus_rule b
      on b.carrier_name = t.canon
     and b.active
     and (b.lob is null
          or coalesce((select canonical_lob from public.lob_alias_map where raw_lob = lower(trim(b.lob))),
                      lower(trim(b.lob))) = t.lob_key)
     and (b.mga_name is null or b.mga_name = t.mga_name)
     and (b.applies_to = 'both'
          or (b.applies_to = 'renewal' and t.is_renewal)
          or (b.applies_to = 'new' and not coalesce(t.is_renewal, false)))
     and b.superseded_by is null
     and coalesce(t.policy_effective_date, current_date) >= b.effective_from
     and (b.effective_to is null or coalesce(t.policy_effective_date, current_date) <= b.effective_to)
    order by t.id, (b.mga_name is not null) desc, (b.lob is not null) desc,
             b.lookup_priority asc nulls last
  )
  select t.id,
         br.base_amt,
         bn.bonus_amt,
         -- 'replace' means the bonus percent IS the rate, so the base drops out.
         case when bn.rate_kind = 'replace' then bn.bonus_amt
              else coalesce(br.base_amt, 0) + coalesce(bn.bonus_amt, 0) end
    from target t
    left join base_rule  br on br.id = t.id
    left join bonus_rule bn on bn.id = t.id
   where br.base_amt is not null or bn.bonus_amt is not null;
$$;

-- ── §7 apply_ledger_bonus — write the recomputed prices back ────────────────
-- Fills gaps by default. The first dry run against the live book proposed 22
-- overwrites of already-priced rows (4 of them downward, net +$1,419) versus only
-- 10 genuine gap-fills — prices that came from a statement or a hand correction
-- are not the rules engine's to silently revise. A full reprice stays available,
-- but you have to ask for it:
--   apply_ledger_bonus()            -> unpriced rows only
--   apply_ledger_bonus('EMPLOYERS') -> unpriced EMPLOYERS rows
--   apply_ledger_bonus(null, false) -> full reprice, deliberate
create or replace function public.apply_ledger_bonus(
  p_carrier       text    default null,
  p_only_unpriced boolean default true
)
returns integer
language plpgsql
security invoker
as $$
declare n integer;
begin
  with priced as (select * from public.price_ledger_bonus(p_carrier))
  update public.commission_ledger l
     set base_commission     = p.base,
         bonus_commission    = p.bonus,
         expected_commission = p.total,
         updated_at          = now()
    from priced p
   where l.id = p.ledger_id
     and p.total is not null
     and l.expected_commission is distinct from p.total
     and (not p_only_unpriced or l.expected_commission is null);
  get diagnostics n = row_count;
  return n;
end $$;

-- ── §8 v_carrier_incentive_summary — both kinds, one place ─────────────────
create or replace view public.v_carrier_incentive_summary
with (security_invoker = true) as
select
  c.carrier_name,
  c.program_year,
  c.status,
  c.written_premium,
  c.loss_ratio,
  c.estimated_payout,
  c.actual_payout,
  c.actual_payout - c.estimated_payout as contingency_delta,
  c.received_date,
  -- Per-policy uplift actually booked for that carrier in the same year, so the
  -- two incentive streams can be read side by side without being commingled.
  (select coalesce(sum(l.bonus_commission), 0)
     from public.commission_ledger l
    where l.carrier_name = c.carrier_name
      and extract(year from l.policy_effective_date) = c.program_year) as policy_bonus_booked
from public.carrier_contingency_ledger c;

grant select on public.v_carrier_incentive_summary to authenticated, service_role;

-- ── §9 Seed: the live PI / EMPLOYERS / NVO deal ─────────────────────────────
-- PI is paying 15% on EMPLOYERS workers' comp, reached through NVO Underwriting.
--
-- carrier_name is 'EMPLOYERS' to match the existing rulebook row exactly
-- (EMPLOYERS | Workers Comp | nb=10% rn=8%). Seeded rate_kind='replace' because
-- 15% reads as the whole enhanced rate against that 10% standard — 'add' would
-- mean 25%, which no WC deal pays. Confirm before trusting the numbers; if it is
-- points on top, flip rate_kind to 'add' and re-run apply_ledger_bonus('EMPLOYERS').
--
-- No EMPLOYERS rows exist in the ledger yet, so this prices nothing today. It is
-- here so the first policy sold through NVO is priced right on arrival rather
-- than at 10% and quietly short by a third.
insert into public.carrier_bonus_rule
  (carrier_name, lob, mga_name, applies_to, rate_kind, bonus_percent, paid_via,
   effective_from, lookup_priority, notes)
values
  ('EMPLOYERS', 'Workers Comp', 'NVO Underwriting', 'both', 'replace', 15,
   'PI Insurance', date '2026-01-01', 10,
   'PI is giving 15% on EMPLOYERS workers comp only, placed through NVO Underwriting (MGA). '
   'Standard rulebook rate is 10% NB / 8% renewal. Confirm 15% is the full rate, not points on top.')
on conflict (carrier_name, coalesce(lob, ''), coalesce(mga_name, ''), effective_from) do nothing;

-- Statements for this business arrive under the MGA or the payer, not "EMPLOYERS",
-- so teach the alias map every name that money can show up under — otherwise the
-- rows never match on reconcile and read as unpaid.
insert into public.carrier_alias_map (raw_name, canonical_carrier) values
  ('NVO UNDERWRITING', 'EMPLOYERS'),
  ('NVO Underwriting', 'EMPLOYERS'),
  ('NVO',              'EMPLOYERS'),
  ('PI INSURANCE',     'EMPLOYERS'),
  ('PI Insurance',     'EMPLOYERS')
on conflict (raw_name) do nothing;

-- The ledger defaults mga_name to 'Direct' (all 121 rows today). A policy placed
-- through NVO must carry mga_name='NVO Underwriting' or the channel-specific rule
-- above will not match it and it will price at the standard 10%.
