/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Data access for the statement-reconciliation layer (Commission Reconciliation
 * Slices 2–3). Reads the v_* analytics views and the new tables; writes the
 * upload + reconcile flow and the rate-intake / carrier-profile management.
 * All gated by RLS (allowlisted authenticated users; rule writes are admin-only).
 */

import { supabase } from '../lib/supabase';
import type { ParseResult } from '../parsers/types';
import type {
  ReconException, ReconSummary, CommissionTxn, LossOnCancel,
  CommByLineRow, CommByCarrierRow, NbVsRenewalRow, SegmentRow, MonthlyTrendRow, FeeDragRow,
  CarrierProfile, CarrierAlias, RuleCoverage, RuleWithProvenance, RateIntake,
} from '../types';

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}
const n = (v: unknown): number | null => (v == null ? null : Number(v));

// --- Reconciliation tab (§11a) ---------------------------------------------

export async function fetchReconSummary(): Promise<ReconSummary> {
  const { data, error } = await supabase
    .from('v_reconciliation_summary')
    .select('*')
    .maybeSingle();
  if (error) fail('Load reconciliation summary', error);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    pricedMatchedCount: n(r.priced_matched_count) ?? 0,
    pricedMatchedActual: n(r.priced_matched_actual) ?? 0,
    underpaidCount: n(r.underpaid_count) ?? 0,
    underpaidDelta: n(r.underpaid_delta) ?? 0,
    overpaidCount: n(r.overpaid_count) ?? 0,
    noExpectedCount: n(r.no_expected_count) ?? 0,
    noExpectedActual: n(r.no_expected_actual) ?? 0,
    missingCount: n(r.missing_count) ?? 0,
    unmatchedCount: n(r.unmatched_count) ?? 0,
    unmatchedActual: n(r.unmatched_actual) ?? 0,
    canceledCount: n(r.canceled_count) ?? 0,
    canceledActual: n(r.canceled_actual) ?? 0,
    canceledChurn: n(r.canceled_churn) ?? 0,
  };
}

export async function fetchReconExceptions(): Promise<ReconException[]> {
  const { data, error } = await supabase
    .from('v_reconciliation_exceptions')
    .select('exception_type, reconciliation_status, carrier_name, policy_number, client_name, lob, expected_commission, actual_commission, delta, effective_date, expiration_date, term_months, expected_pay_month, pay_basis');
  if (error) fail('Load exceptions', error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    exceptionType: r.exception_type as ReconException['exceptionType'],
    reconciliationStatus: r.reconciliation_status as ReconException['reconciliationStatus'],
    carrierName: (r.carrier_name as string) ?? '',
    policyNumber: (r.policy_number as string) ?? null,
    clientName: (r.client_name as string) ?? null,
    lob: (r.lob as string) ?? null,
    expectedCommission: n(r.expected_commission),
    actualCommission: n(r.actual_commission),
    delta: n(r.delta),
    effectiveDate: (r.effective_date as string) ?? null,
    expirationDate: (r.expiration_date as string) ?? null,
    termMonths: n(r.term_months),
    expectedPayMonth: n(r.expected_pay_month),
    payBasis: (r.pay_basis as string) ?? null,
  }));
}

export async function fetchPolicyTransactions(
  carrierName: string, policyNumber: string,
): Promise<CommissionTxn[]> {
  const { data, error } = await supabase
    .from('commission_transactions')
    .select('id, transaction_code, transaction_type, transaction_date, lob, gross_premium, commission_rate, commission_amount, fee_type, fee_amount')
    .eq('carrier_name', carrierName)
    .eq('policy_number', policyNumber)
    .order('transaction_date', { ascending: true });
  if (error) fail('Load policy transactions', error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    transactionCode: (r.transaction_code as string) ?? null,
    transactionType: (r.transaction_type as string) ?? null,
    transactionDate: (r.transaction_date as string) ?? null,
    lob: (r.lob as string) ?? null,
    grossPremium: n(r.gross_premium),
    commissionRate: n(r.commission_rate),
    commissionAmount: n(r.commission_amount),
    feeType: (r.fee_type as string) ?? null,
    feeAmount: n(r.fee_amount),
  }));
}

export async function fetchLossOnCancel(): Promise<LossOnCancel[]> {
  const { data, error } = await supabase
    .from('v_loss_on_cancel')
    .select('carrier_name, payment_model, policy_number, insured_name, client_name, lob, transaction_date, realized_clawback, loss_amount, loss_basis');
  if (error) fail('Load loss-on-cancel', error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    carrierName: (r.carrier_name as string) ?? '',
    paymentModel: (r.payment_model as string) ?? null,
    policyNumber: (r.policy_number as string) ?? null,
    insuredName: (r.insured_name as string) ?? null,
    clientName: (r.client_name as string) ?? null,
    lob: (r.lob as string) ?? null,
    transactionDate: (r.transaction_date as string) ?? null,
    realizedClawback: n(r.realized_clawback) ?? 0,
    lossAmount: n(r.loss_amount),
    lossBasis: (r.loss_basis as string) ?? 'unconfirmed_model',
  }));
}

