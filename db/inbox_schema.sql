-- Commission Inbox (§9 Slack-drop auto-ingest) staging layer + commit/reject RPCs.
-- Applied to Supabase wibscqhkvpijzqbhjphg as migrations:
--   commission_inbox_staging, commission_inbox_commit_reject_fns.
-- The Hermes-side runbook lives in ~/.claude/skills/commission-inbox/.

-- Archive location for the committed original (Nextcloud path).
alter table public.commission_statements add column if not exists archive_url text;

-- Batch header: one row per dropped file. content_hash is the durable dedupe guard.
create table if not exists public.commission_ingest_batches (
  id uuid primary key default gen_random_uuid(),
  content_hash text unique,
  source_file text not null,
  slack_channel text, slack_file_id text, slack_message_ts text,
  carrier_name text, canonical_carrier text,
  kind text not null default 'unknown' check (kind in ('statement','rate_sheet','both','unknown')),
  parser_key text,
  extraction_method text,                       -- xlsx | csv | pdf_text | pdf_ocr | manual
  is_ocr boolean not null default false,
  row_count int,
  parsed_total_premium numeric, parsed_total_commission numeric,
  stated_total_premium numeric, stated_total_commission numeric, stated_net_due numeric,
  crosscheck_ok boolean,
  flags jsonb not null default '[]'::jsonb,
  ingest_status text not null default 'pending_review'
    check (ingest_status in ('pending_review','approved','rejected','committed','needs_mapping','skipped','error')),
  statement_id uuid references public.commission_statements(id),
  archive_url text,
  notes text,
  uploaded_by text, reviewed_by text, reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists commission_ingest_batches_status_idx on public.commission_ingest_batches (ingest_status);
create index if not exists commission_ingest_batches_carrier_idx on public.commission_ingest_batches (canonical_carrier);

-- Parsed rows awaiting commit (mirror of commission_transactions minus assigned-on-
-- commit columns and the GENERATED is_negative).
create table if not exists public.commission_transactions_staging (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.commission_ingest_batches(id) on delete cascade,
  carrier_name text not null,
  policy_number text, insured_name text, client_id text,
  lob text, segment text,
  transaction_code text, transaction_type text, transaction_date date, month_key int,
  gross_premium numeric, commission_rate numeric, commission_amount numeric,
  fee_type text, fee_amount numeric,
  raw_row jsonb,
  created_at timestamptz not null default now()
);
create index if not exists commission_txn_staging_batch_idx on public.commission_transactions_staging (batch_id);

-- Link a rate-intake row (§10) back to the batch it was extracted from.
alter table public.carrier_rate_intake add column if not exists batch_id uuid references public.commission_ingest_batches(id);

-- RLS: same allowlist pattern as the rest of the money tables.
alter table public.commission_ingest_batches enable row level security;
alter table public.commission_transactions_staging enable row level security;
create policy cib_allowlist_select on public.commission_ingest_batches for select to authenticated using (is_commission_user());
create policy cib_allowlist_insert on public.commission_ingest_batches for insert to authenticated with check (is_commission_user());
create policy cib_allowlist_update on public.commission_ingest_batches for update to authenticated using (is_commission_user()) with check (is_commission_user());
create policy cib_allowlist_delete on public.commission_ingest_batches for delete to authenticated using (is_commission_user());
create policy cib_service_role on public.commission_ingest_batches for all to service_role using (true) with check (true);
create policy cts_allowlist_select on public.commission_transactions_staging for select to authenticated using (is_commission_user());
create policy cts_allowlist_insert on public.commission_transactions_staging for insert to authenticated with check (is_commission_user());
create policy cts_allowlist_update on public.commission_transactions_staging for update to authenticated using (is_commission_user()) with check (is_commission_user());
create policy cts_allowlist_delete on public.commission_transactions_staging for delete to authenticated using (is_commission_user());
create policy cts_service_role on public.commission_transactions_staging for all to service_role using (true) with check (true);

-- Commit a reviewed STATEMENT batch → money tables + reconcile. Idempotent by
-- source_file. Guarded like reconcile_carrier (allowlisted user or privileged session).
create or replace function public.commit_ingest_batch(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare b record; v_statement_id uuid; v_rows int; v_carrier text;
begin
  if not (is_commission_user() or session_user in ('postgres','supabase_admin','service_role')) then
    raise exception 'not authorized to commit commission batches';
  end if;
  select * into b from public.commission_ingest_batches where id = p_batch_id;
  if not found then raise exception 'batch % not found', p_batch_id; end if;
  if b.ingest_status not in ('pending_review','approved') then
    raise exception 'batch % is % (not committable)', p_batch_id, b.ingest_status;
  end if;
  if b.kind not in ('statement','both') then
    raise exception 'batch % is kind=% — rate sheets go through carrier_rate_intake', p_batch_id, b.kind;
  end if;
  v_carrier := coalesce(b.canonical_carrier, b.carrier_name);
  delete from public.commission_transactions
   where statement_id in (select id from public.commission_statements where source_filename = b.source_file);
  delete from public.commission_statements where source_filename = b.source_file;
  insert into public.commission_statements
    (carrier_name, source_filename, source_format, carrier_stated_total_premium,
     carrier_stated_total_commission, carrier_stated_net_due, row_count, upload_status,
     uploaded_by, archive_url)
  values
    (v_carrier, b.source_file, b.extraction_method, b.stated_total_premium,
     b.stated_total_commission, b.stated_net_due, b.row_count, 'reconciled',
     b.uploaded_by, b.archive_url)
  returning id into v_statement_id;
  insert into public.commission_transactions
    (statement_id, carrier_name, policy_number, insured_name, client_id, lob, segment,
     transaction_code, transaction_type, transaction_date, month_key, gross_premium,
     commission_rate, commission_amount, fee_type, fee_amount, raw_row)
  select v_statement_id, carrier_name, policy_number, insured_name, client_id, lob, segment,
     transaction_code, transaction_type, transaction_date, month_key, gross_premium,
     commission_rate, commission_amount, fee_type, fee_amount, raw_row
  from public.commission_transactions_staging where batch_id = p_batch_id;
  get diagnostics v_rows = row_count;
  update public.commission_ingest_batches
     set ingest_status='committed', statement_id=v_statement_id, reviewed_at=now()
   where id = p_batch_id;
  perform public.reconcile_carrier(v_carrier);
  return jsonb_build_object('statement_id', v_statement_id, 'carrier', v_carrier,
                            'rows_committed', v_rows, 'source_file', b.source_file);
end $$;

create or replace function public.reject_ingest_batch(p_batch_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_rows int;
begin
  if not (is_commission_user() or session_user in ('postgres','supabase_admin','service_role')) then
    raise exception 'not authorized to reject commission batches';
  end if;
  update public.commission_ingest_batches
     set ingest_status='rejected', reviewed_at=now(), notes = coalesce(p_reason, notes)
   where id = p_batch_id and ingest_status in ('pending_review','approved','needs_mapping','error');
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'batch % not in a rejectable state', p_batch_id; end if;
  return jsonb_build_object('batch_id', p_batch_id, 'status', 'rejected');
end $$;

revoke execute on function public.commit_ingest_batch(uuid) from public, anon;
revoke execute on function public.reject_ingest_batch(uuid, text) from public, anon;
grant execute on function public.commit_ingest_batch(uuid) to authenticated, service_role;
grant execute on function public.reject_ingest_batch(uuid, text) to authenticated, service_role;
