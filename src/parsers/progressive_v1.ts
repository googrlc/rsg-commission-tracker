/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * progressive_v1 — first statement parser (Commission Reconciliation spec §6).
 *
 * Source shape: Progressive `DetailedStatement*.xlsx`, `Detailed` sheet
 * (one row per commission transaction) + `Summary` sheet (carrier-stated totals
 * for the parsed-vs-stated cross-check). Columns are FIXED position (§6):
 *
 *   0 Insured Name        7 Tran Date          14 Gross Comm
 *   1 Policy Number       8 Gross Premium      15 Net Due Agent
 *   2 Policy Eff Date     9 Down Pmt Collected 16 Producer Name ("Prod Name")
 *   3 Policy Exp Date    10 Down Pmt Submitted 17 Agent Code
 *   4 Prod (Auto/Comm)   11 Billed Amount      18 Month End (YYYYMM)
 *   5 Agt Pre            12 Agency Due (=fee)   19 Renewal Count
 *   6 Tran Code          13 Comm (rate)
 *
 * Money model on this statement:
 *   • commission_amount = Gross Comm (col 14) — premium × rate, negative on
 *     Cancel Pro Rate / Credit Endorsement rows.
 *   • Agency Due (col 12) carries per-line MVR chargeback fees; those rows have
 *     zero Gross Comm and Net Due Agent = −AgencyDue. They are booked as `fee`
 *     lines (fee_type MVR) so commission rollups stay clean and fee-drag is
 *     visible separately (spec §5 v_fee_drag).
 *   • Net Due Agent (col 15) = Gross Comm − Agency Due, everywhere.
 */

import {
  type ParserInput,
  type ParseResult,
  type NormalizedTransaction,
  type RawRow,
  type RawCell,
  deriveSegment,
  monthKeyFromIso,
  normalizeTranCode,
  round2,
  toIsoDate,
  toNumber,
} from './types';

export const PROGRESSIVE_V1_KEY = 'progressive_v1';
const CANONICAL_CARRIER = 'Progressive';
const CROSS_CHECK_TOLERANCE = 0.02; // dollars

// Detailed column indices (§6).
const C = {
  insured: 0,
  policy: 1,
  prod: 4,
  tranCode: 6,
  tranDate: 7,
  grossPremium: 8,
  agencyDue: 12,
  rate: 13,
  grossComm: 14,
  netDueAgent: 15,
  producer: 16,
  agentCode: 17,
  monthEnd: 18,
  renewalCount: 19,
} as const;

function cell(row: RawRow, i: number): RawCell {
  return i < row.length ? row[i] : null;
}

function isBlankRow(row: RawRow): boolean {
  return !row || row.every((c) => c == null || String(c).trim() === '');
}

