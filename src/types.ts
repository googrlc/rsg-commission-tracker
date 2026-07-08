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

