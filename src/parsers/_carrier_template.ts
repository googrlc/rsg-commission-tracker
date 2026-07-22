/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * CARRIER TEMPLATE — copy this file to `<carrier>_v1.ts` to onboard a new carrier
 * (spec §3). Follows the same conventions as next_v1.ts / progressive_v1.ts:
 *   • columns looked up BY HEADER NAME (not fixed index) so a carrier column
 *     reorder can't silently shift the mapping;
 *   • all rows normalized into the shared NormalizedTransaction shape (§2e);
 *   • shared helpers (toNumber/toIsoDate/etc.) do the messy coercion.
 *
 * Onboarding checklist (see the reconcile spine in db/slice1_schema.sql):
 *   1. Copy → src/parsers/<carrier>_v1.ts, fill every TODO(carrier).
 *   2. Register in src/parsers/registry.ts:
 *        import { parse<Carrier>V1, <CARRIER>_V1_KEY } from './<carrier>_v1';
 *        REGISTRY[<CARRIER>_V1_KEY] = parse<Carrier>V1;
 *   3. Insert a carrier_commission_profile row with
 *        statement_parser_key = '<carrier>_v1'  and add carrier_alias_map rows
 *        mapping every raw name variant → the canonical below.
 *   4. Add <carrier>_v1.test.ts with a couple of real sample rows + a cross-check.
 */

import type {
  ParserInput, ParseResult, NormalizedTransaction, StatementHeader, RawRow, RawCell,
} from './types';
import { normalizeTranCode, toIsoDate, monthKeyFromIso, toNumber, round2, deriveSegment } from './types';

// TODO(carrier): unique key; MUST equal carrier_commission_profile.statement_parser_key.
export const CARRIER_V1_KEY = 'carrier_v1';

// TODO(carrier): canonical carrier name — must EXACTLY match the ledger + the
// canonical_carrier used in carrier_alias_map (this is what reconcile_carrier joins on).
const CARRIER_CANONICAL = 'CARRIER CANONICAL NAME';

/** TODO(carrier): the exact header labels from a real statement (lowercased, trimmed). */
const COL = {
  policy: 'policy number',
  insured: 'insured name',
  lob: 'line of business',
  transactionCode: 'transaction type',
  transactionDate: 'transaction date',
  premium: 'written premium',
  rate: 'commission rate',
  commission: 'commission amount',
} as const;

function headerIndex(headerRow: RawRow): Record<string, number> {
  const idx: Record<string, number> = {};
  headerRow.forEach((cell, i) => {
    const k = String(cell ?? '').trim().toLowerCase();
    if (k) idx[k] = i;
  });
  return idx;
}

/** TODO(carrier): content sniff on the most distinctive headers for auto-detection. */
export function looksLikeCarrier(headerRow: RawRow): boolean {
  const idx = headerIndex(headerRow);
  return COL.policy in idx && COL.commission in idx;
}

export function parseCarrierV1(input: ParserInput): ParseResult {
  const rows = input.detailedRows ?? [];
  if (rows.length < 2) {
    throw new Error('carrier_v1: statement has no data rows');
  }
  const idx = headerIndex(rows[0]);
  if (!looksLikeCarrier(rows[0])) {
    throw new Error('carrier_v1: header does not match the expected format');
  }
  const get = (row: RawRow, key: string): RawCell => {
    const i = idx[key];
    return i == null ? null : row[i];
  };

  const transactions: NormalizedTransaction[] = [];
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => c == null || String(c).trim() === '')) continue;

    const policy = String(get(row, COL.policy) ?? '').trim();
    if (!policy) continue; // skip stray/blank/subtotal lines

    const isoDate = toIsoDate(get(row, COL.transactionDate));
    if (isoDate) {
      if (!minDate || isoDate < minDate) minDate = isoDate;
      if (!maxDate || isoDate > maxDate) maxDate = isoDate;
    }

    const raw: Record<string, unknown> = {};
    rows[0].forEach((h, i) => { raw[String(h ?? `col${i}`)] = row[i] ?? null; });

    transactions.push({
      policy_number: policy,
      insured_name: (String(get(row, COL.insured) ?? '').trim() || null),
      lob: (String(get(row, COL.lob) ?? '').trim() || null),
      // TODO(carrier): if this carrier is single-segment, hardcode 'personal'/'commercial'
      // like next_v1 does; otherwise derive from the LOB/product cell.
      segment: deriveSegment(get(row, COL.lob)),
      transaction_code: (String(get(row, COL.transactionCode) ?? '').trim() || null),
      transaction_type: normalizeTranCode(get(row, COL.transactionCode)),
      transaction_date: isoDate,
      month_key: monthKeyFromIso(isoDate),
      gross_premium: toNumber(get(row, COL.premium)),
      commission_rate: toNumber(get(row, COL.rate)),
      commission_amount: toNumber(get(row, COL.commission)), // may be negative on cancels/chargebacks
      fee_type: null,   // TODO(carrier): map fee lines if the statement has them
      fee_amount: null,
      raw_row: raw,
    });
  }

  const parsedPremium = round2(transactions.reduce((s, t) => s + (t.gross_premium ?? 0), 0));
  const parsedCommission = round2(transactions.reduce((s, t) => s + (t.commission_amount ?? 0), 0));

  // TODO(carrier): if the statement carries a stated-totals row (summaryRows),
  // read it here and set the *_matches flags so parser drift is visible (see
  // progressive_v1 for the summary-sheet pattern). NEXT-style flat files leave these null.
  const header: StatementHeader = {
    carrier_name: CARRIER_CANONICAL,
    statement_period_start: minDate ? `${minDate.slice(0, 7)}-01` : null,
    statement_period_end: maxDate,
    source_filename: input.sourceFilename,
    source_format: 'csv', // TODO(carrier): 'csv' | 'xlsx' | 'pdf'
    carrier_stated_total_premium: null,
    carrier_stated_total_commission: null,
    carrier_stated_net_due: null,
    row_count: transactions.length,
    uploaded_by: input.uploadedBy ?? null,
  };

  return {
    header,
    transactions,
    crossCheck: {
      parsed_total_premium: parsedPremium,
      parsed_total_commission: parsedCommission,
      parsed_net_due: parsedCommission,
      premium_matches: null,
      commission_matches: null,
      net_due_matches: null,
      tolerance: 0.02,
    },
  };
}