/** Pull the carrier-stated totals off the Summary sheet for the cross-check. */
function readStatedTotals(summaryRows: RawRow[] | undefined): {
  premium: number | null;
  commission: number | null;
  netDue: number | null;
} {
  const out = { premium: null as number | null, commission: null as number | null, netDue: null as number | null };
  if (!summaryRows) return out;
  for (const row of summaryRows) {
    const label = String(cell(row, 0) ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (label === 'agent total') {
      out.premium = toNumber(cell(row, 1)); // Net Written Premium - Current
      out.commission = toNumber(cell(row, 3)); // Commissions - Current
    } else if (label === 'net amount due agent') {
      out.netDue = toNumber(cell(row, 1));
    }
  }
  return out;
}

/** Statement period end from the filename date stamp (DetailedStatementYYYYMMDD). */
function periodEndFromFilename(filename: string): string | null {
  const m = filename.match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parseProgressiveV1(input: ParserInput): ParseResult {
  const { detailedRows, summaryRows, sourceFilename, uploadedBy } = input;

  // Drop the header row (index 0) and any blank rows.
  const body = detailedRows.slice(1).filter((r) => !isBlankRow(r));

  const transactions: NormalizedTransaction[] = body.map((row) => {
    const grossPremium = toNumber(cell(row, C.grossPremium));
    const grossComm = toNumber(cell(row, C.grossComm));
    const agencyDue = toNumber(cell(row, C.agencyDue));
    const isoDate = toIsoDate(cell(row, C.tranDate));
    const monthKey = monthKeyFromIso(isoDate) ?? toNumber(cell(row, C.monthEnd));

    // A row with a non-zero Agency Due and no commission is a pure MVR fee line.
    const isFeeLine = !!agencyDue && agencyDue !== 0 && (!grossComm || grossComm === 0);
    const txnType = isFeeLine ? 'fee' : normalizeTranCode(cell(row, C.tranCode));

    return {
      policy_number: cell(row, C.policy) != null ? String(cell(row, C.policy)).trim() : null,
      insured_name: cell(row, C.insured) != null ? String(cell(row, C.insured)).trim() : null,
      lob: cell(row, C.prod) != null ? String(cell(row, C.prod)).trim() : null,
      segment: deriveSegment(cell(row, C.prod)),
      transaction_code: cell(row, C.tranCode) != null ? String(cell(row, C.tranCode)).trim() : null,
      transaction_type: txnType,
      transaction_date: isoDate,
      month_key: monthKey == null ? null : Number(monthKey),
      gross_premium: grossPremium,
      commission_rate: toNumber(cell(row, C.rate)),
      commission_amount: grossComm,
      fee_type: isFeeLine ? 'MVR' : null,
      fee_amount: isFeeLine ? agencyDue : null,
      raw_row: {
        insured_name: cell(row, C.insured),
        policy_number: cell(row, C.policy),
        prod: cell(row, C.prod),
        tran_code: cell(row, C.tranCode),
        tran_date: cell(row, C.tranDate),
        gross_premium: cell(row, C.grossPremium),
        agency_due: cell(row, C.agencyDue),
        comm_rate: cell(row, C.rate),
        gross_comm: cell(row, C.grossComm),
        net_due_agent: cell(row, C.netDueAgent),
        producer: cell(row, C.producer),
        agent_code: cell(row, C.agentCode),
        month_end: cell(row, C.monthEnd),
        renewal_count: cell(row, C.renewalCount),
      },
    };
  });

  // Parsed totals (spec §3 parsed-vs-stated cross-check).
  const parsedPremium = round2(transactions.reduce((s, t) => s + (t.gross_premium ?? 0), 0));
  const parsedCommission = round2(transactions.reduce((s, t) => s + (t.commission_amount ?? 0), 0));
  const parsedFees = round2(transactions.reduce((s, t) => s + (t.fee_amount ?? 0), 0));
  const parsedNetDue = round2(parsedCommission - parsedFees);

  const stated = readStatedTotals(summaryRows);
  const near = (a: number, b: number | null): boolean | null =>
    b == null ? null : Math.abs(round2(a - b)) <= CROSS_CHECK_TOLERANCE;

  const isoDates = transactions.map((t) => t.transaction_date).filter((d): d is string => !!d).sort();

  return {
    header: {
      carrier_name: CANONICAL_CARRIER,
      statement_period_start: isoDates[0] ?? null,
      statement_period_end: periodEndFromFilename(sourceFilename) ?? isoDates[isoDates.length - 1] ?? null,
      source_filename: sourceFilename,
      source_format: 'xlsx',
      carrier_stated_total_premium: stated.premium,
      carrier_stated_total_commission: stated.commission,
      carrier_stated_net_due: stated.netDue,
      row_count: transactions.length,
      uploaded_by: uploadedBy ?? null,
    },
    transactions,
    crossCheck: {
      parsed_total_premium: parsedPremium,
      parsed_total_commission: parsedCommission,
      parsed_net_due: parsedNetDue,
      premium_matches: near(parsedPremium, stated.premium),
      commission_matches: near(parsedCommission, stated.commission),
      net_due_matches: near(parsedNetDue, stated.netDue),
      tolerance: CROSS_CHECK_TOLERANCE,
    },
  };
}
