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

