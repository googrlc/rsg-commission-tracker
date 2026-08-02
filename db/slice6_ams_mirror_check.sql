-- Commission Reconciliation — Slice 6: NowCerts ↔ Supabase mirror check.
--
-- Answers "are our NowCerts fields actually mirrored, and is the mirror right?"
-- Three independent questions, three views — all read-only, all additive:
--
--   1. SHAPE     v_ams_field_map_coverage  — does every field in
--                nowcerts_field_map have a physical landing column?
--   2. FRESHNESS v_ams_mirror_freshness    — how stale is each mirror layer?
--   3. VALUES    v_ams_policy_drift        — where do the layers disagree on a
--                policy they all hold?
--
-- The mirror is a 3-layer chain and each layer can rot independently:
--
--   NowCerts (SoR) → stg_nowcerts_policies → canonical_policies → commission_ledger
--                    (raw landing, jsonb)   (typed book record)  (money rows)
--
-- SQL can only see layers 2-4. The NowCerts→staging leg has no in-database
-- witness, so it is checked out-of-band — see the runbook at the bottom.
--
-- Apply to Supabase wibscqhkvpijzqbhjphg as migration: commission_recon_slice6_ams_mirror.

-- ── 1. SHAPE ───────────────────────────────────────────────────────────────
-- nowcerts_field_map is documentation: 89 rows naming the NowCerts API fields
-- we intend to carry, and the snake_case name each should land under. Nothing
-- reads it, so it silently drifts from the real schema in both directions —
-- a field we stopped landing, or one we renamed on landing. This view is the
-- reconciliation: `status` is the column to filter on.
--
-- 'mirrored'    — normalized_field exists as a column in a mirror table.
-- 'renamed'     — no column by that name, but the table holds a column whose
--                 name is a known synonym (see synonym CTE). Fix the map row.
-- 'unlanded'    — nothing carries this field. Either wire it up or mark the
--                 map row is_exception = true so it stops showing here.
create or replace view public.v_ams_field_map_coverage as
with target as (
  -- which physical tables are allowed to satisfy each entity
  -- nowcerts_insured_mirror was listed here when this was drafted; it was
  -- fossilized 2026-07-28, so a field "landing" there would now be a field
  -- landing nowhere. A view whose job is catching stale documentation is a poor
  -- place to keep some.
  select 'insured'::text as entity,
         unnest(array['canonical_clients','client_entities']) as table_name
  union all
  select 'policy',
         unnest(array['stg_nowcerts_policies','canonical_policies','commission_ledger'])
),
synonym (normalized_field, actual_column) as (values
  -- NowCerts' name on the left, the name our schema actually settled on.
  -- Every row here is a map row that should be corrected, not a real gap.
  ('policy_expiry_date',   'expiration_date'),
  ('policy_premium',       'premium'),
  ('policy_database_id',   'database_id'),
  ('insured_database_id',  'nowcerts_insured_guid'),
  ('line_of_businesses',   'lines_of_business'),
  ('total_amount',         'current_term_amount'),
  ('agency_commission',    'agency_commission_amount'),
  ('address_line_1',       'address_street'),
  ('zip_code',             'address_zip'),
  ('date_of_birth',        'dob'),
  ('commercial_name',      'name')
),
cols as (
  select c.table_name, c.column_name
  from information_schema.columns c
  where c.table_schema = 'public'
),
resolved as (
  select
    m.entity,
    m.source_field,
    m.normalized_field,
    m.is_exception,
    m.notes,
    (select string_agg(c.table_name, ', ' order by c.table_name)
       from cols c join target t on t.table_name = c.table_name and t.entity = m.entity
      where c.column_name = m.normalized_field)                       as landed_in,
    (select string_agg(distinct c.table_name || '.' || c.column_name, ', ')
       from synonym s
       join cols c on c.column_name = s.actual_column
       join target t on t.table_name = c.table_name and t.entity = m.entity
      where s.normalized_field = m.normalized_field)                  as landed_as
  from public.nowcerts_field_map m
)
select
  entity, source_field, normalized_field, is_exception, notes, landed_in, landed_as,
  case
    when landed_in is not null then 'mirrored'
    when landed_as is not null then 'renamed'
    else 'unlanded'
  end as status
from resolved;

-- ── 2. FRESHNESS ───────────────────────────────────────────────────────────
-- Each layer stamps its own last-touch column, so staleness has to be assembled
-- by hand. `age_days` against now() is the number that matters: a layer older
-- than its cadence means the feed above it stopped, regardless of row count.
create or replace view public.v_ams_mirror_freshness as
with layer as (
  select 'stg_nowcerts_policies'   as layer, 'ingested_at'           as stamp_column,
         'daily'                   as cadence,
         count(*)                  as row_count, max(ingested_at)           as last_touch
    from public.stg_nowcerts_policies
  union all
  select 'canonical_policies',      'created_at',            'daily',
         count(*), max(created_at)            from public.canonical_policies
  union all
  -- Was nowcerts_insured_mirror.last_nowcerts_sync_at when this file was drafted
  -- (2026-07-24). That table was fossilized four days later — it survives only as
  -- backup_20260728_nowcerts_insured_mirror_fossil — and canonical_clients is
  -- where the insured leg lands now. Same question, current table: if this stamp
  -- stops moving, the insured feed stopped.
  select 'canonical_clients',       'nowcerts_synced_at',    'daily',
         count(*), max(nowcerts_synced_at)     from public.canonical_clients
  union all
  select 'commission_ledger',       'updated_at',            'per statement',
         count(*), max(updated_at)            from public.commission_ledger
  union all
  select 'sync_runs',               'started_at',            'daily',
         count(*), max(started_at)            from public.sync_runs
)
select
  layer, cadence, stamp_column, row_count, last_touch,
  extract(day from now() - last_touch)::int as age_days
