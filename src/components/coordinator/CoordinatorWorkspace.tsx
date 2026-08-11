/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Beginner-first Coordinator Workspace — sole-job UI for a WFH hire who
 * prepares statements but never approves money.
 */

import React, { useState } from 'react';
import {
  BookOpen, CalendarDays, ClipboardList, HelpCircle, LogOut, OctagonAlert,
  ScrollText, UploadCloud, Wallet,
} from 'lucide-react';
import type { ControlEntry } from '../../data/coordinatorRepository';
import { OverridingRuleBanner } from './shared';
import { ThisWeekTab, ControlLogTab } from './ControlLogTabs';
import ProcessStatementWizard from './ProcessStatementWizard';
import WaitingOnManagerTab from './WaitingOnManagerTab';
import AgencyBillDesk from './AgencyBillDesk';
import EscalateTab from './EscalateTab';
import GlossaryTab from './GlossaryTab';
import HowThisJobWorksTab from './HowThisJobWorksTab';

type Tab =
  | 'week'
  | 'control'
  | 'process'
  | 'waiting'
  | 'agency'
  | 'escalate'
  | 'glossary'
  | 'guide';

const TABS: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
  { key: 'week', label: 'This week', icon: <CalendarDays className="w-4 h-4" /> },
  { key: 'control', label: 'Control Log', icon: <ClipboardList className="w-4 h-4" /> },
  { key: 'process', label: 'Process statement', icon: <UploadCloud className="w-4 h-4" /> },
  { key: 'waiting', label: 'Waiting on manager', icon: <ScrollText className="w-4 h-4" /> },
  { key: 'agency', label: 'Agency bill', icon: <Wallet className="w-4 h-4" /> },
  { key: 'escalate', label: 'Escalate', icon: <OctagonAlert className="w-4 h-4" /> },
  { key: 'glossary', label: 'Glossary', icon: <BookOpen className="w-4 h-4" /> },
  { key: 'guide', label: 'How this job works', icon: <HelpCircle className="w-4 h-4" /> },
];

export default function CoordinatorWorkspace({
  email, signOut, canApprove = false,
}: {
  email: string | null;
  signOut: () => void;
  canApprove?: boolean;
}) {
  const [tab, setTab] = useState<Tab>('week');
  const [processPrefill, setProcessPrefill] = useState<ControlEntry | null>(null);

  return (
    <div className="min-h-screen bg-stone-50 text-slate-900">
      <header className="bg-slate-900 text-white border-b border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold tracking-tight">Commission Statement Coordinator</h1>
              <p className="text-slate-400 text-[11px]">Collect · document · validate · prepare — Risk Solutions Group</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {email && <span className="text-[11px] font-mono px-2 py-1 rounded-md bg-slate-800 border border-slate-700">{email}</span>}
              <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-amber-500/20 text-amber-100 border border-amber-500/30">
                {canApprove ? 'Approver view' : 'Coordinator — no approval'}
              </span>
              <button onClick={signOut} type="button" className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg border border-slate-700 flex items-center gap-1.5">
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            </div>
          </div>
          <nav className="flex flex-wrap gap-1.5 mt-4">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                  tab === t.key ? 'bg-white text-slate-900' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {tab !== 'glossary' && tab !== 'guide' && <OverridingRuleBanner />}
        {tab === 'week' && (
          <ThisWeekTab
            onOpenProcess={(entry) => { setProcessPrefill(entry); setTab('process'); }}
            onOpenEscalate={() => setTab('escalate')}
          />
        )}
        {tab === 'control' && <ControlLogTab email={email} />}
        {tab === 'process' && (
          <div key={processPrefill?.id ?? 'blank'}>
            <ProcessStatementWizard
              email={email}
              prefill={processPrefill}
              onEscalate={() => setTab('escalate')}
            />
          </div>
        )}
        {tab === 'waiting' && <WaitingOnManagerTab email={email} />}
        {tab === 'agency' && <AgencyBillDesk email={email} canApprove={canApprove} />}
        {tab === 'escalate' && <EscalateTab email={email} />}
        {tab === 'glossary' && <GlossaryTab />}
        {tab === 'guide' && <HowThisJobWorksTab />}
      </main>
    </div>
  );
}
