/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Carrier Payment Calendar — its own page. A year-at-a-glance calendar of when each
 * carrier's commission closes + pays (EFT), computed automatically from
 * carrier_payment_schedule:
 *   - 'day_of_month' rule (e.g. GEICO pays the 7th) → computed per month, optionally
 *      rolled off weekends per weekend_rule.
 *   - 'explicit' published table (e.g. Progressive's closing schedule) → the stored dates.
 * Twelve mini month-grids highlight each carrier's pay (●) and close (○) days; a
 * per-carrier table lists the exact dates + weekday.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, LogOut, ArrowLeft } from 'lucide-react';
import type { CarrierPaymentSchedule } from '../../types';
import * as recon from '../../data/reconRepository';
import { Card, Spinner, ErrorNote } from './shared';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['S','M','T','W','T','F','S'];
const WEEKDAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

const COLORS: Record<string, { dot: string; ring: string; text: string; chip: string }> = {
  blue:    { dot: 'bg-blue-500',    ring: 'ring-blue-400',    text: 'text-blue-700',    chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  emerald: { dot: 'bg-emerald-500', ring: 'ring-emerald-400', text: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  amber:   { dot: 'bg-amber-500',   ring: 'ring-amber-400',   text: 'text-amber-700',   chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  violet:  { dot: 'bg-violet-500',  ring: 'ring-violet-400',  text: 'text-violet-700',  chip: 'bg-violet-50 text-violet-700 border-violet-200' },
  rose:    { dot: 'bg-rose-500',    ring: 'ring-rose-400',    text: 'text-rose-700',    chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  slate:   { dot: 'bg-slate-500',   ring: 'ring-slate-400',   text: 'text-slate-700',   chip: 'bg-slate-100 text-slate-700 border-slate-200' },
};
const color = (c: string) => COLORS[c] ?? COLORS.blue;

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
const daysIn = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();
const parseISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return { y, m0: m - 1, d }; };

/** Roll a (year, month, day) off a weekend per the rule; returns {m0,d} within calc. */
function rollWeekend(y: number, m0: number, d: number, rule: 'none' | 'prev' | 'next') {
  if (rule === 'none') return { y, m0, d };
  const dt = new Date(y, m0, d);
  const wd = dt.getDay();
  if (wd === 6) dt.setDate(dt.getDate() + (rule === 'next' ? 2 : -1)); // Sat
  else if (wd === 0) dt.setDate(dt.getDate() + (rule === 'next' ? 1 : -2)); // Sun
  return { y: dt.getFullYear(), m0: dt.getMonth(), d: dt.getDate() };
}

interface DayEvent { carrier: string; color: string; type: 'pay' | 'close' }

/** Build a map: 'YYYY-MM-DD' -> events, for the selected year + carriers. */
function buildEvents(schedules: CarrierPaymentSchedule[], year: number): Map<string, DayEvent[]> {
  const map = new Map<string, DayEvent[]>();
  const add = (k: string, e: DayEvent) => { const a = map.get(k) ?? []; a.push(e); map.set(k, a); };

  for (const s of schedules) {
    if (s.kind === 'day_of_month') {
      for (let m0 = 0; m0 < 12; m0++) {
        if (s.payDay) {
          const day = Math.min(s.payDay, daysIn(year, m0));
          const r = rollWeekend(year, m0, day, s.weekendRule);
          if (r.y === year) add(keyOf(r.y, r.m0, r.d), { carrier: s.carrierName, color: s.color, type: 'pay' });
        }
        if (s.closeDay) {
          const day = Math.min(s.closeDay, daysIn(year, m0));
          const r = rollWeekend(year, m0, day, s.weekendRule);
          if (r.y === year) add(keyOf(r.y, r.m0, r.d), { carrier: s.carrierName, color: s.color, type: 'close' });
        }
      }
    } else if (s.kind === 'explicit' && s.explicit) {
      for (const row of s.explicit) {
        if (row.pay) { const p = parseISO(row.pay); if (p.y === year) add(keyOf(p.y, p.m0, p.d), { carrier: s.carrierName, color: s.color, type: 'pay' }); }
        if (row.close) { const c = parseISO(row.close); if (c.y === year) add(keyOf(c.y, c.m0, c.d), { carrier: s.carrierName, color: s.color, type: 'close' }); }
      }
    }
  }
  return map;
}

export default function CarrierCalendarPage({
  email, signOut, onExit,
}: {
  email: string | null; signOut: () => void; onExit: () => void;
}) {
  const [schedules, setSchedules] = useState<CarrierPaymentSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState(2026);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const s = await recon.fetchPaymentSchedules();
        if (active) setSchedules(s);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load payment schedules.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const shown = useMemo(() => schedules.filter((s) => !hidden.has(s.carrierName)), [schedules, hidden]);
  const events = useMemo(() => buildEvents(shown, year), [shown, year]);
  const toggle = (c: string) => setHidden((h) => { const n = new Set(h); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const today = new Date();
  const todayKey = keyOf(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-violet-600 rounded-lg"><CalendarDays className="w-5 h-5" /></div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">Carrier Payment Calendar</h1>
                <p className="text-slate-400 text-[11px] font-mono">When each carrier's commission closes + pays (EFT), all year · auto-computed</p>
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
        {loading ? <Spinner label="Loading payment schedules…" />
          : error ? <ErrorNote message={error} />
          : schedules.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">No carrier payment schedules configured yet.</p>
          ) : (
          <>
            {/* Controls: year + carrier legend/toggles */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setYear((y) => y - 1)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-50">‹</button>
                <span className="text-lg font-bold font-mono w-16 text-center">{year}</span>
                <button type="button" onClick={() => setYear((y) => y + 1)} className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-sm hover:bg-slate-50">›</button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 mr-1">● pay · ○ close — click to toggle:</span>
                {schedules.map((s) => {
                  const c = color(s.color); const on = !hidden.has(s.carrierName);
                  return (
                    <button key={s.carrierName} type="button" onClick={() => toggle(s.carrierName)}
                      className={`text-[11px] font-semibold px-2 py-1 rounded-full border flex items-center gap-1.5 ${on ? c.chip : 'bg-slate-100 text-slate-400 border-slate-200 line-through'}`}>
                      <span className={`w-2 h-2 rounded-full ${on ? c.dot : 'bg-slate-300'}`} />
                      {s.carrierName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 12-month year calendar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {MONTHS.map((mName, m0) => (
                <React.Fragment key={m0}>
                  <MonthGrid year={year} m0={m0} mName={mName} events={events} todayKey={todayKey} />
                </React.Fragment>
              ))}
            </div>

            {/* Exact schedule per carrier */}
            {shown.map((s) => <React.Fragment key={s.id}><ScheduleTable s={s} year={year} /></React.Fragment>)}
          </>
        )}
      </main>
    </div>
  );
}

function MonthGrid({ year, m0, mName, events, todayKey }: {
  year: number; m0: number; mName: string; events: Map<string, DayEvent[]>; todayKey: string;
}) {
  const first = new Date(year, m0, 1).getDay();
  const total = daysIn(year, m0);
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="text-xs font-bold text-slate-700 mb-2">{mName} <span className="text-slate-400 font-mono">{year}</span></div>
      <div className="grid grid-cols-7 gap-0.5 text-[9px] text-slate-400 font-mono mb-1">
        {DOW.map((d, i) => <div key={i} className="text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const k = keyOf(year, m0, d);
          const evs = events.get(k) ?? [];
          const isToday = k === todayKey;
          const title = evs.length ? evs.map((e) => `${e.carrier} ${e.type === 'pay' ? 'EFT pay' : 'closing'}`).join('\n') : undefined;
          return (
            <div key={i} title={title}
              className={`aspect-square rounded flex flex-col items-center justify-center text-[10px] ${evs.length ? 'bg-slate-50' : ''} ${isToday ? 'ring-2 ring-slate-900' : ''}`}>
              <span className={`font-mono ${evs.length ? 'text-slate-800 font-semibold' : 'text-slate-500'}`}>{d}</span>
              {evs.length > 0 && (
                <span className="flex gap-0.5 mt-0.5 flex-wrap justify-center max-w-full">
                  {evs.slice(0, 3).map((e, j) => (
                    <span key={j} className={`w-1.5 h-1.5 rounded-full ${color(e.color).dot} ${e.type === 'close' ? 'ring-1 ring-inset ring-white opacity-60' : ''}`} />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleTable({ s, year }: { s: CarrierPaymentSchedule; year: number }) {
  const rows = useMemo(() => {
    const out: Array<{ month: string; close: string | null; pay: string | null }> = [];
    if (s.kind === 'explicit' && s.explicit) {
      for (const r of s.explicit) out.push({ month: MONTHS[(r.month - 1) % 12], close: r.close, pay: r.pay });
    } else if (s.kind === 'day_of_month') {
      for (let m0 = 0; m0 < 12; m0++) {
        const mk = (dayNum: number | null) => {
          if (!dayNum) return null;
          const day = Math.min(dayNum, daysIn(year, m0));
          const r = rollWeekend(year, m0, day, s.weekendRule);
          return keyOf(r.y, r.m0, r.d);
        };
        out.push({ month: MONTHS[m0], close: mk(s.closeDay), pay: mk(s.payDay) });
      }
    }
    return out;
  }, [s, year]);

  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    const { y, m0, d } = parseISO(iso);
    const wd = WEEKDAY[new Date(y, m0, d).getDay()];
    const weekend = wd === 'Sat' || wd === 'Sun';
    return `${iso} · ${wd}${weekend ? ' ⚠' : ''}`;
  };

  const c = color(s.color);
  return (
    <Card
      title={s.carrierName}
      subtitle={s.kind === 'explicit' ? `Published schedule${s.scheduleYear ? ` (${s.scheduleYear})` : ''}` : `Rule: pays day ${s.payDay} of each month${s.weekendRule !== 'none' ? ` · weekend → ${s.weekendRule === 'prev' ? 'prior' : 'next'} business day` : ''}`}
      right={<span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${c.chip} flex items-center gap-1.5`}><span className={`w-2 h-2 rounded-full ${c.dot}`} />{s.notes ?? ''}</span>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[420px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="text-left font-medium py-1.5 px-2">Commission month</th>
              <th className="text-left font-medium px-2">Closing date</th>
              <th className="text-left font-medium px-2">EFT pay date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-50">
                <td className="py-1.5 px-2 text-slate-700 font-medium">{r.month}</td>
                <td className="px-2 font-mono text-slate-500">{fmt(r.close)}</td>
                <td className="px-2 font-mono text-slate-800">{fmt(r.pay)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-400 mt-2">⚠ = falls on a weekend. Holidays aren't adjusted for.</p>
    </Card>
  );
}
