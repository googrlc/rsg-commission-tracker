/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import {
  GLOSSARY, SYSTEMS, CONTROL_STATUSES, EXCEPTION_REASONS, ESCALATE_REASONS, SEVERITY_PLAIN, OVERRIDING_RULE,
} from '../../content/commissionGlossary';

export default function GlossaryTab() {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return GLOSSARY;
    return GLOSSARY.filter(
      (g) => g.term.toLowerCase().includes(needle) || g.plain.toLowerCase().includes(needle),
    );
  }, [q]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Glossary</h2>
        <p className="text-sm text-slate-600 mt-1">
          Short definitions for someone new to insurance commissions. Hover the info icons elsewhere in the app for the same text.
        </p>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search terms…"
          className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
      </div>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <h3 className="font-bold mb-1">Overriding rule</h3>
        <p>{OVERRIDING_RULE}</p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Terms</h3>
        {filtered.map((g) => (
          <div key={g.id} className="border-b border-slate-100 pb-3">
            <div className="font-semibold text-slate-900">{g.term}</div>
            <p className="text-sm text-slate-600 mt-0.5">{g.plain}</p>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-slate-500">No matches.</p>}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Control Log statuses</h3>
        {CONTROL_STATUSES.map((s) => (
          <div key={s.value} className="text-sm">
            <span className="font-medium text-slate-900">{s.label}</span>
            <span className="text-slate-600"> — {s.plain}</span>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Total difference severity</h3>
        {Object.entries(SEVERITY_PLAIN).map(([k, v]) => (
          <div key={k} className="text-sm"><span className="font-mono text-xs bg-slate-100 px-1 rounded">{k}</span> — {v}</div>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Exception reason codes</h3>
        <ul className="grid sm:grid-cols-2 gap-1 text-sm text-slate-700">
          {EXCEPTION_REASONS.map((r) => <li key={r}>• {r}</li>)}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Stop and escalate</h3>
        <ul className="space-y-1 text-sm text-slate-700">
          {ESCALATE_REASONS.map((r) => <li key={r.code}>• {r.label}</li>)}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Systems you use</h3>
        {SYSTEMS.map((s) => (
          <div key={s.name} className="text-sm">
            <span className="font-medium">{s.name}</span>
            <span className="text-slate-600"> — {s.use}</span>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <h3 className="font-bold mb-1">Approver-only actions</h3>
        <p>
          Approve or reject a batch, change commission rates, accept an unexplained difference,
          commit to the ledger, approve a write-off, authorize a carrier dispute, or release/refund money.
        </p>
      </section>
    </div>
  );
}
