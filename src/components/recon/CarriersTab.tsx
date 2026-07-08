/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * §11d Carriers tab — carrier_commission_profile management (payment model +
 * default rates + clawback window, editable) and the carrier_alias_map view
 * (raw → canonical, the collapses that fix name-variant NULL-expected rows).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Check, X, Pencil, AlertTriangle } from 'lucide-react';
import type { CarrierProfile, CarrierAlias } from '../../types';
import * as recon from '../../data/reconRepository';
import { Card, Spinner, ErrorNote } from './shared';

const MODELS = ['as_earned', 'advance', 'hybrid', 'confirm_on_upload'] as const;
const modelTone: Record<string, string> = {
  advance: 'bg-blue-50 text-blue-700 border-blue-200',
  as_earned: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  hybrid: 'bg-violet-50 text-violet-700 border-violet-200',
  confirm_on_upload: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function CarriersTab() {
  const [profiles, setProfiles] = useState<CarrierProfile[]>([]);
  const [aliases, setAliases] = useState<CarrierAlias[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<{ model: string; nb: string; ren: string; claw: string }>({ model: '', nb: '', ren: '', claw: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [p, a] = await Promise.all([recon.fetchCarrierProfiles(), recon.fetchAliasMap()]);
      setProfiles(p); setAliases(a);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load carriers.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const pending = useMemo(() => profiles.filter((p) => p.paymentModel === 'confirm_on_upload'), [profiles]);

  const startEdit = (p: CarrierProfile) => {
    setEditing(p.id);
    setForm({ model: p.paymentModel, nb: p.defaultNbPercent?.toString() ?? '', ren: p.defaultRenewalPercent?.toString() ?? '', claw: p.clawbackWindowMonths?.toString() ?? '' });
  };
  const save = async (id: string) => {
    setBusy(id);
    try {
      await recon.updateCarrierProfile(id, {
        paymentModel: form.model,
        defaultNbPercent: form.nb === '' ? null : Number(form.nb),
        defaultRenewalPercent: form.ren === '' ? null : Number(form.ren),
        clawbackWindowMonths: form.claw === '' ? null : Number(form.claw),
      });
      setEditing(null); setToast('Carrier profile saved.'); await load();
    } catch (e) { setToast(e instanceof Error ? e.message : 'Save failed.'); }
    finally { setBusy(null); }
  };

  if (loading) return <Spinner label="Loading carriers…" />;
  if (error) return <ErrorNote message={error} />;

  const aliasByCanon: Record<string, string[]> = {};
  for (const a of aliases) (aliasByCanon[a.canonicalCarrier] ??= []).push(a.rawName);

  return (
    <div className="space-y-6">
      {toast && (
        <div className="text-xs bg-slate-900 text-white rounded-lg px-3 py-2 flex items-center justify-between">
          <span>{toast}</span><button onClick={() => setToast(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {pending.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span><b>{pending.length}</b> carrier{pending.length > 1 ? 's' : ''} still on <code>confirm_on_upload</code> — cancel math won't compute until the payment model is set: {pending.map((p) => p.carrierName).join(', ')}.</span>
        </div>
      )}

      <Card title="Carrier commission profiles" subtitle="Payment model drives cancel math. Edit to confirm advance / as_earned / hybrid.">
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs min-w-[680px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="text-left py-2 px-2">Carrier</th>
                <th className="text-left px-2">Payment model</th>
                <th className="text-right px-2">NB %</th>
                <th className="text-right px-2">Renewal %</th>
                <th className="text-right px-2">Clawback mo</th>
                <th className="text-left px-2">Parser</th>
                <th className="px-2"></th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 px-2 font-medium text-slate-800">{p.carrierName}</td>
                  {editing === p.id ? (
                    <>
                      <td className="px-2">
                        <select value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="border border-slate-300 rounded px-1 py-0.5 text-xs">
                          {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td className="px-2 text-right"><input value={form.nb} onChange={(e) => setForm({ ...form, nb: e.target.value })} className="w-12 border border-slate-300 rounded px-1 text-right font-mono" /></td>
                      <td className="px-2 text-right"><input value={form.ren} onChange={(e) => setForm({ ...form, ren: e.target.value })} className="w-12 border border-slate-300 rounded px-1 text-right font-mono" /></td>
                      <td className="px-2 text-right"><input value={form.claw} onChange={(e) => setForm({ ...form, claw: e.target.value })} className="w-12 border border-slate-300 rounded px-1 text-right font-mono" /></td>
                      <td className="px-2 text-slate-400">{p.statementParserKey ?? '—'}</td>
                      <td className="px-2 flex gap-1">
                        <button disabled={busy === p.id} onClick={() => save(p.id)} className="text-emerald-600"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditing(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-2"><span className={`text-[10px] px-1.5 py-0.5 rounded border ${modelTone[p.paymentModel]}`}>{p.paymentModel}</span></td>
                      <td className="px-2 text-right font-mono text-slate-600">{p.defaultNbPercent ?? '—'}</td>
                      <td className="px-2 text-right font-mono text-slate-600">{p.defaultRenewalPercent ?? '—'}</td>
                      <td className="px-2 text-right font-mono text-slate-400">{p.clawbackWindowMonths ?? '—'}</td>
                      <td className="px-2 text-slate-400 font-mono">{p.statementParserKey ?? '—'}</td>
                      <td className="px-2"><button onClick={() => startEdit(p)} className="text-slate-400 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button></td>
                    </>
                  )}
                </tr>
              ))}
              {profiles.length === 0 && <tr><td colSpan={7} className="text-center text-slate-400 py-6">No carrier profiles yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Carrier alias map" subtitle="Raw statement/ledger names → canonical carrier. These collapses fix name-variant NULL-expected rows (§2c).">
        <div className="space-y-3">
          {Object.entries(aliasByCanon).map(([canon, raws]) => (
            <div key={canon} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-800 w-28">{canon}</span>
              <span className="text-slate-300">←</span>
              {raws.map((r) => <span key={r} className="bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-slate-600 font-mono">{r}</span>)}
            </div>
          ))}
          {aliases.length === 0 && <p className="text-slate-400">No aliases mapped.</p>}
        </div>
      </Card>
    </div>
  );
}
