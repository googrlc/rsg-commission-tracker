/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CommissionMethod =
  | '% of Premium'
  | '% of Payroll'
  | 'Flat $'
  | 'Per Employee'
  | '% of Monthly Premium'
  | '% of Admin Fee'
  | 'Manual';

export interface CarrierRule {
  id: string;
  carrier: string;
  lineOfBusiness: string;
  newRenewal: 'New' | 'Renewal';
  method: CommissionMethod;
  ratePercentage?: number;        // e.g. 12.0 for 12%
  flatOrPerEmployeeAmount?: number; // e.g. 100 for $100 flat/per-employee
  paymentTiming?: 'As Earned' | 'In Advance'; // How this carrier usually pays
  notes?: string;
}

export interface WonPolicy {
  id: string;
  policyNumber: string;
  dateWon: string;
  policyEffectiveDate?: string;  // Policy effective date (from AMS or manual)
  clientName: string;
  carrier: string;
  lineOfBusiness: string;
  newRenewal: 'New' | 'Renewal';
  premiumAmount?: number;
  payrollAmount?: number;
  numberOfEmployees?: number;
  adminFeeAmount?: number;        // for complex "% of Admin Fee" matching
  monthlyPremiumAmount?: number;  // for complex "% of Monthly Premium" matching
  paymentTiming?: 'As Earned' | 'In Advance'; // Overrides rule timing if provided
  manualExpectedAmount?: number;
  notes?: string;
}

// Result of looking up a rule for a policy
export interface RuleLookupResult {
  ruleFound: boolean;
  method?: CommissionMethod;
  ratePercentage?: number;
  flatOrPerEmployeeAmount?: number;
  paymentTiming?: 'As Earned' | 'In Advance';
  expectedAmount: number;
}

export interface ReconciliationStatement {
  id: string;
  statementMonth: string; // e.g. "2026-06"
  policyId: string;       // References WonPolicy
  receivedAmount: number;
  transactionType?: 'Payment' | 'Chargeback'; // Represents type of transaction
  notes?: string;
}

export interface CarrierSummary {
  carrier: string;
  expected: number;
  received: number;
  short: number;
  chargebacks: number;
}

export interface CarrierSchedule {
  id: string;
  carrier: string;
  closeDay: string; // e.g. "Last day of month"
  payDay: string;   // e.g. "7th workday of month"
  notes?: string;
}

// Book-wide rollup off the statement transaction layer (v_book_summary,
// Commission Reconciliation spec §5). Real actual money from uploaded statements,
// not projected estimates.
export interface BookSummary {
  txnCount: number;
  carrierCount: number;
  policyCount: number;
  netWrittenPremium: number;
  totalCommission: number;
  feeDrag: number;
  netDue: number;
  effectiveCommPct: number;
}

// --- Commission Reconciliation Slices 2–3 (statement transaction layer) --------
// Read-only view rows are typed in DB (snake_case) shape for a thin mapping layer.

export type ReconStatus =
  | 'matched' | 'underpaid' | 'overpaid'
  | 'no_expected' | 'missing_statement' | 'unmatched_statement' | 'rolled_up'
  | 'canceled';

/** v_reconciliation_summary — the §11a health strip. */
export interface ReconSummary {
  pricedMatchedCount: number;
  pricedMatchedActual: number;
  underpaidCount: number;
  underpaidDelta: number;
  overpaidCount: number;
  noExpectedCount: number;
  noExpectedActual: number;
  missingCount: number;
  unmatchedCount: number;
  unmatchedActual: number;
  // Canceled policies (spec §4.3): reconciled to their pro-rated actual, excluded
  // from the shorts queue. churn = expected − actual = commission lost to the cancel.
  canceledCount: number;
  canceledActual: number;
  canceledChurn: number;
}

/** One row of v_reconciliation_exceptions (§11a exception queue). */
export interface ReconException {
  exceptionType: 'ledger_variance' | 'unmatched_statement';
  reconciliationStatus: ReconStatus;
  carrierName: string;
  policyNumber: string | null;
  clientName: string | null;
  lob: string | null;
  expectedCommission: number | null;
  actualCommission: number | null;
  delta: number | null;
  // Term + timing (sourced from NowCerts via commission_ledger; null until backfilled).
  // expirationDate is the ORIGINAL term end — NowCerts does not shorten it on cancel.
  effectiveDate: string | null;
  expirationDate: string | null;
  termMonths: number | null;
  expectedPayMonth: number | null; // YYYYMM
  payBasis: string | null;         // human-readable, derived from carrier payment_model
  // Mid-term cancel identity: AMS cancellation_date when synced, else first
  // statement cancel/chargeback date. isMidTermCancel = cancel before term end.
  cancelDate: string | null;
  isMidTermCancel: boolean;
  // Commission typing: the term (New/Renewal) + a breakdown of the policy's line
  // types so New vs Renewal vs Endorsement vs Cancel is visible on the recon sheet.
  termType: 'New' | 'Renewal' | null;
  newCount: number;
  renewalCount: number;
  endorsementCount: number;
  cancelCount: number;
}

