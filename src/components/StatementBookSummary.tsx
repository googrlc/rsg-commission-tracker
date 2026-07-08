/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Slice 1 end-to-end proof: reads the reconciled statement rollup from
 * v_book_summary (real actual money from uploaded carrier statements) and renders
 * a compact strip. Self-contained — owns its fetch/loading/error — so wiring it in
 * is a single import + render. Slice 3 grows this into the full dashboard tab.
 */

import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, RotateCw, AlertTriangle } from 'lucide-react';
import type { BookSummary } from '../types';
import { formatCurrency } from '../utils';
import * as repo from '../data/repository';

export default function StatementBookSummary() {
  const [summary, setSummary] = useState<BookSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const s = await repo.fetchBookSummary();
        if (active) setSummary(s);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load book summary.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Nothing loaded yet and no statements uploaded — stay quiet (don't clutter the tab).
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-2 text-slate-500 text-xs">
        <RotateCw className="w-4 h-4 animate-spin text-blue-600" />
        Loading reconciled statement totals…
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4 flex items-center gap-2 text-red-600 text-xs">
        <AlertTriangle className="w-4 h-4" />
        Couldn't load statement summary: {error}
      </div>
    );
  }
  if (!summary || summary.txnCount === 0) return null;

  const stats: Array<{ label: string; value: string; hint?: string; tone?: string }> = [
    { label: 'Net Written Premium', value: formatCurrency(summary.netWrittenPremium), hint: 'From statements' },
    { label: 'Actual Commission', value: formatCurrency(summary.totalCommission), tone: 'text-emerald-700' },
    { label: 'Effective Comm %', value: `${summary.effectiveCommPct.toFixed(2)}%` },
    { label: 'Fee Drag', value: formatCurrency(summary.feeDrag), tone: 'text-rose-600', hint: 'MVR/chargebacks' },
    { label: 'Net Due Agent', value: formatCurrency(summary.netDue), tone: 'text-slate-900' },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-600/10 text-blue-700 rounded-lg">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">Reconciled Statement Book</h4>
            <p className="text-[11px] text-slate-500">
              Actual money from {summary.txnCount} statement lines · {summary.policyCount} policies ·{' '}
              {summary.carrierCount} carrier{summary.carrierCount === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100 font-semibold uppercase">
          Live · v_book_summary
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-slate-50 border border-slate-100 p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{s.label}</div>
            <div className={`text-lg font-bold font-mono mt-1 ${s.tone ?? 'text-slate-800'}`}>{s.value}</div>
            {s.hint && <div className="text-[10px] text-slate-400 mt-0.5">{s.hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
