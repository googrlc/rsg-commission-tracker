/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Supabase data access for the Coordinator portal (Control Log, escalations,
 * agency-bill prep). Money approval still goes through financeApi.
 */

import { supabase } from '../lib/supabase';

function fail(context: string, error: { message: string }): never {
  throw new Error(`${context}: ${error.message}`);
}

export type ControlEntry = {
  id: string;
  carrier_name: string;
  mga_name: string | null;
  producer_code: string | null;
  portal_url: string | null;
  billing_mode: 'direct_bill' | 'agency_bill';
  payment_model: 'advance' | 'as_earned' | 'hybrid' | 'unknown';
  statement_period: string;
  expected_statement_date: string | null;
  statement_date: string | null;
  payment_date: string | null;
  statement_number: string | null;
  status: string;
  row_count: number | null;
  gross_premium: number | null;
  total_positive_commission: number | null;
  total_chargebacks: number | null;
  net_commission: number | null;
  payment_reference: string | null;
  original_filename: string | null;
  retrieval_date: string | null;
  carrier_stated_total: number | null;
  parsed_total: number | null;
  total_difference: number | null;
  difference_severity: string | null;
  batch_id: string | null;
  archive_path: string | null;
  notes: string | null;
  next_action: string | null;
  prepared_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Escalation = {
  id: string;
  reason_code: string;
  reason_label: string;
  detail: string | null;
  carrier_name: string | null;
  statement_period: string | null;
  batch_id: string | null;
  control_entry_id: string | null;
  amount: number | null;
  status: string;
  created_by: string;
  owner: string | null;
  follow_up_date: string | null;
  created_at: string;
};

export type AgencyBillInvoice = {
  id: string;
  insured_name: string;
  policy_number: string;
  carrier_name: string;
  mga_name: string | null;
  invoice_number: string | null;
  effective_date: string | null;
  gross_premium: number | null;
  taxes: number | null;
  carrier_fees: number | null;
  agency_fees: number | null;
  commission: number | null;
  total_client_invoice: number | null;
  client_due_date: string | null;
  carrier_due_date: string | null;
  amount_due_to_carrier: number | null;
  payment_status: string;
  verified_ok: boolean;
  verification_notes: string | null;
  prepared_by: string | null;
  created_at: string;
};

export type AgencyBillReceipt = {
  id: string;
  invoice_id: string;
  payment_date: string;
  amount: number;
  payment_method: string | null;
  check_or_ach_ref: string | null;
  bank_deposit_ref: string | null;
  cleared: boolean;
  unapplied: boolean;
  notes: string | null;
  recorded_by: string | null;
};

export type AgencyBillRemittance = {
  id: string;
  carrier_name: string;
  statement_period: string | null;
  policies_included: string | null;
  gross_collected: number | null;
  credits_return_premiums: number | null;
  commission_retained: number | null;
  net_amount_due: number | null;
  carrier_due_date: string | null;
  proposed_payment_ref: string | null;
  status: string;
  prepared_by: string | null;
  approved_by: string | null;
  confirmation_number: string | null;
  supporting_notes: string | null;
  created_at: string;
};

export async function listControlEntries(): Promise<ControlEntry[]> {
  const { data, error } = await supabase
    .from('carrier_control_entries')
    .select('*')
    .order('expected_statement_date', { ascending: true, nullsFirst: false });
  if (error) fail('Load control log', error);
  return (data ?? []) as ControlEntry[];
}

export async function upsertControlEntry(
  entry: Partial<ControlEntry> & { carrier_name: string; statement_period: string },
): Promise<ControlEntry> {
  const now = new Date().toISOString();
  if (entry.id) {
    const { data, error } = await supabase
      .from('carrier_control_entries')
      .update({ ...entry, updated_at: now })
      .eq('id', entry.id)
      .select('*')
      .single();
    if (error) fail('Update control entry', error);
    return data as ControlEntry;
  }
  const { data, error } = await supabase
    .from('carrier_control_entries')
    .insert({ ...entry, updated_at: now })
    .select('*')
    .single();
  if (error) fail('Create control entry', error);
  return data as ControlEntry;
}

export async function listEscalations(status: string = 'open'): Promise<Escalation[]> {
  let q = supabase.from('commission_escalations').select('*').order('created_at', { ascending: false });
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) fail('Load escalations', error);
  return (data ?? []) as Escalation[];
}

export async function createEscalation(payload: {
  reason_code: string;
  reason_label: string;
  detail?: string;
  carrier_name?: string;
  statement_period?: string;
  batch_id?: string;
  control_entry_id?: string;
  amount?: number;
  created_by: string;
  owner?: string;
  follow_up_date?: string;
}): Promise<Escalation> {
  const { data, error } = await supabase
    .from('commission_escalations')
    .insert({ ...payload, status: 'open' })
    .select('*')
    .single();
  if (error) fail('Create escalation', error);
  return data as Escalation;
}

export async function updateEscalationStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase
    .from('commission_escalations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) fail('Update escalation', error);
}

export async function listAgencyBillInvoices(): Promise<AgencyBillInvoice[]> {
  const { data, error } = await supabase
    .from('agency_bill_invoices')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) fail('Load agency-bill invoices', error);
  return (data ?? []) as AgencyBillInvoice[];
}

export async function createAgencyBillInvoice(
  payload: Omit<AgencyBillInvoice, 'id' | 'created_at' | 'verified_ok' | 'payment_status'> & {
    payment_status?: string;
    verified_ok?: boolean;
  },
): Promise<AgencyBillInvoice> {
  const { data, error } = await supabase
    .from('agency_bill_invoices')
    .insert({
      payment_status: 'open',
      verified_ok: false,
      ...payload,
    })
    .select('*')
    .single();
  if (error) fail('Create agency-bill invoice', error);
  return data as AgencyBillInvoice;
}

export async function updateAgencyBillInvoice(
  id: string,
  patch: Partial<AgencyBillInvoice>,
): Promise<AgencyBillInvoice> {
  const { data, error } = await supabase
    .from('agency_bill_invoices')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) fail('Update agency-bill invoice', error);
  return data as AgencyBillInvoice;
}

export async function listReceipts(invoiceId: string): Promise<AgencyBillReceipt[]> {
  const { data, error } = await supabase
    .from('agency_bill_receipts')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('payment_date', { ascending: false });
  if (error) fail('Load receipts', error);
  return (data ?? []) as AgencyBillReceipt[];
}

export async function createReceipt(
  payload: Omit<AgencyBillReceipt, 'id'>,
): Promise<AgencyBillReceipt> {
  const { data, error } = await supabase
    .from('agency_bill_receipts')
    .insert(payload)
    .select('*')
    .single();
  if (error) fail('Record receipt', error);
  return data as AgencyBillReceipt;
}

export async function listRemittances(): Promise<AgencyBillRemittance[]> {
  const { data, error } = await supabase
    .from('agency_bill_remittances')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) fail('Load remittances', error);
  return (data ?? []) as AgencyBillRemittance[];
}

export async function createRemittance(
  payload: Partial<AgencyBillRemittance> & { carrier_name: string; prepared_by?: string },
): Promise<AgencyBillRemittance> {
  const { data, error } = await supabase
    .from('agency_bill_remittances')
    .insert({ status: 'drafted', ...payload })
    .select('*')
    .single();
  if (error) fail('Create remittance', error);
  return data as AgencyBillRemittance;
}
