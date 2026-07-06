/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CarrierRule, WonPolicy, ReconciliationStatement, RuleLookupResult, CarrierSummary } from './types';

// NOTE: Seed / demo data (INITIAL_RULES / INITIAL_POLICIES / INITIAL_RECONCILIATION /
// INITIAL_S_SCHEDULES) was removed when the app moved to Supabase. Rules,
// policies, and reconciliations now load live from the database (see
// src/data/repository.ts). Carrier pay-day schedules remain in localStorage and
// start empty.

// Formatting Utilities
export const formatCurrency = (val: number | undefined | null): string => {
  if (val === undefined || val === null || isNaN(val)) return '-';
  const prefix = val < 0 ? '-' : '';
  const absVal = Math.abs(val);
  return prefix + new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(absVal);
};

export const formatCurrencyDecimal = (val: number | undefined | null): string => {
  if (val === undefined || val === null || isNaN(val)) return '-';
  const prefix = val < 0 ? '-' : '';
  const absVal = Math.abs(val);
  return prefix + new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(absVal);
};

export const formatPercentage = (val: number | undefined | null): string => {
  if (val === undefined || val === null || isNaN(val)) return '-';
  return `${val.toFixed(1)}%`;
};

// Main Rule Lookup and Calculation Logic with complex types matched
export function lookupAndCalculate(
  policy: WonPolicy,
  rules: CarrierRule[]
): RuleLookupResult {
  // Try exact match matching Carrier, Line of Business, and New/Renewal (case-insensitive trim)
  const matchedRule = rules.find(
    (r) =>
      r.carrier.trim().toLowerCase() === policy.carrier.trim().toLowerCase() &&
      r.lineOfBusiness.trim().toLowerCase() === policy.lineOfBusiness.trim().toLowerCase() &&
      r.newRenewal === policy.newRenewal
  );

  // Default timing fallback: use policy field, then rule field, else default to 'As Earned'
  const finalTiming = policy.paymentTiming || (matchedRule ? matchedRule.paymentTiming : undefined) || 'As Earned';

  if (!matchedRule) {
    return {
      ruleFound: false,
      paymentTiming: finalTiming,
      expectedAmount: policy.manualExpectedAmount || 0
    };
  }

  let expectedAmount = 0;
  const method = matchedRule.method;
  const ratePercentage = matchedRule.ratePercentage || 0;
  const flatOrPerEmployeeAmount = matchedRule.flatOrPerEmployeeAmount || 0;

  switch (method) {
    case '% of Premium': {
      const premium = policy.premiumAmount || 0;
      expectedAmount = (premium * ratePercentage) / 100;
      break;
    }
    case '% of Payroll': {
      const payroll = policy.payrollAmount || 0;
      expectedAmount = (payroll * ratePercentage) / 100;
      break;
    }
    case 'Flat $': {
      expectedAmount = flatOrPerEmployeeAmount;
      break;
    }
    case 'Per Employee': {
      const emps = policy.numberOfEmployees || 0;
      expectedAmount = flatOrPerEmployeeAmount * emps;
      break;
    }
    case '% of Monthly Premium': {
      const monthlyPremium = policy.monthlyPremiumAmount || (policy.premiumAmount ? policy.premiumAmount / 12 : 0);
      expectedAmount = (monthlyPremium * ratePercentage) / 100;
      break;
    }
    case '% of Admin Fee': {
      const adminFee = policy.adminFeeAmount || 0;
      expectedAmount = (adminFee * ratePercentage) / 100;
      break;
    }
    case 'Manual': {
      expectedAmount = policy.manualExpectedAmount || 0;
      break;
    }
    default:
      expectedAmount = 0;
  }

  return {
    ruleFound: true,
    method,
    ratePercentage: matchedRule.ratePercentage,
    flatOrPerEmployeeAmount: matchedRule.flatOrPerEmployeeAmount,
    paymentTiming: finalTiming,
    expectedAmount
  };
}

// Calculate Carrier Summary for QuickBooks (Expected, Received, Short, Chargebacks per carrier)
export function calculateCarrierSummaries(
  policies: WonPolicy[],
  statements: ReconciliationStatement[],
  rules: CarrierRule[]
): CarrierSummary[] {
  const summariesMap = new Map<string, { expected: number; received: number; chargebacks: number }>();

  // Gather Expected from all won policies
  policies.forEach((policy) => {
    const { expectedAmount } = lookupAndCalculate(policy, rules);
    const key = policy.carrier.trim();
    if (!key) return;

    const current = summariesMap.get(key) || { expected: 0, received: 0, chargebacks: 0 };
    summariesMap.set(key, { ...current, expected: current.expected + expectedAmount });
  });

  // Gather Received and Chargebacks from reconciliation statements
  statements.forEach((stmt) => {
    const matchingPolicy = policies.find((p) => p.id === stmt.policyId);
    if (!matchingPolicy) return;

    const key = matchingPolicy.carrier.trim();
    if (!key) return;

    const current = summariesMap.get(key) || { expected: 0, received: 0, chargebacks: 0 };
    const amt = stmt.receivedAmount || 0;

    if (stmt.transactionType === 'Chargeback') {
      // Chargeback reduces active cash received on the ledger, and is accumulated in chargebacks separately
      current.received = current.received - amt;
      current.chargebacks = current.chargebacks + amt;
    } else {
      current.received = current.received + amt;
    }

    summariesMap.set(key, current);
  });

  // Convert to array and compute shortages
  const result: CarrierSummary[] = [];
  summariesMap.forEach((val, carrier) => {
    // Variance could be short
    const short = Math.max(0, val.expected - val.received);
    result.push({
      carrier,
      expected: val.expected,
      received: val.received,
      short,
      chargebacks: val.chargebacks
    });
  });

  return result.sort((a, b) => b.short - a.short || a.carrier.localeCompare(b.carrier));
}

// LocalStorage helpers (still used for carrier pay-day schedules)
export function getStoredData<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`Failed to read key "${key}" from localStorage:`, e);
    return defaultValue;
  }
}

export function setStoredData<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to write key "${key}" to localStorage:`, e);
  }
}
