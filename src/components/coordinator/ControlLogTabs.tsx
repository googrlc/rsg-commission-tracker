/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { CONTROL_STATUSES } from '../../content/commissionGlossary';
import * as coord from '../../data/coordinatorRepository';
import { TermTip } from './shared';

function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(d = new Date()) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

function plainNextAction(e: coord.ControlEntry): string {
  if (e.next_action) return e.next_action;
  switch (e.status) {
    case 'ready_to_retrieve':
      return `Sign into ${e.carrier_name} and download the ${e.statement_period} statement.`;
    case 'retrieved':
      return `Upload the ${e.carrier_name} ${e.statement_period} file using Process statement.`;
    case 'uploaded_pending_review':
      return 'Finish the checklist and submit for manager approval.';
    case 'needs_review':
    case 'needs_mapping':
      return 'Document the issue and escalate if you cannot fix the file.';
    case 'missing_from_carrier':
      return 'Recheck the portal Friday; note what you saw.';
    case 'rejected_correction':
      return 'Read the manager’s return notes, correct, and resubmit.';
    default:
      return 'Open the Control Log row and set the next clear status.';
  }
}

type Filter =
  | 'due_this_week'
  | 'missing_last_week'
  | 'pending_your_review'
  | 'waiting_on_manager'
  | 'agency_bill_due'
  | 'all';

