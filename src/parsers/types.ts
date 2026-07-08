/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared parser contract for the commission statement-ingestion layer
 * (Commission Reconciliation build spec §3). Every carrier statement is shaped
 * differently, so each carrier gets a parser module keyed by
 * `carrier_commission_profile.statement_parser_key`. All parsers normalize their
 * carrier's rows into the SAME shape — the columns of `commission_transactions`
 * (§2e) — plus one `commission_statements` header (§2d).
 *
 * Parsers are intentionally I/O-agnostic: they take already-extracted cell rows
 * (arrays of primitives) and return normalized objects. Reading the file itself
 * (xlsx/csv/pdf → rows) is the caller's job, so the same parser runs from a
 * Node loader (Slice 1) or a browser/server upload endpoint (Slice 2).
 */

/** A single extracted cell. Excel/CSV give us strings, numbers, dates, or blanks. */
export type RawCell = string | number | boolean | Date | null | undefined;
export type RawRow = RawCell[];

/**
 * Normalized transaction buckets. `transaction_code` keeps the carrier's raw
 * label; `transaction_type` is the cross-carrier bucket the analytics views
 * group on. `reinstatement` restores a cancelled term (the inverse of a cancel);
 * `fee` is a pure fee line (e.g. MVR chargeback) carrying no premium commission.
 */
export type TransactionType =
  | 'new'
  | 'renewal'
  | 'endorsement'
  | 'cancel'
  | 'chargeback'
  | 'reinstatement'
  | 'adjustment'
  | 'fee'
  | 'unknown';

/** One normalized statement line → one `commission_transactions` row. */
export interface NormalizedTransaction {
  policy_number: string | null;
  insured_name: string | null;
  lob: string | null;
  segment: 'personal' | 'commercial' | null;
  transaction_code: string | null;
  transaction_type: TransactionType;
  transaction_date: string | null; // ISO yyyy-mm-dd
  month_key: number | null; // YYYYMM
  gross_premium: number | null;
  commission_rate: number | null;
  commission_amount: number | null; // may be negative (cancels/credits/chargebacks)
  fee_type: string | null; // 'MVR' | 'chargeback' | null
  fee_amount: number | null;
  raw_row: Record<string, unknown>;
}

/** One `commission_statements` header row. */
export interface StatementHeader {
  carrier_name: string; // canonical carrier (post alias map)
  statement_period_start: string | null;
  statement_period_end: string | null;
  source_filename: string;
  source_format: 'csv' | 'pdf' | 'xlsx';
  carrier_stated_total_premium: number | null;
  carrier_stated_total_commission: number | null;
  carrier_stated_net_due: number | null;
  row_count: number;
  uploaded_by: string | null;
}

/**
 * Parsed-vs-stated cross-check (§3, last step of the upload flow). Non-fatal:
 * surfaced to the user so a parser drift or a carrier restatement is visible,
 * but it does not block the load.
 */
export interface CrossCheck {
  parsed_total_premium: number;
  parsed_total_commission: number;
  parsed_net_due: number;
  premium_matches: boolean | null;
  commission_matches: boolean | null;
  net_due_matches: boolean | null;
  /** absolute tolerance used for the match (dollars) */
  tolerance: number;
}

export interface ParseResult {
  header: StatementHeader;
  transactions: NormalizedTransaction[];
  crossCheck: CrossCheck;
}

export interface ParserInput {
  /** Rows of the carrier's line-item sheet, header row INCLUDED at index 0. */
  detailedRows: RawRow[];
  /** Rows of the carrier's summary/totals sheet (optional). */
  summaryRows?: RawRow[];
  sourceFilename: string;
  uploadedBy?: string | null;
}

export type StatementParser = (input: ParserInput) => ParseResult;

// ── Shared normalization helpers ───────────────────────────────────────────

/**
 * Cross-carrier transaction_code → transaction_type map. Keyed on a lowercased,
 * whitespace-collapsed code. Carrier-specific parsers may override per row
 * (e.g. a coded "Adjustment" that is really an MVR fee line).
 */
export const TRAN_CODE_MAP: Record<string, TransactionType> = {
  'new business': 'new',
  new: 'new',
  renewal: 'renewal',
  endorsement: 'endorsement',
  'credit endorsement': 'adjustment', // premium/commission credit, NOT a policy cancel
  'cancel pro rate': 'cancel',
  cancel: 'cancel',
  cancellation: 'cancel',
  chargeback: 'chargeback',
  reinstatement: 'reinstatement',
  adjustment: 'adjustment',
};

export function normalizeTranCode(code: RawCell): TransactionType {
  if (code == null) return 'unknown';
  const key = String(code).trim().toLowerCase().replace(/\s+/g, ' ');
  return TRAN_CODE_MAP[key] ?? 'unknown';
}

/** personal vs commercial, for the avg-premium-by-segment rollup. */
export function deriveSegment(prod: RawCell): 'personal' | 'commercial' | null {
  if (prod == null || String(prod).trim() === '') return null;
  return /commercial|comm\.?\s*veh/i.test(String(prod)) ? 'commercial' : 'personal';
}

/** Parse "MM/DD/YYYY", "YYYY-MM-DD", a JS Date, or an Excel serial → ISO yyyy-mm-dd. */
export function toIsoDate(v: RawCell): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  // SheetJS with raw:true returns date cells (incl. CSV auto-detected dates) as
  // Excel serials — days since 1899-12-30. Convert with pure UTC math so there's
  // no timezone off-by-one.
  if (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 2958466) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
      .toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

/** YYYYMM integer from an ISO date (spec: derive month_key from transaction_date). */
export function monthKeyFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})/);
  return m ? Number(`${m[1]}${m[2]}`) : null;
}

/** Tolerant number coercion: strips $ , ( ) and treats (x) as negative. */
export function toNumber(v: RawCell): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (s === '' || /^n\/?a$/i.test(s)) return null;
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[(),$\s]/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Round to cents to kill floating-point dust in aggregate cross-checks. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
