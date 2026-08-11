/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Beginner agency-bill desk — prepare only; remittance release is approver-gated.
 */

import React, { useEffect, useState } from 'react';
import * as coord from '../../data/coordinatorRepository';
import * as finance from '../../data/financeApi';
import { OverridingRuleBanner, TermTip } from './shared';

export default function AgencyBillDesk({
  email, canApprove,
}: {
  email: string | null;
  canApprove: boolean;
}) {
  const [invoices, setInvoices] = useState<coord.AgencyBillInvoice[]>([]);
  const [remittances, setRemittances] = useState<coord.AgencyBillRemittance[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    insured_name: '',
    policy_number: '',
    carrier_name: '',
    invoice_number: '',
    gross_premium: '',
    commission: '',
    amount_due_to_carrier: '',
    total_client_invoice: '',
    client_due_date: '',
    carrier_due_date: '',
  });
  const [receipt, setReceipt] = useState({
    invoice_id: '',
    payment_date: '',
    amount: '',
    payment_method: '',
    check_or_ach_ref: '',
    bank_deposit_ref: '',
    cleared: false,
  });
  const [remitForm, setRemitForm] = useState({
    carrier_name: '',
    statement_period: '',
    policies_included: '',
    gross_collected: '',
    credits_return_premiums: '',
    commission_retained: '',
    net_amount_due: '',
    carrier_due_date: '',
  });

  const load = async () => {
    try {
      setInvoices(await coord.listAgencyBillInvoices());
      setRemittances(await coord.listRemittances());
      setMessage(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Load failed — apply db/coordinator_portal.sql if tables are missing');
    }
  };
  useEffect(() => { void load(); }, []);

  const createInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    try {
      await coord.createAgencyBillInvoice({
        insured_name: form.insured_name.trim(),
        policy_number: form.policy_number.trim(),
        carrier_name: form.carrier_name.trim(),
        mga_name: null,
        invoice_number: form.invoice_number || null,
        effective_date: null,
        gross_premium: form.gross_premium ? Number(form.gross_premium) : null,
        taxes: null,
        carrier_fees: null,
        agency_fees: null,
        commission: form.commission ? Number(form.commission) : null,
        total_client_invoice: form.total_client_invoice ? Number(form.total_client_invoice) : null,
        client_due_date: form.client_due_date || null,
        carrier_due_date: form.carrier_due_date || null,
        amount_due_to_carrier: form.amount_due_to_carrier ? Number(form.amount_due_to_carrier) : null,
        verification_notes: null,
        prepared_by: email,
      });
      setForm({
        insured_name: '', policy_number: '', carrier_name: '', invoice_number: '',
        gross_premium: '', commission: '', amount_due_to_carrier: '', total_client_invoice: '',
        client_due_date: '', carrier_due_date: '',
      });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Create failed');
    }
  };

  const addReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !receipt.invoice_id) return;
    try {
      await coord.createReceipt({
        invoice_id: receipt.invoice_id,
        payment_date: receipt.payment_date,
        amount: Number(receipt.amount),
        payment_method: receipt.payment_method || null,
        check_or_ach_ref: receipt.check_or_ach_ref || null,
        bank_deposit_ref: receipt.bank_deposit_ref || null,
        cleared: receipt.cleared,
        unapplied: !receipt.cleared,
        notes: receipt.cleared ? null : 'Marked uncleared / unapplied until deposit confirmed',
        recorded_by: email,
      });
      if (receipt.cleared) {
        await coord.updateAgencyBillInvoice(receipt.invoice_id, { payment_status: 'client_paid' });
      }
      setReceipt({
        invoice_id: '', payment_date: '', amount: '', payment_method: '',
        check_or_ach_ref: '', bank_deposit_ref: '', cleared: false,
      });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Receipt failed');
    }
  };

  const createRemit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    try {
      const row = await coord.createRemittance({
        carrier_name: remitForm.carrier_name.trim(),
        statement_period: remitForm.statement_period || null,
        policies_included: remitForm.policies_included || null,
        gross_collected: remitForm.gross_collected ? Number(remitForm.gross_collected) : null,
        credits_return_premiums: remitForm.credits_return_premiums ? Number(remitForm.credits_return_premiums) : null,
        commission_retained: remitForm.commission_retained ? Number(remitForm.commission_retained) : null,
        net_amount_due: remitForm.net_amount_due ? Number(remitForm.net_amount_due) : null,
        carrier_due_date: remitForm.carrier_due_date || null,
        prepared_by: email,
        supporting_notes: 'Three-way match prepared — awaiting manager approval before any payment release.',
      });
      await finance.submitRemittance(row.id, email);
      setRemitForm({
        carrier_name: '', statement_period: '', policies_included: '',
        gross_collected: '', credits_return_premiums: '', commission_retained: '',
        net_amount_due: '', carrier_due_date: '',
      });
      await load();
      setMessage('Remittance submitted for manager approval. You did not release payment.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Remittance failed');
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <OverridingRuleBanner />
      <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
        <p className="font-bold">
          <TermTip glossaryId="agency-bill">Agency bill</TermTip>
          {' '}money is mostly the customer’s premium owed to the carrier.
        </p>
        <p className="mt-1">Only approved agency earnings are ours. You prepare; you do not send the carrier payment.</p>
        <p className="text-xs mt-2 text-sky-900/80">
          Three-way match: client invoice &amp; payment · carrier/MGA account current · bank deposit &amp; proposed remittance.
          Unexplained remainder → exception / escalate.
        </p>
      </div>
      {message && <p className="text-sm text-slate-800 bg-slate-50 border rounded-md p-3">{message}</p>}

      <section className="space-y-3">
        <h3 className="font-bold">1. Create agency-bill record</h3>
        <form onSubmit={createInvoice} className="grid sm:grid-cols-2 gap-2 border rounded-lg p-3 bg-white">
          {([
            ['insured_name', 'Insured'],
            ['policy_number', 'Policy number'],
            ['carrier_name', 'Carrier / MGA'],
            ['invoice_number', 'Invoice number'],
            ['gross_premium', 'Gross premium'],
            ['commission', 'Commission'],
            ['total_client_invoice', 'Total client invoice'],
            ['amount_due_to_carrier', 'Amount due to carrier'],
            ['client_due_date', 'Client due date'],
            ['carrier_due_date', 'Carrier due date'],
          ] as const).map(([key, label]) => (
            <label key={key} className="text-xs font-medium">{label}
              <input
                type={key.includes('date') ? 'date' : 'text'}
                className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                required={['insured_name', 'policy_number', 'carrier_name'].includes(key)}
              />
            </label>
          ))}
          <div className="sm:col-span-2">
            <button type="submit" className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-900 text-white">Save invoice record</button>
          </div>
        </form>
        <ul className="text-sm space-y-1">
          {invoices.map((inv) => (
            <li key={inv.id} className="border rounded-md px-3 py-2 flex flex-wrap justify-between gap-2">
              <span>{inv.insured_name} · {inv.policy_number} · {inv.carrier_name}</span>
              <span className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded">{inv.payment_status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h3 className="font-bold">3. Record customer payment</h3>
        <p className="text-xs text-slate-600">Do not mark paid merely because the customer said payment was sent. Confirm the deposit cleared.</p>
        <form onSubmit={addReceipt} className="grid sm:grid-cols-2 gap-2 border rounded-lg p-3 bg-white">
          <label className="sm:col-span-2 text-xs font-medium">Invoice
            <select className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={receipt.invoice_id}
              onChange={(e) => setReceipt({ ...receipt, invoice_id: e.target.value })} required>
              <option value="">Select…</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>{inv.insured_name} — {inv.policy_number}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium">Payment date
            <input type="date" className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={receipt.payment_date}
              onChange={(e) => setReceipt({ ...receipt, payment_date: e.target.value })} required />
          </label>
          <label className="text-xs font-medium">Amount
            <input className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={receipt.amount}
              onChange={(e) => setReceipt({ ...receipt, amount: e.target.value })} required />
          </label>
          <label className="text-xs font-medium">Method
            <input className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={receipt.payment_method}
              onChange={(e) => setReceipt({ ...receipt, payment_method: e.target.value })} />
          </label>
          <label className="text-xs font-medium">Check / ACH ref
            <input className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={receipt.check_or_ach_ref}
              onChange={(e) => setReceipt({ ...receipt, check_or_ach_ref: e.target.value })} />
          </label>
          <label className="text-xs font-medium">Bank deposit ref
            <input className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={receipt.bank_deposit_ref}
              onChange={(e) => setReceipt({ ...receipt, bank_deposit_ref: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 text-xs sm:col-span-2">
            <input type="checkbox" checked={receipt.cleared} onChange={(e) => setReceipt({ ...receipt, cleared: e.target.checked })} />
            Deposit cleared in the approved premium account
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-900 text-white">Record payment</button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h3 className="font-bold">6. Prepare carrier remittance (do not pay)</h3>
        <form onSubmit={createRemit} className="grid sm:grid-cols-2 gap-2 border rounded-lg p-3 bg-white">
          {([
            ['carrier_name', 'Carrier'],
            ['statement_period', 'Statement period'],
            ['policies_included', 'Policies included'],
            ['gross_collected', 'Gross collected'],
            ['credits_return_premiums', 'Credits / return premiums'],
            ['commission_retained', 'Commission retained'],
            ['net_amount_due', 'Net amount due'],
            ['carrier_due_date', 'Carrier due date'],
          ] as const).map(([key, label]) => (
            <label key={key} className="text-xs font-medium">{label}
              <input
                type={key.includes('date') ? 'date' : 'text'}
                className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                value={remitForm[key]}
                onChange={(e) => setRemitForm({ ...remitForm, [key]: e.target.value })}
                required={key === 'carrier_name' || key === 'net_amount_due'}
              />
            </label>
          ))}
          <div className="sm:col-span-2">
            <button type="submit" className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-700 text-white">
              Submit remittance for manager approval
            </button>
          </div>
        </form>
        <ul className="space-y-2 text-sm">
          {remittances.map((r) => (
            <li key={r.id} className="border rounded-md p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{r.carrier_name} · net {r.net_amount_due ?? '—'}</div>
                <div className="text-xs text-slate-500">Status: {r.status} · prepared by {r.prepared_by ?? '—'}</div>
              </div>
              {canApprove && r.status === 'pending_approval' && email && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded bg-emerald-600 text-white"
                    onClick={() => void finance.approveRemittance(r.id, email).then(load).catch((err) => setMessage(String(err)))}
                  >
                    Approve remittance
                  </button>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded bg-slate-800 text-white"
                    onClick={() => {
                      const conf = window.prompt('Confirmation number after payment released outside the app:');
                      if (conf != null) void finance.markRemittancePaid(r.id, email, conf).then(load);
                    }}
                  >
                    Mark paid
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
        <div className="font-bold">Return premium / refunds</div>
        <p className="mt-1">
          Obtain the carrier document, confirm amounts, check who owes whom, prepare the refund record,
          and obtain management approval. You must not calculate or issue a customer refund without approval.
        </p>
      </section>
    </div>
  );
}
