/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * NEXT Insurance commission-statement parser (spec §3, §6b).
 *
 * NEXT delivers a flat per-policy CSV (one sheet, no summary/totals row). It is an
 * AS-EARNED carrier: commission trickles in monthly as premium is collected, so the
 * statement carries both a cumulative "…Paid to Date" and an incremental
 * "…Paid this Month". We normalize on the INCREMENTAL month value because that is
 * the only figure that is summable across successive monthly statements without
 * double-counting — twelve monthly loads then sum to the term total. The cumulative
 * columns are preserved in raw_row for audit.
 *
 * Columns are looked up BY HEADER NAME (not fixed index) so a column reorder in a
 * future NEXT export doesn't silently shift the mapping.
 */

import type {
  ParserInput, ParseResult, NormalizedTransaction, StatementHeader, RawRow, RawCell,
} from './types';
import { normalizeTranCode, toIsoDate, monthKeyFromIso, toNumber, round2 } from './types';

export const NEXT_V1_KEY = 'next_v1';

/** NEXT statements have no carrier field — the carrier is implied. Match the ledger. */
const NEXT_CANONICAL = 'NEXT INS US CO';

/** Header labels we depend on (lowercased, trimmed for matching). */
const COL = {
  policy: 'policy number',
  lob: 'lob',
  business: 'business name',
  statementDate: 'statement date',
  effective: 'effective date',
  expiration: 'expiration date',
  cob: 'cob',
  tier: 'commission tier',
  newRenewal: 'new renewal',
  agentCommission: 'agent commission',
  status: 'policy status',
  plan: 'payment plan',
  paidToDate: 'agency commission paid to date',
  paidThisMonth: 'agency commission paid this month',
  premToDate: 'total premium collected to date',
  premThisMonth: 'premium collected this month',
  earnedPrem: 'total earned premium',
  writtenPrem: 'total written premium',
} as const;

function headerIndex(headerRow: RawRow): Record<string, number> {
  const idx: Record<string, number> = {};
  headerRow.forEach((cell, i) => {
    const k = String(cell ?? '').trim().toLowerCase();
    if (k) idx[k] = i;
  });
  return idx;
}

/** True if this looks like a NEXT statement (content sniff on the distinctive headers). */
export function looksLikeNext(headerRow: RawRow): boolean {
  const idx = headerIndex(headerRow);
  return COL.paidThisMonth in idx && COL.policy in idx && COL.agentCommission in idx;
}

export function parseNextV1(input: ParserInput): ParseResult {
  const rows = input.detailedRows ?? [];
  if (rows.length < 2) {
    throw new Error('next_v1: statement has no data rows');
  }
  const idx = headerIndex(rows[0]);
  if (!looksLikeNext(rows[0])) {
    throw new Error('next_v1: header does not match the NEXT format');
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
    if (!policy) continue; // skip stray/blank lines

    const isoDate = toIsoDate(get(row, COL.statementDate));
    if (isoDate) {
      if (!minDate || isoDate < minDate) minDate = isoDate;
      if (!maxDate || isoDate > maxDate) maxDate = isoDate;
    }

    const raw: Record<string, unknown> = {};
    rows[0].forEach((h, i) => { raw[String(h ?? `col${i}`)] = row[i] ?? null; });

    transactions.push({
      policy_number: policy,
      insured_name: (String(get(row, COL.business) ?? '').trim() || null),
      lob: (String(get(row, COL.lob) ?? '').trim() || null),
      segment: 'commercial', // NEXT is small-commercial (GL/BP/PL/WC)
      transaction_code: (String(get(row, COL.newRenewal) ?? '').trim() || null),
      transaction_type: normalizeTranCode(get(row, COL.newRenewal)),
      transaction_date: isoDate,
      month_key: monthKeyFromIso(isoDate),
      gross_premium: toNumber(get(row, COL.premThisMonth)),
      commission_rate: toNumber(get(row, COL.agentCommission)),
      commission_amount: toNumber(get(row, COL.paidThisMonth)),
      fee_type: null,
      fee_amount: null,
      raw_row: raw,
    });
  }

  const parsedPremium = round2(
    transactions.reduce((s, t) => s + (t.gross_premium ?? 0), 0),
  );
  const parsedCommission = round2(
    transactions.reduce((s, t) => s + (t.commission_amount ?? 0), 0),
  );

  const header: StatementHeader = {
    carrier_name: NEXT_CANONICAL,
    statement_period_start: minDate ? `${minDate.slice(0, 7)}-01` : null,
    statement_period_end: maxDate,
    source_filename: input.sourceFilename,
    source_format: 'csv',
    // NEXT provides no carrier-stated totals row, so there is nothing to tie to.
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
      premium_matches: null, // no carrier total to compare against
      commission_matches: null,
      net_due_matches: null,
      tolerance: 0.02,
    },
  };
}
