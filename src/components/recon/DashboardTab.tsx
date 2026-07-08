/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * §11b Dashboard tab — read-only intelligence off the v_* views: book summary,
 * by line, by carrier, NB vs renewal, avg premium by segment, monthly trend
 * (negative months shown honestly), fee drag. recharts, mobile-legible.
 */

import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import type {
  BookSummary, CommByLineRow, CommByCarrierRow, NbVsRenewalRow, SegmentRow, MonthlyTrendRow, FeeDragRow,
} from '../../types';
import * as repo from '../../data/repository';
import * as recon from '../../data/reconRepository';
import { Card, Spinner, ErrorNote, formatCurrency, formatCurrencyDecimal, monthLabel } from './shared';

export default function DashboardTab() {
  const [book, setBook] = useState<BookSummary | null>(null);
  const [byLine, setByLine] = useState<CommByLineRow[]>([]);
  const [byCarrier, setByCarrier] = useState<CommByCarrierRow[]>([]);
  const [nbr, setNbr] = useState<NbVsRenewalRow[]>([]);
  const [seg, setSeg] = useState<SegmentRow[]>([]);
  const [trend, setTrend] = useState<MonthlyTrendRow[]>([]);
  const [fees, setFees] = useState<FeeDragRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [b, l, c, n, s, t, f] = await Promise.all([
          repo.fetchBookSummary(), recon.fetchCommByLine(), recon.fetchCommByCarrier(),
          recon.fetchNbVsRenewal(), recon.fetchAvgPremiumBySegment(), recon.fetchMonthlyTrend(), recon.fetchFeeDrag(),
        ]);
        if (!active) return;
        setBook(b); setByLine(l); setByCarrier(c); setNbr(n); setSeg(s); setTrend(t); setFees(f);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load dashboard.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  if (loading) return <Spinner label="Loading dashboard…" />;
  if (error) return <ErrorNote message={error} />;
  if (!book || book.txnCount === 0) return <p className="text-sm text-slate-400 py-8 text-center">No statement data loaded yet.</p>;

  const trendData = trend.map((t) => ({ ...t, label: monthLabel(t.month_key) }));

  return (
    <div className="space-y-6">
      {/* Book summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { l: 'Net premium', v: formatCurrency(book.netWrittenPremium) },
          { l: 'Commission', v: formatCurrency(book.totalCommission), tone: 'text-emerald-700' },
          { l: 'Effective %', v: `${book.effectiveCommPct.toFixed(2)}%` },
          { l: 'Fee drag', v: formatCurrency(book.feeDrag), tone: 'text-rose-600' },
          { l: 'Net due', v: formatCurrency(book.netDue) },
        ].map((s) => (
          <div key={s.l} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">{s.l}</div>
            <div className={`text-xl font-bold font-mono mt-1 ${s.tone ?? 'text-slate-800'}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* By line */}
        <Card title="Commission by line" subtitle="Net premium, commission, effective %">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={byLine} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="lob" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => formatCurrencyDecimal(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Bar dataKey="net_written_premium" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Net premium" />
              <Bar dataKey="total_commission" fill="#10b981" radius={[4, 4, 0, 0]} name="Commission" />
            </BarChart>
          </ResponsiveContainer>
          <MiniTable rows={byLine.map((r) => [r.lob ?? '—', formatCurrencyDecimal(r.net_written_premium), formatCurrencyDecimal(r.total_commission), `${r.effective_comm_pct}%`, r.min_rate != null ? `${(r.min_rate * 100).toFixed(0)}–${((r.max_rate ?? 0) * 100).toFixed(0)}%` : '—'])}
            head={['LOB', 'Premium', 'Commission', 'Eff %', 'Rate rng']} />
        </Card>

        {/* By carrier */}
        <Card title="Commission by carrier" subtitle="Concentration — how much rides on each carrier">
          <MiniTable rows={byCarrier.map((r) => [r.carrier_name, formatCurrencyDecimal(r.net_written_premium), formatCurrencyDecimal(r.total_commission), `${r.effective_comm_pct}%`, formatCurrencyDecimal(r.fee_drag)])}
            head={['Carrier', 'Premium', 'Commission', 'Eff %', 'Fees']} />
        </Card>

        {/* NB vs Renewal */}
        <Card title="New business vs renewal" subtitle="Written premium, term count, avg premium, effective %">
          <div className="grid grid-cols-2 gap-4">
            {nbr.map((r) => (
              <div key={r.business_type} className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">{r.business_type}</div>
                <div className="text-lg font-bold font-mono text-slate-800 mt-1">{formatCurrency(r.written_premium)}</div>
                <div className="text-[11px] text-slate-500 mt-1 space-y-0.5 font-mono">
                  <div>{r.term_count} terms · avg {formatCurrency(r.avg_premium)}</div>
                  <div>comm {formatCurrencyDecimal(r.total_commission)} · {r.effective_comm_pct}%</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Segment */}
        <Card title="Avg premium by segment" subtitle="Personal vs commercial">
          <div className="grid grid-cols-2 gap-4">
            {seg.map((r) => (
              <div key={r.segment ?? '?'} className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">{r.segment}</div>
                <div className="text-lg font-bold font-mono text-slate-800 mt-1">{formatCurrency(r.avg_premium)}</div>
                <div className="text-[11px] text-slate-500 mt-1 font-mono">{r.term_count} terms · {formatCurrency(r.written_premium)} written</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Monthly trend — full width */}
      <Card title="Monthly trend" subtitle="Commission by month — dips are cancels/clawbacks, shown honestly">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trendData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => formatCurrencyDecimal(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
            <ReferenceLine y={0} stroke="#cbd5e1" />
            <Bar dataKey="commission" radius={[3, 3, 0, 0]} name="Commission">
              {trendData.map((d, i) => <Cell key={i} fill={d.commission < 0 ? '#ef4444' : '#3b82f6'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Fee drag */}
      <Card title="Fee drag" subtitle="MVR + chargebacks + other, by carrier">
        {fees.length === 0 ? <p className="text-xs text-slate-400 py-3 text-center">No fees recorded.</p> : (
          <MiniTable rows={fees.map((f) => [f.carrier_name, f.fee_type, String(f.fee_count), formatCurrencyDecimal(f.fee_total)])}
            head={['Carrier', 'Type', 'Count', 'Total']} />
        )}
      </Card>
    </div>
  );
}

function MiniTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
            {head.map((h, i) => <th key={h} className={`py-1.5 ${i === 0 ? 'text-left' : 'text-right'} px-1`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-slate-50">
              {r.map((c, ci) => <td key={ci} className={`py-1.5 px-1 ${ci === 0 ? 'text-left text-slate-700 font-medium' : 'text-right font-mono text-slate-600'}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
