/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Shared UI atoms for the reconciliation workspace tabs (Slices 2–3). Matches the
 * existing app styling (navy/slate, rounded cards, mono figures).
 */

import React from 'react';
import type { ReconStatus } from '../../types';

export { formatCurrency, formatCurrencyDecimal, formatPercentage } from '../../utils';

/** Signed money with red/emerald tone. */
export function DeltaMoney({ value }: { value: number | null | undefined }) {
  if (value == null || isNaN(value)) return <span className="text-slate-400">—</span>;
  const tone = value < 0 ? 'text-red-600' : value > 0 ? 'text-emerald-600' : 'text-slate-500';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return (
    <span className={`font-mono font-semibold ${tone}`}>
      {sign}${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  matched: { label: 'matched', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  underpaid: { label: 'underpaid', cls: 'bg-red-50 text-red-700 border-red-200' },
  overpaid: { label: 'overpaid', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  no_expected: { label: 'no rule', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  missing_statement: { label: 'missing stmt', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  unmatched_statement: { label: 'not in ledger', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  rolled_up: { label: 'rolled up', cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

export function StatusBadge({ status }: { status: ReconStatus | string }) {
  const s = STATUS_STYLE[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function Card({ title, subtitle, right, children }: {
  title?: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      {(title || right) && (
        <div className="flex items-start justify-between mb-4">
          <div>
            {title && <h4 className="text-sm font-bold text-slate-800">{title}</h4>}
            {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-slate-500 text-xs py-6 justify-center">
      <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg p-3">{message}</div>
  );
}

export function monthLabel(monthKey: number): string {
  const s = String(monthKey);
  if (s.length !== 6) return s;
  const y = s.slice(0, 4), m = Number(s.slice(4, 6));
  const names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[m] ?? m} ${y.slice(2)}`;
}
