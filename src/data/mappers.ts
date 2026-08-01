/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Translation layer between the app's in-memory models (types.ts) and the live
 * Supabase tables. The UI keeps working with CarrierRule / WonPolicy /
 * ReconciliationStatement exactly as before — only these functions know the DB.
 *
 * Schema notes (verified against project wibscqhkvpijzqbhjphg on 2026-07-06):
 *  - commission_rules stores BOTH new and renewal rates in ONE row
 *    (nb_percent + renewal_percent). We expand each row into up to two app
 *    CarrierRule entries and tag the id with "::new" / "::renew" so writes can
 *    map back to the originating row.
 *  - commission_ledger is the WonPolicy home. Manual-entry-only inputs
 *    (payroll/admin-fee/monthly-premium/payment-timing) live in dedicated
 *    nullable columns added for this app; the AMS ingest leaves them NULL.
 *  - commission_reconciliation is used as the payment/discrepancy log: one row
 *    per received line, chargebacks stored as a negative actual_commission with
 *    discrepancy_type='chargeback'.
 */

import type {
  CarrierRule,
  WonPolicy,
  ReconciliationStatement,
  ReconciliationDiscrepancy,
  CommissionMethod,
} from '../types';

// --- DB row shapes (only the columns this app touches) ---------------------

export interface RuleRow {
  id: string;
  lob: string;
  carrier_name: string | null;
  commission_method: string;
  nb_percent: number | null;
  renewal_percent: number | null;
  flat_fee: number | null;
  commission_basis: string | null;
  mga_name: string | null;
  state: string | null;
  notes: string | null;
  lookup_priority: number | null;
}

export interface LedgerRow {
  id: string;
  policy_number: string;
  nowcerts_policy_id: string | null;
  carrier_name: string;
  lob: string;
  client_name: string;
  statement_date: string;
  policy_effective_date: string | null;
  is_renewal: boolean | null;
  gross_premium: number | null;
  ee_count: number | null;
  expected_commission: number | null;
  commission_rule_id: string | null;
  commission_basis: string | null;
  reconciliation_status: string | null;
  statement_source: string | null;
  notes: string | null;
  // app-specific manual-entry columns
  payroll_amount: number | null;
  admin_fee_amount: number | null;
  monthly_premium_amount: number | null;
  payment_timing: string | null;
}

export interface ReconRow {
  id: string;
  ledger_id: string | null;
  policy_number: string;
  carrier_name: string;
  client_name: string;
  statement_date: string;
  actual_commission: number | null;
  discrepancy_type: string | null;
  resolution_notes: string | null;
}

const RULE_SUFFIX = { new: '::new', renew: '::renew' } as const;

function toTiming(basis: string | null | undefined): 'As Earned' | 'In Advance' {
  return basis === 'advance' || basis === 'in_advance' ? 'In Advance' : 'As Earned';
}
function fromTiming(t: 'As Earned' | 'In Advance' | undefined): string | null {
  if (t === 'In Advance') return 'advance';
  if (t === 'As Earned') return 'as_earned';
  return null;
}

// --- commission_rules <-> CarrierRule --------------------------------------

/** One DB rule row expands into up to two app rules (New + Renewal). */
export function ruleRowToRules(row: RuleRow): CarrierRule[] {
  const base = {
    carrier: row.carrier_name ?? '',
    lineOfBusiness: row.lob,
    method: (row.commission_method as CommissionMethod) ?? '% of Premium',
    flatOrPerEmployeeAmount: row.flat_fee ?? undefined,
    paymentTiming: toTiming(row.commission_basis),
    notes: row.notes ?? '',
  };

  const out: CarrierRule[] = [];
  const hasNew = row.nb_percent != null;
  const hasRenew = row.renewal_percent != null;

  if (hasNew || (!hasNew && !hasRenew)) {
    out.push({
      ...base,
      id: `${row.id}${RULE_SUFFIX.new}`,
      newRenewal: 'New',
      ratePercentage: row.nb_percent ?? undefined,
    });
  }
  if (hasRenew) {
    out.push({
      ...base,
      id: `${row.id}${RULE_SUFFIX.renew}`,
      newRenewal: 'Renewal',
      ratePercentage: row.renewal_percent ?? undefined,
    });
  }
  return out;
}

/** Parse an app rule id back to its DB row id + which rate column it drives. */
export function parseRuleId(
  appId: string,
): { dbId: string; field: 'nb_percent' | 'renewal_percent' } | null {
  if (appId.endsWith(RULE_SUFFIX.new))
    return { dbId: appId.slice(0, -RULE_SUFFIX.new.length), field: 'nb_percent' };
  if (appId.endsWith(RULE_SUFFIX.renew))
    return { dbId: appId.slice(0, -RULE_SUFFIX.renew.length), field: 'renewal_percent' };
  return null;
}

/** Build an insert row for a brand-new rule created in the UI. */
export function ruleToInsertRow(rule: CarrierRule): Record<string, unknown> {
  const isRenewal = rule.newRenewal === 'Renewal';
  return {
    lob: rule.lineOfBusiness.trim(),
    carrier_name: rule.carrier.trim(),
    commission_method: rule.method,
    nb_percent: isRenewal ? null : rule.ratePercentage ?? null,
    renewal_percent: isRenewal ? rule.ratePercentage ?? null : null,
    flat_fee: rule.flatOrPerEmployeeAmount ?? null,
    commission_basis: fromTiming(rule.paymentTiming) ?? 'as_earned',
    notes: rule.notes?.trim() || null,
    mga_name: 'Direct',
    state: 'GA',
  };
}

