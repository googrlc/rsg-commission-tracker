/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * §11c Rates tab — controls what drives expected_commission. Coverage indicator
 * (unpriced ledger rows, the health metric), the rules table with §10 provenance
 * + inline rate edit, and the rate-intake review queue (approve → new rule).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Check, X, Pencil, ShieldCheck, ThumbsUp, ThumbsDown } from 'lucide-react';
import type { RuleCoverage, RuleWithProvenance, RateIntake } from '../../types';
import * as recon from '../../data/reconRepository';
import { Card, Spinner, ErrorNote } from './shared';

function SourceBadge({ source }: { source: string | null }) {
  const map: Record<string, string> = {
    rate_sheet: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    statement_derived: 'bg-blue-50 text-blue-700 border-blue-200',
    manual: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const label = source ?? 'legacy';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${map[source ?? ''] ?? 'bg-slate-100 text-slate-400 border-slate-200'}`}>{label}</span>;
}
const confTone: Record<string, string> = { high: 'text-emerald-600', medium: 'text-amber-600', low: 'text-red-600' };

export default function RatesTab({
  prefill, reviewedBy,
}: {
  prefill?: { carrier: string; lob: string | null } | null;
  reviewedBy: string | null;
}) {
  const [coverage, setCoverage] = useState<RuleCoverage[]>([]);
  const [rules, setRules] = useState<RuleWithProvenance[]>([]);
  const [intake, setIntake] = useState<RateIntake[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [carrierFilter, setCarrierFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'confidence' | 'confirmed'>('confidence');
  const [editing, setEditing] = useState<string | null>(null);
  const [editNb, setEditNb] = useState('');
  const [editRen, setEditRen] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [cov, rl, ri] = await Promise.all([
        recon.fetchRuleCoverage(), recon.fetchRulesWithProvenance(), recon.fetchRateIntake('pending'),
      ]);
      setCoverage(cov); setRules(rl); setIntake(ri);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rates.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (prefill?.carrier) setCarrierFilter(prefill.carrier); }, [prefill]);

  const totalUnpriced = useMemo(() => coverage.reduce((s, c) => s + c.unpriced, 0), [coverage]);
  const carriers = useMemo(() => ['All', ...Array.from(new Set(rules.map((r) => r.carrierName))).sort()], [rules]);

  const shown = useMemo(() => {
    const confRank = (c: string | null) => (c === 'low' ? 0 : c === 'medium' ? 1 : c === 'high' ? 2 : 3);
    return rules
      .filter((r) => carrierFilter === 'All' || r.carrierName === carrierFilter)
      .filter((r) => !prefill?.lob || (r.lob ?? '').toLowerCase() === prefill.lob!.toLowerCase() || carrierFilter !== prefill.carrier)
      .sort((a, b) => sortBy === 'confidence'
        ? confRank(a.confidence) - confRank(b.confidence)
        : (a.lastConfirmedDate ?? '').localeCompare(b.lastConfirmedDate ?? ''));
  }, [rules, carrierFilter, sortBy, prefill]);

  const startEdit = (r: RuleWithProvenance) => {
    setEditing(r.id); setEditNb(r.nbPercent?.toString() ?? ''); setEditRen(r.renewalPercent?.toString() ?? '');
  };
  const saveEdit = async (id: string) => {
    setBusy(id);
    try {
      await recon.updateRuleRate(id, {
        nbPercent: editNb === '' ? null : Number(editNb),
        renewalPercent: editRen === '' ? null : Number(editRen),
      });
      setEditing(null); setToast('Rate saved.'); await load();
    } catch (e) { setToast(e instanceof Error ? e.message : 'Save failed.'); }
    finally { setBusy(null); }
  };

  const approve = async (item: RateIntake) => {
    setBusy(item.id);
    try { await recon.approveRateIntake(item, reviewedBy); setToast('Rate approved → rule created.'); await load(); }
    catch (e) { setToast(e instanceof Error ? e.message : 'Approve failed.'); }
    finally { setBusy(null); }
  };
  const reject = async (item: RateIntake) => {
    setBusy(item.id);
    try { await recon.rejectRateIntake(item.id, reviewedBy); await load(); }
    catch (e) { setToast(e instanceof Error ? e.message : 'Reject failed.'); }
    finally { setBusy(null); }
  };

  if (loading) return <Spinner label="Loading rates…" />;
  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-6">
      {toast && (
        <div className="text-xs bg-slate-900 text-white rounded-lg px-3 py-2 flex items-center justify-between">
          <span>{toast}</span><button onClick={() => setToast(null)}><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Coverage indicator */}
      <Card title="Rule coverage" subtitle="Active ledger policies with NO matching rate. This is the expected-side health metric — feed rates to shrink it.">
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <div className="text-4xl font-bold font-mono text-amber-600">{totalUnpriced}</div>
            <div className="text-[11px] text-slate-500">policies unpriced</div>
          </div>
          <div className="flex-1 min-w-[240px] space-y-1">
            {coverage.filter((c) => c.unpriced > 0).slice(0, 6).map((c) => (
              <div key={c.carrier} className="flex items-center gap-2 text-xs">
                <span className="w-40 truncate text-slate-600">{c.carrier}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                  <div className="h-full bg-amber-400" style={{ width: `${(c.unpriced / Math.max(c.ledgerPolicies, 1)) * 100}%` }} />
                </div>
                <span className="font-mono text-slate-500 w-16 text-right">{c.unpriced}/{c.ledgerPolicies}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Rate intake review queue */}
      <Card title="Rate intake review" subtitle={`${intake.length} pending · approve writes a rule with provenance (the in-app twin of the Slack card, §10)`}>
        {intake.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 text-center">No rate sheets awaiting review.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {intake.map((it) => (
              <div key={it.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-800">{it.canonicalCarrier ?? it.carrierName}</div>
                  <SourceBadge source={it.sourceType} />
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">{it.lob} {it.state ? `· ${it.state}` : ''}</div>
                <div className="mt-2 flex gap-3 text-xs font-mono">
                  <span>NB <b className="text-slate-800">{it.proposedNbPercent ?? '—'}%</b></span>
                  <span>Renewal <b className="text-slate-800">{it.proposedRenewalPercent ?? '—'}%</b></span>
                  <span className={`ml-auto ${confTone[it.confidence] ?? 'text-slate-500'}`}>{it.confidence}</span>
                </div>
                {it.sourceDocument && <div className="text-[10px] text-slate-400 mt-1 truncate">from {it.sourceDocument}</div>}
                <div className="mt-3 flex gap-2">
                  <button disabled={busy === it.id} onClick={() => approve(it)}
                    className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded px-2 py-1.5">
                    <ThumbsUp className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button disabled={busy === it.id} onClick={() => reject(it)}
                    className="inline-flex items-center justify-center gap-1 text-xs text-slate-600 hover:text-red-600 border border-slate-200 rounded px-2 py-1.5">
                    <ThumbsDown className="w-3.5 h-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Rules table with provenance */}
      <Card
        title="Commission rules"
        subtitle="Inline-edit a rate → stamps manual provenance + today's confirmed date. Rule writes require an admin account."
        right={
          <div className="flex items-center gap-2">
            <select value={carrierFilter} onChange={(e) => setCarrierFilter(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white max-w-[180px]">
              {carriers.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'confidence' | 'confirmed')}
              className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
              <option value="confidence">Low confidence first</option>
              <option value="confirmed">Stalest first</option>
            </select>
          </div>
        }
      >
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs min-w-[720px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="text-left py-2 px-2">Carrier</th>
                <th className="text-left px-2">LOB</th>
                <th className="text-left px-2">State</th>
                <th className="text-right px-2">NB %</th>
                <th className="text-right px-2">Renewal %</th>
                <th className="text-left px-2">Source</th>
                <th className="text-left px-2">Conf.</th>
                <th className="text-left px-2">Confirmed</th>
                <th className="px-2"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 px-2 font-medium text-slate-700">{r.carrierName}</td>
                  <td className="px-2 text-slate-600">{r.lob ?? '—'}</td>
                  <td className="px-2 text-slate-400">{r.state ?? '—'}</td>
                  {editing === r.id ? (
                    <>
                      <td className="px-2 text-right"><input value={editNb} onChange={(e) => setEditNb(e.target.value)} className="w-14 border border-slate-300 rounded px-1 py-0.5 text-right font-mono" /></td>
                      <td className="px-2 text-right"><input value={editRen} onChange={(e) => setEditRen(e.target.value)} className="w-14 border border-slate-300 rounded px-1 py-0.5 text-right font-mono" /></td>
                      <td colSpan={3} className="px-2 text-[10px] text-slate-400">saving stamps source=manual</td>
                      <td className="px-2 flex gap-1">
                        <button disabled={busy === r.id} onClick={() => saveEdit(r.id)} className="text-emerald-600"><Check className="w-4 h-4" /></button>
                        <button onClick={() => setEditing(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 text-right font-mono text-slate-800">{r.nbPercent ?? '—'}</td>
                      <td className="px-2 text-right font-mono text-slate-800">{r.renewalPercent ?? <span className="text-red-500">none</span>}</td>
                      <td className="px-2"><SourceBadge source={r.sourceType} /></td>
                      <td className={`px-2 font-semibold ${confTone[r.confidence ?? ''] ?? 'text-slate-400'}`}>{r.confidence ?? '—'}</td>
                      <td className="px-2 text-slate-400 font-mono">{r.lastConfirmedDate ?? '—'}</td>
                      <td className="px-2">
                        <button onClick={() => startEdit(r)} className="text-slate-400 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={9} className="text-center text-slate-400 py-6">No rules for this filter.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-3 flex items-center gap-1">
          <ShieldCheck className="w-3 h-3" /> Rate history is never deleted — edits supersede, they don't overwrite the audit trail (§10).
        </p>
      </Card>
    </div>
  );
}