/** One commission_transactions row (policy detail slide-over). */
export interface CommissionTxn {
  id: string;
  transactionCode: string | null;
  transactionType: string | null;
  transactionDate: string | null;
  lob: string | null;
  grossPremium: number | null;
  commissionRate: number | null;
  commissionAmount: number | null;
  feeType: string | null;
  feeAmount: number | null;
}

/** One row of v_loss_on_cancel (§11a churn panel). */
export interface LossOnCancel {
  carrierName: string;
  paymentModel: string | null;
  policyNumber: string | null;
  insuredName: string | null;
  clientName: string | null;
  lob: string | null;
  transactionDate: string | null;
  realizedClawback: number;
  lossAmount: number | null;
  lossBasis: string;
}

/** Dashboard view rows (§11b) — snake_case matches the DB views. */
export interface CommByLineRow { lob: string | null; txn_count: number; policy_count: number; net_written_premium: number; total_commission: number; effective_comm_pct: number; min_rate: number | null; max_rate: number | null; }
export interface CommByCarrierRow { carrier_name: string; txn_count: number; policy_count: number; net_written_premium: number; total_commission: number; fee_drag: number; effective_comm_pct: number; min_rate: number | null; max_rate: number | null; }
export interface NbVsRenewalRow { business_type: string; term_count: number; written_premium: number; avg_premium: number; total_commission: number; effective_comm_pct: number; }
export interface SegmentRow { segment: string | null; term_count: number; avg_premium: number; written_premium: number; }
export interface MonthlyTrendRow { month_key: number; txn_count: number; net_premium: number; commission: number; fees: number; }
export interface FeeDragRow { carrier_name: string; fee_type: string; fee_count: number; fee_total: number; }

/** v_commission_by_carrier_month — per-carrier, per-month rollup for the month-end
 * QuickBooks page. month_key is the statement activity month (YYYYMM). */
export interface CarrierMonthRow {
  month_key: number;
  carrier_name: string;
  txn_count: number;
  policy_count: number;
  premium: number;
  commission: number;
  fees: number;
  net_due: number;
  new_count: number;
  renewal_count: number;
  endorsement_count: number;
  cancel_count: number;
}

/** carrier_payment_schedule — drives the year payment calendar page. */
export interface CarrierPaymentSchedule {
  id: string;
  carrierName: string;
  kind: 'day_of_month' | 'explicit';
  payDay: number | null;
  closeDay: number | null;
  dayBasis: 'calendar' | 'business';   // business = Nth working day (Mon–Fri)
  weekendRule: 'none' | 'prev' | 'next';
  explicit: Array<{ month: number; close: string | null; pay: string }> | null;
  scheduleYear: number | null;
  color: string;
  notes: string | null;
}

/** carrier_commission_profile (§11d). */
export interface CarrierProfile {
  id: string;
  carrierName: string;
  paymentModel: 'as_earned' | 'advance' | 'hybrid' | 'confirm_on_upload';
  defaultNbPercent: number | null;
  defaultRenewalPercent: number | null;
  clawbackWindowMonths: number | null;
  statementFormat: string | null;
  statementParserKey: string | null;
  notes: string | null;
}

/** carrier_alias_map (§11d). */
export interface CarrierAlias {
  id: string;
  rawName: string;
  canonicalCarrier: string;
}

/** Coverage indicator row (v_rule_coverage, §11c). */
export interface RuleCoverage {
  carrier: string;
  ledgerPolicies: number;
  unpriced: number;
  priced: number;
}

/** commission_rules row with §10 provenance (Rates tab table). */
export interface RuleWithProvenance {
  id: string;
  carrierName: string;
  mgaName: string | null;
  lob: string | null;
  state: string | null;
  nbPercent: number | null;
  renewalPercent: number | null;
  commissionMethod: string | null;
  sourceType: string | null;
  confidence: string | null;
  lastConfirmedDate: string | null;
  observedDate: string | null;
  supersededBy: string | null;
  active: boolean;
}

/** carrier_rate_intake row (§10 review queue). */
export interface RateIntake {
  id: string;
  carrierName: string;
  canonicalCarrier: string | null;
  lob: string | null;
  state: string | null;
  mgaName: string | null;
  proposedNbPercent: number | null;
  proposedRenewalPercent: number | null;
  flatFee: number | null;
  commissionMethod: string | null;
  sourceType: string;
  sourceDocument: string | null;
  observedDate: string | null;
  confidence: string;
  status: 'pending' | 'approved' | 'rejected';
  conflictRuleId: string | null;
}

// A flagged discrepancy from the Hermes reconciliation ingest (Phase 3).
// Maps to Supabase commission_reconciliation rows that are open and represent
// an actual variance (short / overpaid / unmatched statement line).
export interface ReconciliationDiscrepancy {
  id: string;
  policyNumber: string;
  carrierName: string;
  clientName: string;
  statementDate: string;
  expectedCommission?: number;
  actualCommission?: number;
  delta?: number;
  deltaPercent?: number;
  discrepancyType: string; // 'short' | 'overpaid' | 'unmatched_statement_line'
  priority: string;        // 'high' | 'medium' | 'low'
  status: string;          // 'open' | 'resolved'
  assignedTo?: string;
  resolutionNotes?: string;
  amountRecovered?: number;
}

