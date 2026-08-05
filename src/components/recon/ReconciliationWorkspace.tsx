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
import { X, Wrench, AlertTriangle, TrendingDown, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { ReconException, ReconSummary, CommissionTxn, LossOnCancel } from '../../types';
import * as recon from '../../data/reconRepository';
import { Card, Spinner, ErrorNote, StatusBadge, DeltaMoney, formatCurrencyDecimal, monthLabel } from './shared';

type Bucket = 'priced_matched' | 'no_expected' | 'unmatched' | 'missing' | null;
type SortKey = 'delta' | 'carrier';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 25;

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
  const [month, setMonth] = useState<number | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('carrier');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [churnBy, setChurnBy] = useState<'client' | 'carrier'>('client');

  const [selected, setSelected] = useState<ReconException | null>(null);
  const [txns, setTxns] = useState<CommissionTxn[] | null>(null);
  const [policyMonths, setPolicyMonths] = useState<Array<{ policyNumber: string; monthKey: number }>>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [s, ex, lc, pm] = await Promise.all([
          recon.fetchReconSummary(), recon.fetchReconExceptions(), recon.fetchLossOnCancel(), recon.fetchPolicyMonths(),
        ]);
        if (!active) return;
        setSummary(s); setRows(ex); setLoss(lc); setPolicyMonths(pm);
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

  // Statement-activity months present, newest first, + policy→months lookup so the
  // queue can be worked one month at a time (spec: reconcile month by month).
  const monthsAvailable = useMemo<number[]>(() => {
    const seen = new Set<number>();
    const out: number[] = [];
    for (const p of policyMonths) if (!seen.has(p.monthKey)) { seen.add(p.monthKey); out.push(p.monthKey); }
    return out.sort((a, b) => b - a);
  }, [policyMonths]);

  const policyToMonths = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const p of policyMonths) {
      if (!m.has(p.policyNumber)) m.set(p.policyNumber, new Set());
      m.get(p.policyNumber)!.add(p.monthKey);
    }
    return m;
  }, [policyMonths]);

  const filtered = useMemo(() => {
    const allow = bucket ? new Set(BUCKET_STATUSES[bucket]) : null;
    const q = search.trim().toLowerCase();
    const dir = sortDir === 'asc' ? 1 : -1;
    const byDelta = (a: ReconException, b: ReconException) => {
      // shorts first: most-negative delta on top, null deltas last
      const da = a.delta, db = b.delta;
      if (da == null && db == null) return 0;
      if (da == null) return 1;
      if (db == null) return -1;
      return da - db;
    };
    const byCarrier = (a: ReconException, b: ReconException) =>
      a.carrierName.localeCompare(b.carrierName) * dir;

    return rows
      .filter((r) => (!allow || allow.has(r.reconciliationStatus)))
      .filter((r) => (carrier === 'All' || r.carrierName === carrier))
      .filter((r) => month === 'all' || (r.policyNumber != null && policyToMonths.get(r.policyNumber)?.has(month)))
      .filter((r) => !q || (r.clientName ?? '').toLowerCase().includes(q) || (r.policyNumber ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        if (sortKey === 'carrier') {
          const c = byCarrier(a, b);
          return c !== 0 ? c : byDelta(a, b);
        }
        const d = byDelta(a, b);
        // When sorting by shortfall, still group carriers stably.
        return d !== 0 ? d : a.carrierName.localeCompare(b.carrierName);
      });
  }, [rows, bucket, carrier, search, month, policyToMonths, sortKey, sortDir]);

  // Reset to page 1 whenever the working set changes.
  useEffect(() => { setPage(1); }, [bucket, carrier, search, month, sortKey, sortDir, rows.length]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const toggleCarrierSort = () => {
    if (sortKey !== 'carrier') {
      setSortKey('carrier');
      setSortDir('asc');
      return;
    }
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
  };

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

      {/* Canceled policies are reconciled to their pro-rated actual and kept OUT of
          the shorts queue (spec §4.3) — surfaced here + in Churn so they're never
          mistaken for money the carrier owes. */}
      {summary.canceledCount > 0 && (
        <div className="flex items-start gap-2 text-[12px] text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
          <TrendingDown className="w-4 h-4 mt-0.5 shrink-0 text-orange-500" />
          <span>
            <b>{summary.canceledCount}</b> canceled {summary.canceledCount === 1 ? 'policy' : 'policies'} reconciled to
            actual ({formatCurrencyDecimal(summary.canceledActual)} kept) — excluded from shorts, because a cancel is
            <b> churn</b>, not a carrier shortage. Per-client loss is in Churn below.
          </span>
        </div>
      )}

      {/* Exception queue */}
      <Card
        title="Exception queue"
        subtitle={`${filtered.length} rows${bucket ? ' · filtered' : ''}${month !== 'all' ? ` · ${monthLabel(month)}` : ''} · sorted by ${sortKey === 'carrier' ? `carrier ${sortDir === 'asc' ? 'A→Z' : 'Z→A'}` : 'shortfall'} · ${PAGE_SIZE}/page`}
        right={
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <div className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-2 py-1">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="client / policy"
                className="text-xs outline-none w-28" />
            </div>
            <select value={month} onChange={(e) => setMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              title="Reconcile one month at a time (statement activity)"
              className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
              <option value="all">All months</option>
              {monthsAvailable.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select value={carrier} onChange={(e) => setCarrier(e.target.value)}
              title="Filter by carrier"
              className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
              {carriers.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select
              value={sortKey === 'carrier' ? `carrier_${sortDir}` : 'delta'}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'delta') { setSortKey('delta'); setSortDir('asc'); }
                else if (v === 'carrier_asc') { setSortKey('carrier'); setSortDir('asc'); }
                else { setSortKey('carrier'); setSortDir('desc'); }
              }}
              title="Sort the exception queue"
              className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
            >
              <option value="carrier_asc">Sort: Carrier A→Z</option>
              <option value="carrier_desc">Sort: Carrier Z→A</option>
              <option value="delta">Sort: Shortfall first</option>
            </select>
            {bucket && (
              <button onClick={() => setBucket(null)} className="text-[11px] text-blue-600 hover:underline">clear</button>
            )}
          </div>
        }
      >
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs min-w-[1200px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="text-left font-medium py-2 px-2">Client</th>
                <th className="text-left font-medium px-2">
                  <button
                    type="button"
                    onClick={toggleCarrierSort}
                    className={`inline-flex items-center gap-1 hover:text-slate-700 ${sortKey === 'carrier' ? 'text-slate-700' : ''}`}
                    title="Sort by carrier"
                  >
                    Carrier
                    {sortKey !== 'carrier' && <ArrowUpDown className="w-3 h-3 opacity-50" />}
                    {sortKey === 'carrier' && sortDir === 'asc' && <ArrowUp className="w-3 h-3" />}
                    {sortKey === 'carrier' && sortDir === 'desc' && <ArrowDown className="w-3 h-3" />}
                  </button>
                </th>
                <th className="text-left font-medium px-2">Policy #</th>
                <th className="text-left font-medium px-2">LOB</th>
                <th className="text-left font-medium px-2">Type</th>
                <th className="text-left font-medium px-2">Effective</th>
                <th className="text-left font-medium px-2" title="Original term end from AMS. Cancel date is separate — mid-term cancels keep the full-term expiration.">
                  Term end / Cancel
                </th>
                <th className="text-right font-medium px-2" title="Pro-rata unearned: estimated chargeback (advance) or forgone (as-earned). Realized = statement cancel lines.">
                  Est. chargeback
                </th>
                <th className="text-left font-medium px-2">Exp. pay</th>
                <th className="text-right font-medium px-2">Expected</th>
                <th className="text-right font-medium px-2">Actual</th>
                <th className="text-right font-medium px-2">
                  <button
                    type="button"
                    onClick={() => { setSortKey('delta'); setSortDir('asc'); }}
                    className={`inline-flex items-center gap-1 hover:text-slate-700 ${sortKey === 'delta' ? 'text-slate-700' : ''}`}
                    title="Sort by shortfall (most negative first)"
                  >
                    Delta
                    {sortKey === 'delta' ? <ArrowDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3 opacity-50" />}
                  </button>
                </th>
                <th className="text-left font-medium px-2">Status</th>
                <th className="px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={14} className="text-center text-slate-400 py-6">No rows for this filter.</td></tr>
              )}
              {pageRows.map((r, i) => (
                <tr key={`${r.carrierName}-${r.policyNumber}-${(safePage - 1) * PAGE_SIZE + i}`}
                  onClick={() => openPolicy(r)}
                  className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer">
                  <td className="py-2 px-2 font-medium text-slate-800 max-w-[160px] truncate">{r.clientName ?? '—'}</td>
                  <td className="px-2 text-slate-600">{r.carrierName}</td>
                  <td className="px-2 font-mono text-slate-500">{r.policyNumber ?? '—'}</td>
                  <td className="px-2 text-slate-500">{r.lob ?? '—'}</td>
                  <td className="px-2 whitespace-nowrap"><TypeCell r={r} /></td>
                  <td className="px-2 font-mono text-slate-500">{r.effectiveDate ?? '—'}</td>
                  <td className="px-2 font-mono text-slate-500">
                    <div>
                      {r.expirationDate ?? '—'}
                      {r.termMonths != null && <span className="text-slate-400"> · {r.termMonths}mo</span>}
                    </div>
                    {r.cancelDate && (
                      <div
                        className={`mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          r.isMidTermCancel
                            ? 'bg-orange-50 text-orange-800 border-orange-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                        title={r.cancelEstimateReason ?? undefined}
                      >
                        Canceled {r.cancelDate}
                        {r.isMidTermCancel && <span className="uppercase tracking-wide">· mid-term</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-2 text-right">
                    <CancelEstimateCell r={r} />
                  </td>
                  <td className="px-2 font-mono text-slate-500" title={r.payBasis ?? undefined}>
                    {r.expectedPayMonth ? monthLabel(r.expectedPayMonth) : '—'}
                  </td>
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

        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-100">
            <div className="text-[11px] text-slate-500 font-mono">
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Prev
              </button>
              <span className="text-[11px] font-mono text-slate-600 px-1">
                Page {safePage} / {pageCount}
              </span>
              <button
                type="button"
                disabled={safePage >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-slate-300 bg-white text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
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

/** Pro-rata cancel estimate — chargeback (advance) or forgone (as-earned). */
function CancelEstimateCell({ r }: { r: ReconException }) {
  if (!r.cancelDate || r.cancelEstimateAmount == null) {
    return <span className="text-slate-300">—</span>;
  }
  const label =
    r.cancelEstimateLabel === 'estimated_forgone' ? 'forgone'
      : r.cancelEstimateLabel === 'unconfirmed' ? 'est. (review)'
        : 'est. CB';
  return (
    <div className="text-right" title={r.cancelEstimateReason ?? undefined}>
      <div className={`font-mono text-xs font-semibold ${r.cancelEstimateAmount > 0 ? 'text-rose-700' : 'text-slate-500'}`}>
        {r.cancelEstimateAmount > 0 ? '−' : ''}{formatCurrencyDecimal(Math.abs(r.cancelEstimateAmount))}
      </div>
      <div className="text-[10px] text-slate-400">{label}{r.paymentModel ? ` · ${r.paymentModel}` : ''}</div>
      {r.realizedClawback != null && r.realizedClawback > 0 && (
        <div className="text-[10px] text-slate-500 font-mono" title="Already on statement cancel/chargeback lines">
          realized −{formatCurrencyDecimal(r.realizedClawback)}
        </div>
      )}
    </div>
  );
}

/** New / Renewal term badge + endorsement/cancel line counts, so each recon row
 * shows how its commission is typed (spec: NB vs renewal vs endorsement). */
function TypeCell({ r }: { r: ReconException }) {
  const extras: string[] = [];
  if (!r.termType) {
    // unmatched-statement rows have no ledger term — show the raw line mix.
    if (r.newCount > 0) extras.push(`${r.newCount} new`);
    if (r.renewalCount > 0) extras.push(`${r.renewalCount} rnwl`);
  }
  if (r.endorsementCount > 0) extras.push(`${r.endorsementCount} endt`);
  if (r.cancelCount > 0) extras.push(`${r.cancelCount} cxl`);
  return (
    <span className="inline-flex items-center gap-1">
      {r.termType && (
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
          r.termType === 'New' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
          {r.termType}
        </span>
      )}
      {extras.length > 0 && <span className="text-[10px] text-slate-400">{extras.join(' · ')}</span>}
      {!r.termType && extras.length === 0 && <span className="text-slate-300">—</span>}
    </span>
  );
}

function ChurnPanel({ loss, by, setBy }: {
  loss: LossOnCancel[]; by: 'client' | 'carrier'; setBy: (v: 'client' | 'carrier') => void;
}) {
  const rolled = useMemo(() => {
    const m = new Map<string, { key: string; cancels: number; loss: number; basis: string; latestCancel: string | null }>();
    for (const l of loss) {
      const key = by === 'client' ? (l.clientName ?? l.insuredName ?? '—') : l.carrierName;
      const cur = m.get(key) ?? { key, cancels: 0, loss: 0, basis: l.lossBasis, latestCancel: null };
      cur.cancels += 1;
      cur.loss += l.lossAmount ?? Math.abs(l.realizedClawback);
      if (l.transactionDate && (!cur.latestCancel || l.transactionDate > cur.latestCancel)) {
        cur.latestCancel = l.transactionDate;
      }
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.loss - a.loss);
  }, [loss, by]);

  const perPolicy = useMemo(
    () => [...loss].sort((a, b) => (b.transactionDate ?? '').localeCompare(a.transactionDate ?? '')),
    [loss],
  );

  const total = rolled.reduce((s, r) => s + r.loss, 0);

  return (
    <Card
      title="Churn — loss on cancel"
      subtitle={`${loss.length} cancels · ${formatCurrencyDecimal(total)} lost · cancel date = statement Cancel Pro Rate / chargeback date`}
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
      {loss.length === 0 ? (
        <p className="text-xs text-slate-400 py-4 text-center">No cancellations in the loaded statements.</p>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            {rolled.slice(0, 12).map((r) => (
              <div key={r.key} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingDown className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span className="text-xs font-medium text-slate-700 truncate">{r.key}</span>
                  <span className="text-[10px] text-slate-400">
                    {r.cancels} cancel{r.cancels > 1 ? 's' : ''}
                    {r.latestCancel ? ` · latest ${r.latestCancel}` : ''}
                  </span>
                </div>
                <span className="font-mono text-xs font-semibold text-red-600 shrink-0">−{formatCurrencyDecimal(r.loss)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Per policy · cancel date</div>
            <div className="overflow-x-auto max-h-56 overflow-y-auto -mx-1">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                    <th className="text-left font-medium py-1.5 px-1">Client</th>
                    <th className="text-left font-medium px-1">Carrier</th>
                    <th className="text-left font-medium px-1">Policy #</th>
                    <th className="text-left font-medium px-1">LOB</th>
                    <th className="text-left font-medium px-1">Cancel date</th>
                    <th className="text-right font-medium px-1">Clawback</th>
                    <th className="text-left font-medium px-1">Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {perPolicy.map((l, i) => (
                    <tr key={`${l.policyNumber}-${l.transactionDate}-${i}`} className="border-b border-slate-50">
                      <td className="py-1.5 px-1 text-slate-800 truncate max-w-[140px]">{l.clientName ?? l.insuredName ?? '—'}</td>
                      <td className="px-1 text-slate-600">{l.carrierName}</td>
                      <td className="px-1 font-mono text-slate-500">{l.policyNumber ?? '—'}</td>
                      <td className="px-1 text-slate-500">{l.lob ?? '—'}</td>
                      <td className="px-1 font-mono font-semibold text-orange-800">{l.transactionDate ?? '—'}</td>
                      <td className="px-1 text-right font-mono text-red-600">
                        −{formatCurrencyDecimal(l.lossAmount ?? Math.abs(l.realizedClawback))}
                      </td>
                      <td className="px-1 text-[10px] text-slate-400">{l.lossBasis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
            <p className="text-[11px] text-slate-500 font-mono mt-1">
              Term {row.effectiveDate ?? '—'} → {row.expirationDate ?? '—'}
              {row.termMonths != null && ` (${row.termMonths}mo)`}
              {row.expectedPayMonth ? ` · expected pay ${monthLabel(row.expectedPayMonth)}` : ''}
            </p>
            {row.cancelDate && (
              <p className={`text-[11px] font-semibold mt-1 ${row.isMidTermCancel ? 'text-orange-700' : 'text-slate-600'}`}>
                Canceled {row.cancelDate}
                {row.isMidTermCancel ? ' · mid-term' : ''}
              </p>
            )}
            {row.cancelEstimateAmount != null && (
              <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-[11px]">
                <div className="font-semibold text-rose-900">
                  {row.cancelEstimateLabel === 'estimated_forgone' ? 'Estimated forgone' : 'Estimated chargeback'}{' '}
                  <span className="font-mono">−{formatCurrencyDecimal(Math.abs(row.cancelEstimateAmount))}</span>
                  {row.paymentModel ? <span className="font-normal text-rose-700/80"> · {row.paymentModel}</span> : null}
                </div>
                {row.cancelEstimateReason && (
                  <p className="text-rose-800/80 mt-0.5">{row.cancelEstimateReason}</p>
                )}
                {row.realizedClawback != null && row.realizedClawback > 0 && (
                  <p className="text-rose-800/80 mt-0.5 font-mono">
                    Realized on statement: −{formatCurrencyDecimal(row.realizedClawback)}
                    {row.cancelEstimateAmount > 0 && (
                      <span>
                        {' '}· variance {formatCurrencyDecimal(row.realizedClawback - row.cancelEstimateAmount)}
                      </span>
                    )}
                  </p>
                )}
              </div>
            )}
            {row.payBasis && <p className="text-[10px] text-slate-400 mt-0.5">{row.payBasis}</p>}
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
