/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Month-end QuickBooks Summary — its own page. Pick a month and see commission
 * ACTUALLY received that month, per carrier, off the real transaction layer
 * (v_commission_by_carrier_month, keyed on statement activity month_key). Copy a
 * carrier's received total to post as Commission Income in QuickBooks. This is the
 * "close one month at a time" workflow: reconcile month by month, see how the book
 * did each month. The Dashboard keeps the overall trend + whole-book view.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, LogOut, ArrowLeft, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { CarrierMonthRow } from '../../types';
import * as recon from '../../data/reconRepository';
import { Card, Spinner, ErrorNote, formatCurrency, formatCurrencyDecimal, monthLabel } from './shared';

export default function QuickBooksSummaryPage({
  email, signOut, onExit,
}: {
  email: string | null;
  signOut: () => void;
  onExit: () => void;
}) {
  const [rows, setRows] = useState<CarrierMonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await recon.fetchCarrierMonth();
        if (!active) return;
        setRows(data);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load month-end data.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  // Distinct months present, newest first. Default to the latest.
  const months = useMemo<number[]>(() => {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const r of rows) {
      const m = Number(r.month_key);
      if (!seen.has(m)) { seen.add(m); out.push(m); }
    }
    return out.sort((a, b) => b - a);
  }, [rows]);
  useEffect(() => {
    if (month == null && months.length > 0) setMonth(months[0]);
  }, [months, month]);

  const monthRows = useMemo(
    () => rows.filter((r) => r.month_key === month).sort((a, b) => b.commission - a.commission),
    [rows, month],
  );

  const totals = useMemo(() => monthRows.reduce(
    (t, r) => ({
      commission: t.commission + r.commission,
      premium: t.premium + r.premium,
      fees: t.fees + r.fees,
      net: t.net + r.net_due,
    }),
    { commission: 0, premium: 0, fees: 0, net: 0 },
  ), [monthRows]);

  const monthIdx = month == null ? -1 : months.indexOf(month);
  const step = (dir: -1 | 1) => {
    const next = monthIdx + dir;
    if (next >= 0 && next < months.length) setMonth(months[next]);
  };

  const copyCarrier = (r: CarrierMonthRow) => {
    const text =
      `QuickBooks — Commission Income (${monthLabel(r.month_key)})\n` +
      `Carrier: ${r.carrier_name}\n` +
      `Commission received: ${formatCurrencyDecimal(r.commission)}\n` +
      `Fees: ${formatCurrencyDecimal(r.fees)}\n` +
      `Net due: ${formatCurrencyDecimal(r.net_due)}`;
    navigator.clipboard?.writeText(text);
    setCopied(r.carrier_name);
    setTimeout(() => setCopied((c) => (c === r.carrier_name ? null : c)), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-600 rounded-lg"><BookOpen className="w-5 h-5" /></div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">QuickBooks Summary — Month-End</h1>
                <p className="text-slate-400 text-[11px] font-mono">Commission received by carrier, one month at a time · post as Commission Income</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={onExit} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 flex items-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Ledger & rules
              </button>
              {email && <span className="text-[11px] text-slate-400 font-mono px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700">{email}</span>}
              <button type="button" onClick={signOut} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 flex items-center gap-1.5">
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {loading ? <Spinner label="Loading month-end totals…" />
          : error ? <ErrorNote message={error} />
          : months.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No statement activity loaded yet.</p>
          ) : (
          <>
            {/* Month picker */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => step(1)} disabled={monthIdx >= months.length - 1}
                  className="p-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40 hover:bg-slate-50" title="Older month">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <select
                  value={month ?? ''}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  title="Select month to close"
                  className="text-sm font-semibold border border-slate-300 rounded-lg px-3 py-1.5 bg-white"
                >
                  {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </select>
                <button type="button" onClick={() => step(-1)} disabled={monthIdx <= 0}
                  className="p-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40 hover:bg-slate-50" title="Newer month">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs text-slate-500 font-mono">{monthRows.length} carrier{monthRows.length === 1 ? '' : 's'} · statement activity</div>
            </div>

            {/* Month total tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { l: 'Commission received', v: formatCurrency(totals.commission), tone: 'text-emerald-700' },
                { l: 'Net premium', v: formatCurrency(totals.premium) },
                { l: 'Fees', v: formatCurrency(totals.fees), tone: 'text-rose-600' },
                { l: 'Net due', v: formatCurrency(totals.net) },
              ].map((s) => (
                <div key={s.l} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{s.l}</div>
                  <div className={`text-xl font-bold font-mono mt-1 ${s.tone ?? 'text-slate-800'}`}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Per-carrier table for the month → post to QB */}
            <Card title={`Commission received — ${month ? monthLabel(month) : ''}`} subtitle="Post each carrier's received total under Commission Income in QuickBooks">
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-xs min-w-[720px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                      <th className="text-left font-medium py-2 px-2">Carrier</th>
                      <th className="text-right font-medium px-2">Premium</th>
                      <th className="text-right font-medium px-2">Commission</th>
                      <th className="text-right font-medium px-2">Fees</th>
                      <th className="text-right font-medium px-2">Net due</th>
                      <th className="text-center font-medium px-2">Activity</th>
                      <th className="px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRows.map((r) => (
                      <tr key={r.carrier_name} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 px-2 font-medium text-slate-800">{r.carrier_name}</td>
                        <td className="px-2 text-right font-mono text-slate-500">{formatCurrencyDecimal(r.premium)}</td>
                        <td className="px-2 text-right font-mono font-semibold text-emerald-700">{formatCurrencyDecimal(r.commission)}</td>
                        <td className="px-2 text-right font-mono text-rose-600">{r.fees ? formatCurrencyDecimal(r.fees) : '—'}</td>
                        <td className="px-2 text-right font-mono text-slate-700">{formatCurrencyDecimal(r.net_due)}</td>
                        <td className="px-2 text-center text-[10px] text-slate-500 font-mono">
                          {r.new_count}N · {r.renewal_count}R · {r.endorsement_count}E · {r.cancel_count}C
                        </td>
                        <td className="px-2 text-right">
                          <button type="button" onClick={() => copyCarrier(r)} title="Copy for QuickBooks"
                            className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-blue-600 border border-slate-200 rounded px-1.5 py-1 hover:bg-slate-100">
                            {copied === r.carrier_name ? <><Check className="w-3 h-3 text-emerald-500" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-200 font-semibold">
                      <td className="py-2 px-2 text-slate-800">Total — {month ? monthLabel(month) : ''}</td>
                      <td className="px-2 text-right font-mono text-slate-600">{formatCurrencyDecimal(totals.premium)}</td>
                      <td className="px-2 text-right font-mono text-emerald-700">{formatCurrencyDecimal(totals.commission)}</td>
                      <td className="px-2 text-right font-mono text-rose-600">{formatCurrencyDecimal(totals.fees)}</td>
                      <td className="px-2 text-right font-mono text-slate-700">{formatCurrencyDecimal(totals.net)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
