/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Standalone Commission Dashboard page (§11b) — the analytics views (book summary,
 * by line/carrier, NB vs renewal, segment, monthly trend, fee drag) as their OWN
 * top-level page, separate from the Commission Workspace tabs. Reuses DashboardTab
 * as the engine; this is just the full-page shell (header + nav out).
 */

import React from 'react';
import { BarChart3, LogOut, ArrowLeft, FileSpreadsheet } from 'lucide-react';
import DashboardTab from './DashboardTab';

export default function DashboardPage({
  email, signOut, onExit, onOpenWorkspace,
}: {
  email: string | null;
  signOut: () => void;
  onExit: () => void;
  onOpenWorkspace: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-600 rounded-lg"><BarChart3 className="w-5 h-5" /></div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">Commission Dashboard</h1>
                <p className="text-slate-400 text-[11px] font-mono">Book-wide analytics · reconciled statement money · Risk Solutions Group</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onOpenWorkspace}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1.5"
                title="Upload PDF / CSV / Excel commission statements"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> Upload Statement
              </button>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <DashboardTab />
      </main>
    </div>
  );
}
