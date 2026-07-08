-- Commission Reconciliation — Slice 1 seed data for Progressive.
-- Carrier profile + alias map. Payment model = 'advance' (CONFIRMED by Lamar
-- 2026-07-08 — the 19 Cancel Pro Rate rows / -$8,157 realized clawback confirm it).

insert into public.carrier_commission_profile
  (carrier_name, payment_model, default_nb_percent, default_renewal_percent,
   clawback_window_months, statement_format, statement_parser_key, notes)
values
  ('Progressive', 'advance', 0.13, 0.10, 12, 'xlsx', 'progressive_v1',
   'Advance/clawback carrier. Rates observed on DetailedStatement20260708: NB 0.13, renewal 0.10, commercial 0.15 (rulebook says 12/15 — reconciliation surfaces the drift).')
on conflict (carrier_name) do update set
  payment_model = excluded.payment_model,
  clawback_window_months = excluded.clawback_window_months,
  statement_parser_key = excluded.statement_parser_key,
  statement_format = excluded.statement_format,
  default_nb_percent = excluded.default_nb_percent,
  default_renewal_percent = excluded.default_renewal_percent,
  notes = excluded.notes,
  updated_at = now();

-- Alias map (spec §2c): collapse BOTH ledger names (…INS CO) AND rule names
-- (PROGRESSIVE MOUNTAIN/FREEDOM) to canonical 'Progressive'. This bridges the
-- name mismatch that left 31 ledger rows NULL-expected — see slice1_reprice_progressive.sql.
insert into public.carrier_alias_map (raw_name, canonical_carrier) values
  ('PROGRESSIVE MOUNTAIN INS CO', 'Progressive'),
  ('PROGRESSIVE FREEDOM INS CO',  'Progressive'),
  ('PROGRESSIVE MOUNTAIN',        'Progressive'),
  ('PROGRESSIVE FREEDOM',         'Progressive'),
  ('PROGRESSIVE',                 'Progressive'),
  ('Progressive',                 'Progressive')
on conflict (raw_name) do update set canonical_carrier = excluded.canonical_carrier;

-- Statement transaction rows are loaded by scripts/load-progressive.ts (which runs
-- the progressive_v1 parser), then reconciled with:  select public.reconcile_carrier('Progressive');