// --- Dashboard tab (§11b) — read views straight through as snake_case rows ---

async function selectAll<T>(view: string, order?: { col: string; asc?: boolean }): Promise<T[]> {
  let q = supabase.from(view).select('*');
  if (order) q = q.order(order.col, { ascending: order.asc ?? true });
  const { data, error } = await q;
  if (error) fail(`Load ${view}`, error);
  return (data ?? []) as T[];
}

export const fetchCommByLine = () => selectAll<CommByLineRow>('v_comm_by_line');
export const fetchCommByCarrier = () => selectAll<CommByCarrierRow>('v_comm_by_carrier');
export const fetchNbVsRenewal = () => selectAll<NbVsRenewalRow>('v_nb_vs_renewal');
export const fetchAvgPremiumBySegment = () => selectAll<SegmentRow>('v_avg_premium_by_segment');
export const fetchMonthlyTrend = () => selectAll<MonthlyTrendRow>('v_monthly_trend', { col: 'month_key' });
export const fetchFeeDrag = () => selectAll<FeeDragRow>('v_fee_drag');

// --- Rates tab (§11c) -------------------------------------------------------

export async function fetchRuleCoverage(): Promise<RuleCoverage[]> {
  const { data, error } = await supabase
    .from('v_rule_coverage')
    .select('carrier, ledger_policies, unpriced, priced');
  if (error) fail('Load coverage', error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    carrier: (r.carrier as string) ?? '',
    ledgerPolicies: n(r.ledger_policies) ?? 0,
    unpriced: n(r.unpriced) ?? 0,
    priced: n(r.priced) ?? 0,
  }));
}

export async function fetchRulesWithProvenance(): Promise<RuleWithProvenance[]> {
  const { data, error } = await supabase
    .from('commission_rules')
    .select('id, carrier_name, mga_name, lob, state, nb_percent, renewal_percent, commission_method, source_type, confidence, last_confirmed_date, observed_date, superseded_by, active')
    .eq('active', true)
    .order('carrier_name', { ascending: true })
    .order('lob', { ascending: true });
  if (error) fail('Load rules', error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    carrierName: (r.carrier_name as string) ?? '',
    mgaName: (r.mga_name as string) ?? null,
    lob: (r.lob as string) ?? null,
    state: (r.state as string) ?? null,
    nbPercent: n(r.nb_percent),
    renewalPercent: n(r.renewal_percent),
    commissionMethod: (r.commission_method as string) ?? null,
    sourceType: (r.source_type as string) ?? null,
    confidence: (r.confidence as string) ?? null,
    lastConfirmedDate: (r.last_confirmed_date as string) ?? null,
    observedDate: (r.observed_date as string) ?? null,
    supersededBy: (r.superseded_by as string) ?? null,
    active: Boolean(r.active),
  }));
}

/** Inline rate edit → stamps manual provenance (spec §11c). Admin-only via RLS. */
export async function updateRuleRate(
  id: string, patch: { nbPercent?: number | null; renewalPercent?: number | null },
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const row: Record<string, unknown> = {
    source_type: 'manual', observed_date: today, last_confirmed_date: today, confidence: 'high',
  };
  if ('nbPercent' in patch) row.nb_percent = patch.nbPercent;
  if ('renewalPercent' in patch) row.renewal_percent = patch.renewalPercent;
  const { error } = await supabase.from('commission_rules').update(row).eq('id', id);
  if (error) fail('Update rate (admin only)', error);
}

export async function fetchRateIntake(status = 'pending'): Promise<RateIntake[]> {
  const { data, error } = await supabase
    .from('carrier_rate_intake')
    .select('id, carrier_name, canonical_carrier, lob, state, mga_name, proposed_nb_percent, proposed_renewal_percent, flat_fee, commission_method, source_type, source_document, observed_date, confidence, status, conflict_rule_id')
    .eq('status', status)
    .order('created_at', { ascending: false });
  if (error) fail('Load rate intake', error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    carrierName: (r.carrier_name as string) ?? '',
    canonicalCarrier: (r.canonical_carrier as string) ?? null,
    lob: (r.lob as string) ?? null,
    state: (r.state as string) ?? null,
    mgaName: (r.mga_name as string) ?? null,
    proposedNbPercent: n(r.proposed_nb_percent),
    proposedRenewalPercent: n(r.proposed_renewal_percent),
    flatFee: n(r.flat_fee),
    commissionMethod: (r.commission_method as string) ?? null,
    sourceType: (r.source_type as string) ?? 'rate_sheet',
    sourceDocument: (r.source_document as string) ?? null,
    observedDate: (r.observed_date as string) ?? null,
    confidence: (r.confidence as string) ?? 'medium',
    status: (r.status as RateIntake['status']) ?? 'pending',
    conflictRuleId: (r.conflict_rule_id as string) ?? null,
  }));
}