from layer;

-- ── 3. VALUES ──────────────────────────────────────────────────────────────
-- The layers are joined on the NowCerts policy GUID, which is the only stable
-- key across all three (policy_number is NOT unique — it repeats across terms
-- and across the same term written twice; see the ledger's duplicate rows).
--
-- Every row returned is a disagreement. `drift` names which fields disagree, so
-- an empty result set is the pass condition.
create or replace view public.v_ams_policy_drift as
with joined as (
  select
    coalesce(s.database_id, c.policy_guid)          as policy_guid,
    coalesce(s.policy_number, c.policy_number)      as policy_number,
    coalesce(s.insured_name, c.carrier)             as label,
    s.id is not null                                as in_staging,
    c.policy_guid is not null                       as in_canonical,
    s.effective_date  as stg_eff,  c.effective_date  as canon_eff,
    s.expiration_date as stg_exp,  c.expiration_date as canon_exp,
    s.carrier_name    as stg_carrier, c.carrier      as canon_carrier,
    l.ledger_rows, l.ledger_eff, l.ledger_exp
  from public.stg_nowcerts_policies s
  full outer join public.canonical_policies c on c.policy_guid = s.database_id
  left join lateral (
    select count(*) as ledger_rows,
           min(policy_effective_date)  as ledger_eff,
           min(policy_expiration_date) as ledger_exp
    from public.commission_ledger cl
    where cl.nowcerts_policy_id = coalesce(s.database_id, c.policy_guid)
  ) l on true
)
select
  policy_guid, policy_number, label,
  in_staging, in_canonical, ledger_rows,
  stg_eff, canon_eff, ledger_eff,
  stg_exp, canon_exp, ledger_exp,
  -- A NULL on one side is a gap (the feed never populated it); two different
  -- non-NULL values is a conflict (two systems disagree on a fact). They have
  -- different fixes, so they get different labels.
  array_remove(array[
    case when not in_staging                                   then 'missing_from_staging'   end,
    case when not in_canonical                                 then 'missing_from_canonical' end,
    case when stg_eff is null and canon_eff is not null        then 'effective_date_gap'     end,
    case when stg_eff is not null and canon_eff is not null
          and stg_eff <> canon_eff                             then 'effective_date_conflict'end,
    case when stg_exp is null and canon_exp is not null        then 'expiration_date_gap'    end,
    case when stg_exp is not null and canon_exp is not null
          and stg_exp <> canon_exp                             then 'expiration_date_conflict' end,
    case when stg_carrier is distinct from canon_carrier       then 'carrier'                end,
    case when ledger_rows > 0
          and ledger_eff is distinct from coalesce(canon_eff, stg_eff)
                                                               then 'ledger_effective_date'  end
  ], null) as drift
from joined
where not in_staging
   or not in_canonical
   or stg_eff     is distinct from canon_eff
   or stg_exp     is distinct from canon_exp
   or stg_carrier is distinct from canon_carrier
   or (ledger_rows > 0 and ledger_eff is distinct from coalesce(canon_eff, stg_eff));

-- Ledger rows claiming an AMS link that no longer resolves, plus the ones that
-- never had a link. These are the money rows nothing upstream can correct.
create or replace view public.v_ams_ledger_orphans as
select
  cl.id, cl.policy_number, cl.client_name, cl.carrier_name,
  cl.policy_effective_date, cl.expected_commission, cl.reconciliation_status,
  case
    when cl.nowcerts_policy_id is null then 'no_ams_link'
    else 'dangling_ams_link'
  end as orphan_type
from public.commission_ledger cl
where cl.nowcerts_policy_id is null
   or not exists (
     select 1 from public.canonical_policies c where c.policy_guid = cl.nowcerts_policy_id
   );

-- ── Runbook ────────────────────────────────────────────────────────────────
-- The NowCerts→staging leg is invisible to SQL: if the ingest stops, staging
-- just keeps holding yesterday's truth and every view above still reads clean.
-- Close that leg out-of-band, in this order:
--
--   1. Pull live NowCerts policies (MCP `list_policies`, or the /mcp/nowcerts
--      door on hermes-gretch for the full field set — the bridge's projection
--      only surfaces 8 fields and returns lineOfBusiness/premium as NULL, so it
--      cannot witness ledger.lob or ledger.gross_premium).
--   2. Load them into stg_nowcerts_policies keyed on database_id (payload jsonb
--      keeps the untruncated record for whatever the typed columns drop).
--   3. select * from v_ams_mirror_freshness;   -- any age_days past cadence = feed down
--      select * from v_ams_policy_drift;       -- empty = layers agree
--      select * from v_ams_field_map_coverage where status <> 'mirrored' and not is_exception;
--      select * from v_ams_ledger_orphans;     -- money rows with no AMS anchor
--
-- Do NOT key a smoke test on HTTP status — the MCP bridge always returns 200
-- and reports auth failure in the JSON-RPC body.
