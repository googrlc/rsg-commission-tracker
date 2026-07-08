/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * §11a Reconciliation tab — the operational workspace. Four clickable health
 * buckets filter an exception queue (shorts first); a row opens a slide-over of
 * every transaction that nets to that policy's actual; a churn panel lists the
 * loss-on-cancel events. Reads v_reconciliation_summary / _exceptions /
 * v_loss_on_cancel.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { X, Wrench, AlertTriangle, TrendingDown, Search } from 'lucide-react';
import type { ReconException, ReconSummary, CommissionTxn, LossOnCancel } from '../../types';
import * as recon from '../../data/reconRepository';
import { Card, Spinner, ErrorNote, StatusBadge, DeltaMoney, formatCurrencyDecimal } from './shared';

type Bucket = 'priced_matched' | 'no_expected' | 'unmatched' | 'missing' | null;
const BUCKET_STATUSES: Record<string, string[]> = {
  priced_matched: ['underpaid', 'overpaid'],
  no_expected: ['no_expected'],
  unmatched: ['unmatched_statement'],
  missing: ['missing_statement'],
};

export default function ReconciliationWorkspace({
  onFixRule,
}: {
  onFixRule?: (carrier: string, lob: string | null) => void;
}) {
  const [summary, setSummary] = useState<ReconSummary | null>(null);
  const [rows, setRows] = useState<ReconException[]>([]);
  const [loss, setLoss] = useState<LossOnCancel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bucket, setBucket] = useState<Bucket>(null);
  const [carrier, setCarrier] = useState('All');
  const [search, setSearch] = useState('');
  const [churnBy, setChurnBy] = useState<'client' | 'carrier'>('client');

  const [selected, setSelected] = useState<ReconException | null>(null);
  const [txns, setTxns] = useState<CommissionTxn[] | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [s, ex, lc] = await Promise.all([
          recon.fetchReconSummary(), recon.fetchReconExceptions(), recon.fetchLossOnCancel(),
        ]);
        if (!active) return;
        setSummary(s); setRows(ex); setLoss(lc);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const carriers = useMemo(
    () => ['All', ...Array.from(new Set(rows.map((r) => r.carrierName))).sort()],
    [rows],
  );

  const filtered = useMemo(() => {
    const allow = bucket ? new Set(BUCKET_STATUSES[bucket]) : null;
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (!allow || allow.has(r.reconciliationStatus)))
      .filter((r) => (carrier === 'All' || r.carrierName === carrier))
      .filter((r) => !q || (r.clientName ?? '').toLowerCase().includes(q) || (r.policyNumber ?? '').toLowerCase().includes(q))
      // shorts first: most-negative delta on top, null deltas last
      .sort((a, b) => {
        const da = a.delta, db = b.delta;
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return da - db;
      });
  }, [rows, bucket, carrier, search]);

  const openPolicy = async (r: ReconException) => {
    setSelected(r); setTxns(null);
    if (r.policyNumber) {
      try {
        setTxns(await recon.fetchPolicyTransactions(r.carrierName, r.policyNumber));
      } catch { setTxns([]); }
    } else setTxns([]);
  };

  if (loading) return <Spinner label="Loading reconciliation workspace…" />;
  if (error) return <ErrorNote message={error} />;
  if (!summary) return null;

  const buckets: Array<{ key: Exclude<Bucket, null>; label: string; count: number; sub: string; tone: string }> = [
    { key: 'priced_matched', label: 'Priced & matched', count: summary.pricedMatchedCount, sub: `${formatCurrencyDecimal(summary.pricedMatchedActual)} · ${summary.underpaidCount} short`, tone: 'emerald' },
    { key: 'no_expected', label: 'Paid — never priced', count: summary.noExpectedCount, sub: `${formatCurrencyDecimal(summary.noExpectedActual)} to price`, tone: 'amber' },
    { key: 'unmatched', label: 'On stmt, not in ledger', count: summary.unmatchedCount, sub: `${formatCurrencyDecimal(summary.unmatchedActual)}`, tone: 'violet' },
    { key: 'missing', label: 'In ledger, not on stmt', count: summary.missingCount, sub: 'no statement line yet', tone: 'slate' },
  ];
  const toneCls: Record<string, string> = {
    emerald: 'border-emerald-200 bg-emerald-50/40', amber: 'border-amber-200 bg-amber-50/40',
    violet: 'border-violet-200 bg-violet-50/40', slate: 'border-slate-200 bg-slate-50',
  };

  return (
    <div className="space-y-6">
      {/* 4-bucket health strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {buckets.map((b) => {
          const active = bucket === b.key;
          return (
            <button
              key={b.key}
              onClick={() => setBucket(active ? null : b.key)}
              className={`text-left rounded-xl border p-4 transition ${toneCls[b.tone]} ${active ? 'ring-2 ring-blue-500 shadow' : 'hover:shadow-sm'}`}
            >
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">{b.label}</div>
              <div className="text-2xl font-bold font-mono text-slate-900 mt-1">{b.count}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{b.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Exception queue */}
      <Card
        title="Exception queue"
        subtitle={`${filtered.length} rows${bucket ? ' · filtered' : ''} · shorts on top (red = chase it, amber = fix the rule)`}
        right={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-2 py-1">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="client / policy"
                className="text-xs outline-none w-28" />
            </div>
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
              {carriers.map((c) => <option key={c}>{c}</option>)}
            </select>
            {bucket && (
              <button onClick={() => setBucket(null)} className="text-[11px] text-blue-600 hover:underline">clear</button>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="text-left font-medium py-2 px-2">Client</th>
                <th className="text-left font-medium px-2">Carrier</th>
                <th className="text-left font-medium px-2">Policy #</th>
                <th className="text-left font-medium px-2">LOB</th>
                <th className="text-right font-medium px-2">Expected</th>
                <th className="text-right font-medium px-2">Actual</th>
                <th className="text-right font-medium px-2">Delta</th>
                <th className="text-left font-medium px-2">Status</th>
                <th className="px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center text-slate-400 py-6">No rows for this filter.</td></tr>
              )}
              {filtered.map((r, i) => (
                <tr key={`${r.carrierName}-${r.policyNumber}-${i}`}
                  onClick={() => openPolicy(r)}
                  className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer">
                  <td className="py-2 px-2 font-medium text-slate-800 max-w-[160px] truncate">{r.clientName ?? '—'}</td>
                  <td className="px-2 text-slate-600">{r.carrierName}</td>
                  <td className="px-2 font-mono text-slate-500">{r.policyNumber ?? '—'}</td>
                  <td className="px-2 text-slate-500">{r.lob ?? '—'}</td>
                  <td className="px-2 text-right font-mono text-slate-600">{r.expectedCommission == null ? '—' : formatCurrencyDecimal(r.expectedCommission)}</td>
                  <td className="px-2 text-right font-mono text-slate-800">{r.actualCommission == null ? '—' : formatCurrencyDecimal(r.actualCommission)}</td>
                  <td className="px-2 text-right"><DeltaMoney value={r.delta} /></td>
                  <td className="px-2"><StatusBadge status={r.reconciliationStatus} /></td>
                  <td className="px-2">
                    {r.reconciliationStatus === 'no_expected' && onFixRule && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onFixRule(r.carrierName, r.lob); }}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 hover:bg-amber-100"
                      >
                        <Wrench className="w-3 h-3" /> Fix rule
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Churn / loss-on-cancel */}
      <ChurnPanel loss={loss} by={churnBy} setBy={setChurnBy} />

      {/* Policy detail slide-over */}
      {selected && (
        <PolicySlideOver row={selected} txns={txns} onClose={() => { setSelected(null); setTxns(null); }} />
      )}
    </div>
  );
}

function ChurnPanel({ loss, by, setBy }: {
  loss: LossOnCancel[]; by: 'client' | 'carrier'; setBy: (v: 'client' | 'carrier') => void;
}) {
  const rolled = useMemo(() => {
    const m = new Map<string, { key: string; cancels: number; loss: number; basis: string }>();
    for (const l of loss) {
      const key = by === 'client' ? (l.clientName ?? l.insuredName ?? '—') : l.carrierName;
      const cur = m.get(key) ?? { key, cancels: 0, loss: 0, basis: l.lossBasis };
      cur.cancels += 1;
      cur.loss += l.lossAmount ?? Math.abs(l.realizedClawback);
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.loss - a.loss);
  }, [loss, by]);

  const total = rolled.reduce((s, r) => s + r.loss, 0);

  return (
    <Card
      title="Churn — loss on cancel"
      subtitle={`${loss.length} cancels · ${formatCurrencyDecimal(total)} lost · each row is a client to call`}
      right={
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-[11px]">
          {(['client', 'carrier'] as const).map((k) => (
            <button key={k} onClick={() => setBy(k)}
              className={`px-2.5 py-1 ${by === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600'}`}>
              by {k}
            </button>
          ))}
        </div>
      }
    >
      {rolled.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">No cancellations in the loaded statements.</p>
      ) : (
        <div className="space-y-2">
          {rolled.slice(0, 12).map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <span className="text-xs font-medium text-slate-700 truncate">{r.key}</span>
                <span className="text-[10px] text-slate-400">{r.cancels} cancel{r.cancels > 1 ? 's' : ''}</span>
              </div>
              <span className="font-mono text-xs font-semibold text-red-600 shrink-0">−{formatCurrencyDecimal(r.loss).replace('$', '$')}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PolicySlideOver({ row, txns, onClose }: {
  row: ReconException; txns: CommissionTxn[] | null; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white h-full shadow-2xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{row.clientName ?? 'Policy'} </h3>
            <p className="text-[11px] text-slate-500 font-mono">{row.carrierName} · {row.policyNumber ?? '—'} · {row.lob ?? ''}</p>
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className="text-slate-500">Expected <b className="font-mono text-slate-700">{row.expectedCommission == null ? '—' : formatCurrencyDecimal(row.expectedCommission)}</b></span>
              <span className="text-slate-500">Actual <b className="font-mono text-slate-800">{row.actualCommission == null ? '—' : formatCurrencyDecimal(row.actualCommission)}</b></span>
              <DeltaMoney value={row.delta} />
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">
          <p className="text-[11px] text-slate-500 mb-3 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            Every statement line for this policy — NB + renewals + endorsements + cancels net to Actual.
          </p>
          {txns == null ? <Spinner /> : txns.length === 0 ? (
            <p className="text-xs text-slate-400">No transactions found (statement line has no ledger match, or none loaded).</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="text-left py-1.5">Date</th>
                  <th className="text-left">Type</th>
                  <th className="text-right">Premium</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Commission</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id} className="border-b border-slate-50">
                    <td className="py-1.5 font-mono text-slate-500">{t.transactionDate ?? '—'}</td>
                    <td className="text-slate-700">{t.transactionCode ?? t.transactionType}</td>
                    <td className="text-right font-mono text-slate-500">{t.grossPremium == null ? '—' : formatCurrencyDecimal(t.grossPremium)}</td>
                    <td className="text-right font-mono text-slate-400">{t.commissionRate == null ? '—' : `${(t.commissionRate * 100).toFixed(0)}%`}</td>
                    <td className="text-right"><DeltaMoney value={t.commissionAmount} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