/** Approve a rate-intake row → new commission_rule w/ provenance. Admin-only. */
export async function approveRateIntake(item: RateIntake, reviewedBy: string | null): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { error: insErr } = await supabase.from('commission_rules').insert({
    carrier_name: item.canonicalCarrier ?? item.carrierName,
    lob: item.lob, state: item.state, mga_name: item.mgaName ?? 'Direct',
    nb_percent: item.proposedNbPercent, renewal_percent: item.proposedRenewalPercent,
    flat_fee: item.flatFee, commission_method: item.commissionMethod ?? '% of Premium',
    source_type: item.sourceType, observed_date: item.observedDate ?? today,
    last_confirmed_date: today, confidence: item.confidence, active: true, lookup_priority: 3,
    notes: `Approved from rate intake (${item.sourceDocument ?? 'manual'})`,
  });
  if (insErr) fail('Approve rate (admin only)', insErr);
  const { error: updErr } = await supabase.from('carrier_rate_intake')
    .update({ status: 'approved', reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq('id', item.id);
  if (updErr) fail('Approve rate (status)', updErr);
}

export async function rejectRateIntake(id: string, reviewedBy: string | null): Promise<void> {
  const { error } = await supabase.from('carrier_rate_intake')
    .update({ status: 'rejected', reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) fail('Reject rate', error);
}

// --- Carriers tab (§11d) ----------------------------------------------------

export async function fetchCarrierProfiles(): Promise<CarrierProfile[]> {
  const { data, error } = await supabase
    .from('carrier_commission_profile')
    .select('id, carrier_name, payment_model, default_nb_percent, default_renewal_percent, clawback_window_months, statement_format, statement_parser_key, notes')
    .order('carrier_name', { ascending: true });
  if (error) fail('Load carrier profiles', error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    carrierName: (r.carrier_name as string) ?? '',
    paymentModel: (r.payment_model as CarrierProfile['paymentModel']) ?? 'confirm_on_upload',
    defaultNbPercent: n(r.default_nb_percent),
    defaultRenewalPercent: n(r.default_renewal_percent),
    clawbackWindowMonths: n(r.clawback_window_months),
    statementFormat: (r.statement_format as string) ?? null,
    statementParserKey: (r.statement_parser_key as string) ?? null,
    notes: (r.notes as string) ?? null,
  }));
}

export async function updateCarrierProfile(
  id: string, patch: Partial<{ paymentModel: string; defaultNbPercent: number | null; defaultRenewalPercent: number | null; clawbackWindowMonths: number | null }>,
): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('paymentModel' in patch) row.payment_model = patch.paymentModel;
  if ('defaultNbPercent' in patch) row.default_nb_percent = patch.defaultNbPercent;
  if ('defaultRenewalPercent' in patch) row.default_renewal_percent = patch.defaultRenewalPercent;
  if ('clawbackWindowMonths' in patch) row.clawback_window_months = patch.clawbackWindowMonths;
  const { error } = await supabase.from('carrier_commission_profile').update(row).eq('id', id);
  if (error) fail('Update carrier profile', error);
}

export async function fetchAliasMap(): Promise<CarrierAlias[]> {
  const { data, error } = await supabase
    .from('carrier_alias_map')
    .select('id, raw_name, canonical_carrier')
    .order('canonical_carrier', { ascending: true });
  if (error) fail('Load alias map', error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    rawName: (r.raw_name as string) ?? '',
    canonicalCarrier: (r.canonical_carrier as string) ?? '',
  }));
}

// --- Upload + reconcile (Slice 2) ------------------------------------------

export interface UploadOutcome {
  statementId: string;
  rowCount: number;
  reconcileSummary: unknown;
}

/** Insert parsed statement header + transactions, then reconcile the carrier. */
export async function uploadParsedStatement(
  result: ParseResult, uploadedBy: string | null,
): Promise<UploadOutcome> {
  const h = result.header;
  // Idempotent: drop a prior load of the same file (cascade -> transactions).
  await supabase.from('commission_statements').delete().eq('source_filename', h.source_filename);

  const { data: stmt, error: hErr } = await supabase
    .from('commission_statements')
    .insert({
      carrier_name: h.carrier_name,
      statement_period_start: h.statement_period_start,
      statement_period_end: h.statement_period_end,
      source_filename: h.source_filename,
      source_format: h.source_format,
      carrier_stated_total_premium: h.carrier_stated_total_premium,
      carrier_stated_total_commission: h.carrier_stated_total_commission,
      carrier_stated_net_due: h.carrier_stated_net_due,
      row_count: h.row_count,
      upload_status: 'parsed',
      uploaded_by: uploadedBy,
    })
    .select('id')
    .single();
  if (hErr) fail('Save statement header', hErr);
  const statementId = (stmt as { id: string }).id;

  const rows = result.transactions.map((t) => ({ statement_id: statementId, carrier_name: h.carrier_name, ...t }));
  // chunk inserts to keep payloads reasonable
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('commission_transactions').insert(rows.slice(i, i + 500));
    if (error) fail('Save transactions', error);
  }

  const { data: summary, error: rErr } = await supabase.rpc('reconcile_carrier', { p_canonical: h.carrier_name });
  if (rErr) fail('Reconcile', rErr);

  return { statementId, rowCount: rows.length, reconcileSummary: summary };
}
