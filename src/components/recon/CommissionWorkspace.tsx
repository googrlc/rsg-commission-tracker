/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Commission Workspace shell (§11) — hosts the statement-reconciliation tabs
 * (Reconciliation · Dashboard · Rates · Carriers) over the transaction layer.
 * Self-contained: its own nav + data; App enters it via one tab value and can
 * return to the classic Ledger/Rules view via onExit.
 */

import React, { useState } from 'react';
import { FileSpreadsheet, LogOut, ArrowLeft, ClipboardCheck, BarChart3, Percent, Building2 } from 'lucide-react';
import ReconciliationWorkspace from './ReconciliationWorkspace';
import StatementUpload from './StatementUpload';
import RatesTab from './RatesTab';
import DashboardTab from './DashboardTab';
import CarriersTab from './CarriersTab';

type Tab = 'reconciliation' | 'dashboard' | 'rates' | 'carriers';
const TABS: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
  { key: 'reconciliation', label: 'Reconciliation', icon: <ClipboardCheck className="w-4 h-4" /> },
  { key: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="w-4 h-4" /> },
  { key: 'rates', label: 'Rates', icon: <Percent className="w-4 h-4" /> },
  { key: 'carriers', label: 'Carriers', icon: <Building2 className="w-4 h-4" /> },
];

export default function CommissionWorkspace({
  email, signOut, onExit,
}: {
  email: string | null;
  signOut: () => void;
  onExit: () => void;
}) {
  const [tab, setTab] = useState<Tab>('reconciliation');
  const [prefill, setPrefill] = useState<{ carrier: string; lob: string | null } | null>(null);
  const [refresh, setRefresh] = useState(0);

  const fixRule = (carrier: string, lob: string | null) => { setPrefill({ carrier, lob }); setTab('rates'); };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-600 rounded-lg"><FileSpreadsheet className="w-5 h-5" /></div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">Commission Workspace</h1>
                <p className="text-slate-400 text-[11px] font-mono">Statement reconciliation · Risk Solutions Group</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={onExit} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 flex items-center gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" /> Ledger & rules
              </button>
              {email && <span className="text-[11px] text-slate-400 font-mono px-2 py-1 rounded-md bg-slate-800/60 border border-slate-700">{email}</span>}
              <button onClick={signOut} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg border border-slate-700 flex items-center gap-1.5">
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            </div>
          </div>
          <nav className="flex flex-wrap gap-1.5 mt-4">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => { setTab(t.key); if (t.key !== 'rates') setPrefill(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${tab === t.key ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {tab === 'reconciliation' && (
          <div className="space-y-6">
            <StatementUpload uploadedBy={email} onUploaded={() => setRefresh((r) => r + 1)} />
            <div key={refresh}><ReconciliationWorkspace onFixRule={fixRule} /></div>
          </div>
        )}
        {tab === 'dashboard' && <div key={refresh}><DashboardTab /></div>}
        {tab === 'rates' && <RatesTab prefill={prefill} reviewedBy={email} />}
        {tab === 'carriers' && <CarriersTab />}
      </main>
    </div>
  );
}
