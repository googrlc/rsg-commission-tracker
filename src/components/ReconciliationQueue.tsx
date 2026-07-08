/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Phase 3b — the discrepancy queue. Lists open commission_reconciliation rows
 * flagged by the Hermes statement-reconciliation ingest (short / overpaid /
 * unmatched) and lets Gretchen/Lamar resolve them, writing back
 * amount_recovered + resolution_notes.
 */

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  DollarSign,
  X,
} from 'lucide-react';
import type { ReconciliationDiscrepancy } from '../types';
import { formatCurrencyDecimal } from '../utils';
import { fetchDiscrepancies, resolveDiscrepancy } from '../data/repository';

const TYPE_LABEL: Record<string, string> = {
  short: 'Short',
  overpaid: 'Overpaid',
  unmatched_statement_line: 'Unmatched line',
};

const PRIORITY_STYLE: Record<string, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default function ReconciliationQueue() {
  const [items, setItems] = useState<ReconciliationDiscrepancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<{ amount: string; notes: string }>({ amount: '', notes: '' });
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchDiscrepancies());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the queue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startResolve = (d: ReconciliationDiscrepancy) => {
    setEditing(d.id);
    // Pre-fill the recoverable amount with the shortfall (positive).
    const shortfall = d.delta != null && d.delta < 0 ? Math.abs(d.delta) : 0;
    setForm({ amount: shortfall ? String(shortfall) : '', notes: '' });
  };

  const submitResolve = async (d: ReconciliationDiscrepancy) => {
    setSavingId(d.id);
    try {
      const amount = form.amount.trim() === '' ? undefined : Number(form.amount);
      await resolveDiscrepancy(d.id, { amountRecovered: amount, resolutionNotes: form.notes });
      setItems((prev) => prev.filter((x) => x.id !== d.id));
      setEditing(null);
    } catch (e) {
      alert(`Could not resolve: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSavingId(null);
    }
  };

  const totalShort = items.reduce(
    (acc, d) => acc + (d.delta != null && d.delta < 0 ? Math.abs(d.delta) : 0),
    0,
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/55">
        <div>
          <h3 className="text-lg font-bold text-slate-900 font-display flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Shortage Queue
            <span className="text-xs font-normal px-2 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-200">
              {items.length} OPEN
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Carrier statement discrepancies flagged by the reconciliation sync.
            Resolve to record what was recovered.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-center">
          {totalShort > 0 && (
            <span className="text-sm font-semibold text-red-600">
              {formatCurrencyDecimal(totalShort)} short
            </span>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs rounded-lg transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 flex items-center justify-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="p-8 text-center text-sm text-red-600">{error}</div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center text-slate-500">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-medium">No open discrepancies. The book is clean.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50/50">
                <th className="px-4 py-2.5 font-medium">Priority</th>
                <th className="px-4 py-2.5 font-medium">Client / Policy</th>
                <th className="px-4 py-2.5 font-medium">Carrier</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium text-right">Expected</th>
                <th className="px-4 py-2.5 font-medium text-right">Actual</th>
                <th className="px-4 py-2.5 font-medium text-right">Delta</th>
                <th className="px-4 py-2.5 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <React.Fragment key={d.id}>
                  <tr className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${
                          PRIORITY_STYLE[d.priority] ?? PRIORITY_STYLE.low
                        }`}
                      >
                        {d.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{d.clientName}</div>
                      <div className="text-xs text-slate-400 font-mono">{d.policyNumber}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{d.carrierName}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {TYPE_LABEL[d.discrepancyType] ?? d.discrepancyType}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {formatCurrencyDecimal(d.expectedCommission)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {formatCurrencyDecimal(d.actualCommission)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold ${
                        (d.delta ?? 0) < 0 ? 'text-red-600' : 'text-emerald-600'
                      }`}
                    >
                      {formatCurrencyDecimal(d.delta)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editing === d.id ? (
                        <button
                          onClick={() => setEditing(null)}
                          className="text-slate-400 hover:text-slate-600"
                          title="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => startResolve(d)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition"
                        >
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                  {editing === d.id && (
                    <tr className="bg-blue-50/40 border-b border-slate-100">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                          <label className="text-xs text-slate-600">
                            <span className="block mb-1 font-medium">Amount recovered</span>
                            <div className="flex items-center gap-1 border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
                              <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                              <input
                                type="number"
                                step="0.01"
                                value={form.amount}
                                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                                className="w-28 outline-none text-sm"
                                placeholder="0.00"
                              />
                            </div>
                          </label>
                          <label className="flex-1 text-xs text-slate-600">
                            <span className="block mb-1 font-medium">Resolution notes</span>
                            <input
                              type="text"
                              value={form.notes}
                              onChange={(e) => setForm({ ...form, notes: e.target.value })}
                              className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="e.g. carrier reissued check #4021"
                            />
                          </label>
                          <button
                            onClick={() => submitResolve(d)}
                            disabled={savingId === d.id}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
                          >
                            {savingId === d.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            Mark resolved
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
