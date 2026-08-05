/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * The commission API client — the ONLY way this app writes statement money.
 *
 * Until now the browser parsed a statement and inserted straight into
 * `commission_statements` / `commission_transactions` over supabase-js. That
 * worked, and it was the wrong shape for money: no staging, no content-hash
 * dedupe, no named approver, and a reconciler (`reconcile_carrier`) that
 * disagreed with the one the API runs. Two writers, two vocabularies, and a
 * re-upload that could double-count.
 *
 * So writes now go through the finance service (`backend/`), which stages a
 * batch, shows what it WOULD do, and commits only on an explicit named
 * approval. The browser still reads Supabase directly — RLS covers reads, and
 * a report is not a write.
 *
 * The base URL is same-origin by default: Express (server.ts) and Vite both
 * proxy `/api/finance` to the service, so the API is never exposed to the
 * browser's network directly and there is no CORS surface.
 */

const BASE = (import.meta.env.VITE_FINANCE_API_BASE ?? '/api/finance').replace(/\/$/, '');

export class FinanceApiError extends Error {
  constructor(message: string, readonly status: number, readonly detail?: unknown) {
    super(message);
    this.name = 'FinanceApiError';
  }
}

/** FastAPI reports failures as `{detail}` — surface that, not "500". */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, init);
  } catch (cause) {
    throw new FinanceApiError(
      'Could not reach the commission service. It runs alongside this app — if you are on the tailnet and still see this, the service is down.',
      0, cause,
    );
  }

  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not JSON — keep the text */ }

  if (!response.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new FinanceApiError(
      typeof detail === 'string' ? detail : `${response.status} ${response.statusText}`,
      response.status, detail ?? text,
    );
  }
  return body as T;
}

// ── shapes the service returns ───────────────────────────────────────────────

export interface Crosscheck {
  parsed_total_premium: number;
  parsed_total_commission: number;
  stated_total_premium: number | null;
  stated_total_commission: number | null;
  crosscheck_ok: boolean;
  verifiable: boolean;
  commission_delta: number | null;
}

/** Where the staged lines WOULD land. The reviewer approves consequences, not a file. */
export interface MatchPreview {
  will_link?: number;
  will_create_ledger_rows?: number;
  will_be_unmatched?: number;
  unmatched_policy_numbers?: Record<string, number>;
  negative_lines?: number;
  /** Lines typed cancel / chargeback. */
  cancel_chargeback_lines?: number;
  /** How many of those cancel lines got a pro-rata estimate from the ledger. */
  cancel_estimates_priced?: number;
  /** Sum of advance/unconfirmed est. clawbacks for priced cancel lines. */
  estimated_chargeback_total?: number;
  /** Sum of as-earned forgone for priced cancel lines. */
  estimated_forgone_total?: number;
}

export interface StagedBatch {
  batch_id: string | null;
  status: string;
  filename: string;
  carrier: string | null;
  line_count: number;
  approvable: boolean;
  /** PDF batches only: the approver must state they checked it against the document. */
  requires_confirmation: boolean;
  extraction_method: string;
  is_ocr: boolean;
  duplicate_of: string | null;
  warnings: string[];
  crosscheck: Crosscheck;
  preview: MatchPreview;
}

export interface CommitResult {
  ok: boolean;
  batch_id: string;
  statement_id: string | null;
  committed: number;
  linked: number;
  created_ledger_rows: number;
  unmatched: number;
  rollup: string;
  errors: string[];
}

export interface BatchSummary {
  id: string;
  source_file: string;
  carrier_name: string | null;
  ingest_status: string;
  row_count: number | null;
  extraction_method: string | null;
  is_ocr: boolean | null;
  crosscheck_ok: boolean | null;
  uploaded_by: string | null;
  reviewed_by: string | null;
  created_at: string;
}

// ── the statement gate ───────────────────────────────────────────────────────

/**
 * Upload a statement. PARSES AND STAGES ONLY — writes no money.
 *
 * `statedPremium`/`statedCommission` are the carrier's own printed totals. Pass
 * them when the statement shows them: a batch with nothing to check against is
 * exactly the one a bad parse walks through. Some carriers (Progressive) print
 * them on a summary sheet and the parser reads them itself.
 */
export function stageStatement(params: {
  file: File;
  uploadedBy: string;
  carrier?: string;
  statedPremium?: string;
  statedCommission?: string;
}): Promise<StagedBatch> {
  const form = new FormData();
  form.append('file', params.file);
  form.append('uploaded_by', params.uploadedBy);
  if (params.carrier) form.append('carrier', params.carrier);
  if (params.statedPremium) form.append('stated_total_premium', params.statedPremium);
  if (params.statedCommission) form.append('stated_total_commission', params.statedCommission);

  return request<StagedBatch>('/api/commission-statements', { method: 'POST', body: form });
}

/**
 * Commit a staged batch. THIS is the money write.
 *
 * `confirmedSource` is required for PDF batches, whose columns are inferred
 * rather than named — the service refuses without it.
 */
export function approveStatement(
  batchId: string, approvedBy: string, options?: { confirmedSource?: boolean },
): Promise<CommitResult> {
  return request<CommitResult>(`/api/commission-statements/${batchId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      approved_by: approvedBy,
      confirmed_source: options?.confirmedSource ?? false,
    }),
  });
}

/** Reject a staged batch. The staged lines stay for diagnosis. */
export function rejectStatement(
  batchId: string, approvedBy: string, reason?: string,
): Promise<{ ok: boolean }> {
  return request(`/api/commission-statements/${batchId}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved_by: approvedBy, reason: reason ?? null }),
  });
}

/** Uploaded batches, newest first — including whatever the inbox poller staged. */
export async function listBatches(status?: string): Promise<BatchSummary[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const body = await request<{ batches: BatchSummary[] }>(`/api/commission-statements${query}`);
  return body.batches ?? [];
}

export async function getBatch(batchId: string): Promise<{
  batch: BatchSummary & Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
}> {
  return request(`/api/commission-statements/${batchId}`);
}