// --- commission_ledger <-> WonPolicy ---------------------------------------

export function ledgerRowToPolicy(row: LedgerRow): WonPolicy {
  return {
    id: row.id,
    policyNumber: row.policy_number,
    dateWon: row.policy_effective_date ?? row.statement_date,
    policyEffectiveDate: row.policy_effective_date ?? undefined,
    clientName: row.client_name,
    carrier: row.carrier_name,
    lineOfBusiness: row.lob,
    newRenewal: row.is_renewal ? 'Renewal' : 'New',
    premiumAmount: row.gross_premium ?? undefined,
    payrollAmount: row.payroll_amount ?? undefined,
    numberOfEmployees: row.ee_count ?? undefined,
    adminFeeAmount: row.admin_fee_amount ?? undefined,
    monthlyPremiumAmount: row.monthly_premium_amount ?? undefined,
    paymentTiming:
      (row.payment_timing as 'As Earned' | 'In Advance' | null) ?? undefined,
    // Manual/no-rule policies read their expected back as the manual amount so
    // the client-side lookup shows the stored value.
    manualExpectedAmount:
      row.commission_rule_id == null && row.expected_commission != null
        ? Number(row.expected_commission)
        : undefined,
    notes: row.notes ?? '',
  };
}

/**
 * Build a ledger insert/update payload from a WonPolicy.
 * `expectedCommission` is computed by the caller via lookupAndCalculate so the
 * mapper stays free of the rules array.
 */
export function policyToLedgerRow(
  policy: WonPolicy,
  expectedCommission: number,
): Record<string, unknown> {
  return {
    policy_number: policy.policyNumber.trim(),
    carrier_name: policy.carrier.trim(),
    lob: policy.lineOfBusiness.trim(),
    client_name: policy.clientName.trim(),
    statement_date: policy.dateWon,
    policy_effective_date: policy.policyEffectiveDate || policy.dateWon,
    is_renewal: policy.newRenewal === 'Renewal',
    gross_premium: policy.premiumAmount ?? null,
    ee_count: policy.numberOfEmployees ?? null,
    payroll_amount: policy.payrollAmount ?? null,
    admin_fee_amount: policy.adminFeeAmount ?? null,
    monthly_premium_amount: policy.monthlyPremiumAmount ?? null,
    payment_timing: policy.paymentTiming ?? null,
    expected_commission: Number.isFinite(expectedCommission)
      ? expectedCommission
      : null,
    reconciliation_status: 'pending',
    statement_source: 'commission_tracker_app',
    // Manual UI rows are non-AMS by definition — keep nowcerts_policy_id NULL.
    nowcerts_policy_id: null,
    notes: policy.notes?.trim() || null,
  };
}

// --- commission_reconciliation <-> ReconciliationStatement -----------------

export function reconRowToStatement(row: ReconRow): ReconciliationStatement {
  const isChargeback =
    row.discrepancy_type === 'chargeback' ||
    (row.actual_commission != null && Number(row.actual_commission) < 0);
  return {
    id: row.id,
    statementMonth: (row.statement_date ?? '').substring(0, 7),
    policyId: row.ledger_id ?? '',
    receivedAmount: Math.abs(Number(row.actual_commission ?? 0)),
    transactionType: isChargeback ? 'Chargeback' : 'Payment',
    notes: row.resolution_notes ?? '',
  };
}

/**
 * Build a reconciliation insert payload. Needs the linked policy to fill the
 * NOT NULL denormalized columns (policy_number/carrier_name/client_name).
 */
// --- commission_reconciliation (discrepancy queue, Phase 3) ----------------

export interface DiscrepancyRow {
  id: string;
  policy_number: string;
  carrier_name: string;
  client_name: string;
  statement_date: string;
  expected_commission: number | null;
  actual_commission: number | null;
  delta: number | null;
  delta_percent: number | null;
  discrepancy_type: string | null;
  priority: string | null;
  status: string | null;
  assigned_to: string | null;
  resolution_notes: string | null;
  amount_recovered: number | null;
}

const _num = (v: number | null): number | undefined =>
  v == null ? undefined : Number(v);

export function discrepancyRowToModel(row: DiscrepancyRow): ReconciliationDiscrepancy {
  return {
    id: row.id,
    policyNumber: row.policy_number,
    carrierName: row.carrier_name,
    clientName: row.client_name,
    statementDate: row.statement_date,
    expectedCommission: _num(row.expected_commission),
    actualCommission: _num(row.actual_commission),
    delta: _num(row.delta),
    deltaPercent: _num(row.delta_percent),
    discrepancyType: row.discrepancy_type ?? 'unknown',
    priority: row.priority ?? 'medium',
    status: row.status ?? 'open',
    assignedTo: row.assigned_to ?? undefined,
    resolutionNotes: row.resolution_notes ?? undefined,
    amountRecovered: _num(row.amount_recovered),
  };
}

export function statementToReconRow(
  stmt: ReconciliationStatement,
  policy: WonPolicy,
): Record<string, unknown> {
  const isChargeback = stmt.transactionType === 'Chargeback';
  const amount = Math.abs(Number(stmt.receivedAmount) || 0);
  return {
    ledger_id: policy.id,
    policy_number: policy.policyNumber,
    carrier_name: policy.carrier,
    client_name: policy.clientName,
    statement_date: `${stmt.statementMonth}-01`,
    actual_commission: isChargeback ? -amount : amount,
    discrepancy_type: isChargeback ? 'chargeback' : 'payment',
    resolution_notes: stmt.notes?.trim() || null,
    assigned_to: 'Gretchen',
  };
}
