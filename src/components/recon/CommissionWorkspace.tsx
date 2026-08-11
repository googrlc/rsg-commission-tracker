/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Commission Workspace shell (§11) — hosts the statement tabs
 * (Upload · Reconciliation · Dashboard · Rates · Carriers) over the
 * transaction layer. Upload is its own tab so the money-gate is not buried
 * above the exception queue. Self-contained: its own nav + data; App enters
 * it via one tab value and can return to the classic Ledger/Rules view via
 * onExit.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  FileSpreadsheet, LogOut, ArrowLeft, ClipboardCheck, BarChart3, Percent, Building2, UploadCloud,
} from 'lucide-react';
import ReconciliationWorkspace from './ReconciliationWorkspace';
import StatementUpload from './StatementUpload';
import RatesTab from './RatesTab';
import DashboardTab from './DashboardTab';
import CarriersTab from './CarriersTab';
import { PendingApprovalQueue } from '../coordinator/WaitingOnManagerTab';

type Tab = 'upload' | 'reconciliation' | 'dashboard' | 'rates' | 'carriers';
const TABS: Array<{ key: Tab; label: string; icon: React.ReactNode; emphasize?: boolean }> = [
  { key: 'upload', label: 'Upload Statement', icon: <UploadCloud className="w-4 h-4" />, emphasize: true },
  { key: 'reconciliation', label: 'Reconciliation', icon: <ClipboardCheck className="w-4 h-4" /> },
  { key: 'dashboard', label: 'Dashboard', icon: <BarChart3 className="w-4 h-4" /> },
  { key: 'rates', label: 'Rates', icon: <Percent className="w-4 h-4" /> },
  { key: 'carriers', label: 'Carriers', icon: <Building2 className="w-4 h-4" /> },
];

export default function CommissionWorkspace({
  email, signOut, onExit, focusUpload = true, canApprove = true,
}: {
  email: string | null;
  signOut: () => void;
  onExit: () => void;
  /** When true (default), land on Upload so the ingest path is obvious. */
  focusUpload?: boolean;
  canApprove?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(focusUpload ? 'upload' : 'reconciliation');
  const [prefill, setPrefill] = useState<{ carrier: string; lob: string | null } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [showPending, setShowPending] = useState(false);
  const uploadAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusUpload) {
      setTab('upload');
      // Scroll the drop zone into view when arriving from the home CTA / #upload.
      requestAnimationFrame(() => {
        uploadAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [focusUpload]);

  const fixRule = (carrier: string, lob: string | null) => { setPrefill({ carrier, lob }); setTab('rates'); };

  const afterUpload = () => {
    setRefresh((r) => r + 1);
    setTab('reconciliation');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-500 rounded-lg"><UploadCloud className="w-5 h-5 text-slate-950" /></div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">Commission Workspace</h1>
                <p className="text-slate-400 text-[11px] font-mono">Upload PDF · CSV · Excel → review → book · Risk Solutions Group</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canApprove && (
                <button
                  type="button"
                  onClick={() => setShowPending((v) => !v)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg"
                >
                  Pending approval
                </button>
              )}
              <button
                type="button"
                onClick={() => setTab('upload')}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
              >
                <UploadCloud className="w-3.5 h-3.5" /> Upload Statement
              </button>
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
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition ${
                  tab === t.key
                    ? (t.emphasize ? 'bg-emerald-400 text-slate-950 font-bold' : 'bg-white text-slate-900')
                    : (t.emphasize ? 'bg-emerald-700/80 text-emerald-50 hover:bg-emerald-600 font-semibold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700')
                }`}>
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {showPending && canApprove && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <PendingApprovalQueue email={email} canApprove={canApprove} />
          </div>
        )}
        {tab === 'upload' && (
          <div ref={uploadAnchorRef} className="max-w-3xl space-y-6 scroll-mt-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-950">
              <div className="flex items-start gap-2">
                <FileSpreadsheet className="w-4 h-4 mt-0.5 shrink-0 text-emerald-700" />
                <div>
                  <p className="font-semibold">Pull in a carrier commission report</p>
                  <p className="text-xs text-emerald-900/80 mt-0.5">
                    Accepts <b>.pdf</b>, <b>.csv</b>, and <b>.xlsx</b>. The file is parsed and staged first —
                    you review the match preview, then approve to book money into the ledger.
                  </p>
                </div>
              </div>
            </div>
            <StatementUpload uploadedBy={email} onUploaded={afterUpload} canApprove={canApprove} />
          </div>
        )}
        {tab === 'reconciliation' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                Exceptions and policy-month health after statements are booked.
              </p>
              <button
                type="button"
                onClick={() => setTab('upload')}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5"
              >
                <UploadCloud className="w-3.5 h-3.5" /> Upload another statement
              </button>
            </div>
            <div key={refresh}><ReconciliationWorkspace onFixRule={fixRule} /></div>
          </div>
        )}
        {tab === 'dashboard' && <div key={refresh}><DashboardTab /></div>}
        {tab === 'rates' && <RatesTab prefill={prefill} reviewedBy={email} canApprove={canApprove} />}
        {tab === 'carriers' && <CarriersTab />}
      </main>
    </div>
  );
}