export function ThisWeekTab({
  onOpenProcess, onOpenEscalate,
}: {
  onOpenProcess?: (entry: coord.ControlEntry) => void;
  onOpenEscalate?: () => void;
}) {
  const [rows, setRows] = useState<coord.ControlEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('due_this_week');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await coord.listControlEntries());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Control Log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const weekStart = startOfWeek();
    const weekEnd = endOfWeek();
    const lastWeekStart = new Date(weekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(weekStart);
    lastWeekEnd.setMilliseconds(-1);

    return rows.filter((r) => {
      const expected = r.expected_statement_date ? new Date(r.expected_statement_date) : null;
      switch (filter) {
        case 'due_this_week':
          return (
            ['ready_to_retrieve', 'retrieved', 'missing_from_carrier'].includes(r.status)
            || (expected != null && expected >= weekStart && expected <= weekEnd)
          );
        case 'missing_last_week':
          return (
            r.status === 'missing_from_carrier'
            || (expected != null && expected >= lastWeekStart && expected <= lastWeekEnd
              && !['approved', 'closed'].includes(r.status))
          );
        case 'pending_your_review':
          return ['uploaded_pending_review', 'needs_review', 'needs_mapping', 'retrieved'].includes(r.status);
        case 'waiting_on_manager':
          return r.status === 'uploaded_pending_review';
        case 'agency_bill_due':
          return r.billing_mode === 'agency_bill' && !['closed', 'approved', 'not_due'].includes(r.status);
        default:
          return true;
      }
    });
  }, [rows, filter]);

  const filters: Array<{ key: Filter; label: string }> = [
    { key: 'due_this_week', label: 'Due this week' },
    { key: 'missing_last_week', label: 'Missing last week' },
    { key: 'pending_your_review', label: 'Pending your review' },
    { key: 'waiting_on_manager', label: 'Waiting on manager' },
    { key: 'agency_bill_due', label: 'Agency-bill due' },
    { key: 'all', label: 'All open-ish' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">This week</h2>
        <p className="text-sm text-slate-600">What should you do today? Pick a row and follow the next action.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium ${
              filter === f.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button type="button" onClick={() => void load()} className="px-2.5 py-1 rounded-md text-xs bg-white border border-slate-200">
          Refresh
        </button>
        {onOpenEscalate && (
          <button type="button" onClick={onOpenEscalate} className="px-2.5 py-1 rounded-md text-xs bg-amber-100 text-amber-900 border border-amber-200">
            Escalate something
          </button>
        )}
      </div>
      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-3">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <p className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg p-6">
          Nothing in this filter. Ask your manager to seed the Control Log if it is empty.
        </p>
      )}
      <ul className="space-y-2">
        {filtered.map((r) => {
          const status = CONTROL_STATUSES.find((s) => s.value === r.status);
          return (
            <li key={r.id} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">
                    {r.carrier_name}
                    {r.producer_code ? <span className="text-slate-500 font-mono text-xs ml-2">{r.producer_code}</span> : null}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Period {r.statement_period}
                    {r.expected_statement_date ? ` · expected ${r.expected_statement_date}` : ''}
                    {' · '}
                    <TermTip glossaryId={r.billing_mode === 'agency_bill' ? 'agency-bill' : 'direct-bill'}>
                      {r.billing_mode === 'agency_bill' ? 'Agency bill' : 'Direct bill'}
                    </TermTip>
                  </div>
                </div>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-800" title={status?.plain}>
                  {status?.label ?? r.status}
                </span>
              </div>
              <p className="text-sm text-slate-800 mt-2">{plainNextAction(r)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {onOpenProcess && (
                  <button
                    type="button"
                    onClick={() => onOpenProcess(r)}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    Process this statement
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ControlLogTab({ email }: { email: string | null }) {
  const [rows, setRows] = useState<coord.ControlEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    carrier_name: '',
    producer_code: '',
    statement_period: '',
    expected_statement_date: '',
    portal_url: '',
    billing_mode: 'direct_bill' as 'direct_bill' | 'agency_bill',
    payment_model: 'unknown' as coord.ControlEntry['payment_model'],
    status: 'ready_to_retrieve',
    next_action: '',
  });

  const load = async () => {
    try {
      setRows(await coord.listControlEntries());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    }
  };
  useEffect(() => { void load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.carrier_name.trim() || !form.statement_period.trim()) {
      setError('Carrier and statement period are required. Do not invent a carrier from a filename — escalate instead.');
      return;
    }
    setSaving(true);
    try {
      await coord.upsertControlEntry({
        carrier_name: form.carrier_name.trim(),
        producer_code: form.producer_code.trim() || null,
        statement_period: form.statement_period.trim(),
        expected_statement_date: form.expected_statement_date || null,
        portal_url: form.portal_url.trim() || null,
        billing_mode: form.billing_mode,
        payment_model: form.payment_model,
        status: form.status,
        next_action: form.next_action.trim() || null,
        prepared_by: email,
      });
      setForm({
        carrier_name: '', producer_code: '', statement_period: '', expected_statement_date: '',
        portal_url: '', billing_mode: 'direct_bill', payment_model: 'unknown',
        status: 'ready_to_retrieve', next_action: '',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: string, status: string) => {
    try {
      await coord.upsertControlEntry({
        id,
        carrier_name: rows.find((r) => r.id === id)!.carrier_name,
        statement_period: rows.find((r) => r.id === id)!.statement_period,
        status,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold">Carrier Control Log</h2>
        <p className="text-sm text-slate-600">
          The register of what is due, retrieved, missing, and approved. Never leave a blank status.
          If the carrier is not in the register, stop and notify management — do not create one from a filename alone.
        </p>
      </div>
      {error && <p className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-3">{error}</p>}

      <form onSubmit={create} className="rounded-lg border border-slate-200 bg-slate-50 p-4 grid sm:grid-cols-2 gap-3">
        <h3 className="sm:col-span-2 text-sm font-bold">Add a control row (manager-approved carriers only)</h3>
        <label className="text-xs font-medium">Carrier / MGA
          <input className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={form.carrier_name}
            onChange={(e) => setForm({ ...form, carrier_name: e.target.value })} required />
        </label>
        <label className="text-xs font-medium">
          <TermTip glossaryId="producer-code">Producer code</TermTip>
          <input className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={form.producer_code}
            onChange={(e) => setForm({ ...form, producer_code: e.target.value })} />
        </label>
        <label className="text-xs font-medium">Statement period (e.g. 2026-07)
          <input className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={form.statement_period}
            onChange={(e) => setForm({ ...form, statement_period: e.target.value })} required />
        </label>
        <label className="text-xs font-medium">Expected statement date
          <input type="date" className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={form.expected_statement_date}
            onChange={(e) => setForm({ ...form, expected_statement_date: e.target.value })} />
        </label>
        <label className="text-xs font-medium">Portal URL
          <input className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={form.portal_url}
            onChange={(e) => setForm({ ...form, portal_url: e.target.value })} />
        </label>
        <label className="text-xs font-medium">Billing mode
          <select className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={form.billing_mode}
            onChange={(e) => setForm({ ...form, billing_mode: e.target.value as 'direct_bill' | 'agency_bill' })}>
            <option value="direct_bill">Direct bill</option>
            <option value="agency_bill">Agency bill</option>
          </select>
        </label>
        <label className="text-xs font-medium">Payment model
          <select className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={form.payment_model}
            onChange={(e) => setForm({ ...form, payment_model: e.target.value as coord.ControlEntry['payment_model'] })}>
            <option value="unknown">Unknown — confirm later</option>
            <option value="advance">Advance</option>
            <option value="as_earned">As-earned</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </label>
        <label className="text-xs font-medium">Status
          <select className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {CONTROL_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="sm:col-span-2 text-xs font-medium">Next action (plain English)
          <input className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm" value={form.next_action}
            onChange={(e) => setForm({ ...form, next_action: e.target.value })}
            placeholder="Sign into Progressive and download July statement" />
        </label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={saving} className="px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg">
            {saving ? 'Saving…' : 'Add to Control Log'}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Carrier</th>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Expected</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Next action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium">{r.carrier_name}
                  <div className="text-[10px] text-slate-500 font-mono">{r.producer_code}</div>
                </td>
                <td className="px-3 py-2">{r.statement_period}</td>
                <td className="px-3 py-2">{r.expected_statement_date ?? '—'}</td>
                <td className="px-3 py-2">
                  <select
                    className="border rounded px-1.5 py-1 text-xs w-full max-w-[180px]"
                    value={r.status}
                    onChange={(e) => void setStatus(r.id, e.target.value)}
                  >
                    {CONTROL_STATUSES.map((s) => (
                      <option key={s.value} value={s.value} title={s.plain}>{s.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-slate-700">{r.next_action || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-4 text-sm text-slate-500">No control rows yet.</p>
        )}
      </div>
    </div>
  );
}
