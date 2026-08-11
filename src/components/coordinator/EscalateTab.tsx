/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ESCALATE_REASONS } from '../../content/commissionGlossary';
import * as coord from '../../data/coordinatorRepository';
import { OverridingRuleBanner } from './shared';

export default function EscalateTab({ email }: { email: string | null }) {
  const [reason, setReason] = useState(ESCALATE_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [carrier, setCarrier] = useState('');
  const [period, setPeriod] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<coord.Escalation[]>([]);

  const load = async () => {
    try { setOpen(await coord.listEscalations('open')); } catch { /* table may not exist yet */ }
  };
  useEffect(() => { void load(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setMessage('Sign in with your own account first.');
      return;
    }
    try {
      await coord.createEscalation({
        reason_code: reason.code,
        reason_label: reason.label,
        detail: detail.trim() || undefined,
        carrier_name: carrier.trim() || undefined,
        statement_period: period.trim() || undefined,
        amount: amount ? Number(amount) : undefined,
        created_by: email,
        owner: 'manager',
      });
      setDetail('');
      setCarrier('');
      setPeriod('');
      setAmount('');
      setMessage('Escalation sent. Stop work on this item until your manager responds.');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not create escalation');
    }
  };

  return (
    <div className="max-w-xl space-y-4">
      <OverridingRuleBanner />
      <div>
        <h2 className="text-lg font-bold">Stop and escalate</h2>
        <p className="text-sm text-slate-600">
          Use this when the SOP says stop. Do not keep processing. Pick the closest reason and add what you saw.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
        <div className="flex flex-wrap gap-1.5">
          {ESCALATE_REASONS.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => setReason(r)}
              className={`text-[11px] px-2 py-1 rounded-md border ${
                reason.code === r.code ? 'bg-amber-800 text-white border-amber-800' : 'bg-white border-amber-200 text-amber-950'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <label className="block text-xs font-medium">What did you see?
          <textarea className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} required />
        </label>
        <div className="grid sm:grid-cols-3 gap-2">
          <label className="text-xs font-medium">Carrier
            <input className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
          </label>
          <label className="text-xs font-medium">Period
            <input className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </label>
          <label className="text-xs font-medium">Amount (if any)
            <input className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
        </div>
        <button type="submit" className="px-3 py-1.5 bg-amber-800 text-white text-xs font-bold rounded-lg">Send escalation</button>
        {message && <p className="text-sm text-amber-950">{message}</p>}
      </form>

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-2">Open escalations</h3>
        {open.length === 0 && <p className="text-sm text-slate-500">None open.</p>}
        <ul className="space-y-2">
          {open.map((e) => (
            <li key={e.id} className="border border-slate-200 rounded-md p-3 text-sm">
              <div className="font-medium">{e.reason_label}</div>
              <div className="text-xs text-slate-500">{e.carrier_name} · {e.statement_period} · by {e.created_by}</div>
              <p className="text-slate-700 mt-1">{e.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
