/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Async data access for the Commission Tracker. Replaces the old localStorage
 * layer. All reads/writes go through Supabase and are gated by RLS (allowlisted
 * authenticated users only). Rules are read by everyone allowlisted and written
 * only by admins (enforced in the DB, surfaced as friendly errors here).
 */

import type { CarrierRule, WonPolicy, ReconciliationStatement } from '../types';
import { supabase } from '../lib/supabase';
import {
  ruleRowToRules,
  parseRuleId,
  ruleToInsertRow,
  ledgerRowToPolicy,
  policyToLedgerRow,
  reconRowToStatement,
  statementToReconRow,
  type RuleRow,
  type LedgerRow,
  type ReconRow,
} from './mappers';

const RULE_COLS =
  'id, lob, carrier_name, commission_method, nb_percent, renewal_percent, flat_fee, commission_basis, mga_name, state, notes, lookup_priority';
const LEDGER_COLS =
  'id, policy_number, nowcerts_policy_id, carrier_name, lob, client_name, statement_date, policy_effective_date, is_renewal, gross_premium, ee_count, expected_commission, commission_rule_id, commission_basis, reconciliation_status, statement_source, notes, payroll_amount, admin_fee_amount, monthly_premium_amount, payment_timing';
const RECON_COLS =
  'id, ledger_id, policy_number, carrier_name, client_name, statement_date, actual_commission, discrepancy_type, resolution_notes';

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

// --- Bulk load -------------------------------------------------------------

export interface AllData {
  rules: CarrierRule[];
  policies: WonPolicy[];
  reconciliations: ReconciliationStatement[];
}

export async function fetchAllData(): Promise<AllData> {
  const [rulesRes, ledgerRes, reconRes] = await Promise.all([
    supabase
      .from('commission_rules')
      .select(RULE_COLS)
      .eq('active', true)
      .order('lookup_priority', { ascending: true, nullsFirst: false })
      .order('carrier_name', { ascending: true }),
    supabase
      .from('commission_ledger')
      .select(LEDGER_COLS)
      .order('statement_date', { ascending: false }),
    supabase
      .from('commission_reconciliation')
      .select(RECON_COLS)
      .order('statement_date', { ascending: false }),
  ]);

  if (rulesRes.error) fail('Load rules', rulesRes.error);
  if (ledgerRes.error) fail('Load policies', ledgerRes.error);
  if (reconRes.error) fail('Load reconciliations', reconRes.error);

  return {
    rules: (rulesRes.data as RuleRow[]).flatMap(ruleRowToRules),
    policies: (ledgerRes.data as LedgerRow[]).map(ledgerRowToPolicy),
    reconciliations: (reconRes.data as ReconRow[]).map(reconRowToStatement),
  };
}

// --- Rules (admin writes) --------------------------------------------------

export async function createRule(rule: CarrierRule): Promise<CarrierRule> {
  const { data, error } = await supabase
    .from('commission_rules')
    .insert(ruleToInsertRow(rule))
    .select(RULE_COLS)
    .single();
  if (error) fail('Add rule', error);
  return ruleRowToRules(data as RuleRow)[0];
}

export async function createRulesBulk(rules: CarrierRule[]): Promise<CarrierRule[]> {
  if (rules.length === 0) return [];
  const { data, error } = await supabase
    .from('commission_rules')
    .insert(rules.map(ruleToInsertRow))
    .select(RULE_COLS);
  if (error) fail('Bulk import rules', error);
  return (data as RuleRow[]).flatMap(ruleRowToRules);
}

export async function deleteRule(appId: string): Promise<void> {
  const parsed = parseRuleId(appId);
  if (!parsed) {
    const { error } = await supabase.from('commission_rules').delete().eq('id', appId);
    if (error) fail('Delete rule', error);
    return;
  }
  const { dbId, field } = parsed;
  const other = field === 'nb_percent' ? 'renewal_percent' : 'nb_percent';
  const { data, error } = await supabase
    .from('commission_rules')
    .select(`${other}`)
    .eq('id', dbId)
    .single();
  if (error) fail('Delete rule', error);
  const otherStillSet = (data as Record<string, number | null>)?.[other] != null;
  if (otherStillSet) {
    const { error: upErr } = await supabase
      .from('commission_rules')
      .update({ [field]: null })
      .eq('id', dbId);
    if (upErr) fail('Delete rule', upErr);
  } else {
    const { error: delErr } = await supabase
      .from('commission_rules')
      .delete()
      .eq('id', dbId);
    if (delErr) fail('Delete rule', delErr);
  }
}

// --- Policies (ledger) -----------------------------------------------------

export async function createPolicy(
  policy: WonPolicy,
  expectedCommission: number,
): Promise<WonPolicy> {
  const { data, error } = await supabase
    .from('commission_ledger')
    .insert(policyToLedgerRow(policy, expectedCommission))
    .select(LEDGER_COLS)
    .single();
  if (error) fail('Add policy', error);
  return ledgerRowToPolicy(data as LedgerRow);
}

export async function deletePolicy(id: string): Promise<void> {
  // Remove dependent reconciliation lines first, then the ledger row.
  const { error: reconErr } = await supabase
    .from('commission_reconciliation')
    .delete()
    .eq('ledger_id', id);
  if (reconErr) fail('Delete policy (reconciliations)', reconErr);
  const { error } = await supabase.from('commission_ledger').delete().eq('id', id);
  if (error) fail('Delete policy', error);
}

// --- Reconciliation lines --------------------------------------------------

export async function createReconciliation(
  stmt: ReconciliationStatement,
  policy: WonPolicy,
): Promise<ReconciliationStatement> {
  const { data, error } = await supabase
    .from('commission_reconciliation')
    .insert(statementToReconRow(stmt, policy))
    .select(RECON_COLS)
    .single();
  if (error) fail('Add reconciliation', error);
  return reconRowToStatement(data as ReconRow);
}

export async function createReconciliationsBulk(
  items: Array<{ stmt: ReconciliationStatement; policy: WonPolicy }>,
): Promise<ReconciliationStatement[]> {
  if (items.length === 0) return [];
  const { data, error } = await supabase
    .from('commission_reconciliation')
    .insert(items.map(({ stmt, policy }) => statementToReconRow(stmt, policy)))
    .select(RECON_COLS);
  if (error) fail('Commit reconciliations', error);
  return (data as ReconRow[]).map(reconRowToStatement);
}

export async function deleteReconciliation(id: string): Promise<void> {
  const { error } = await supabase
    .from('commission_reconciliation')
    .delete()
    .eq('id', id);
  if (error) fail('Delete reconciliation', error);
}
