/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Beginner Process Statement wizard — SOP steps 1–15. No Approve & book.
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, UploadCloud,
} from 'lucide-react';
import * as finance from '../../data/financeApi';
import type { ControlEntry } from '../../data/coordinatorRepository';
import {
  EXCEPTION_REASONS, differenceSeverity, SEVERITY_PLAIN, CONTROL_STATUSES,
} from '../../content/commissionGlossary';
import { OverridingRuleBanner, TermTip } from './shared';
import * as coord from '../../data/coordinatorRepository';

const STEPS = [
  'Control record',
  'Portal rules',
  'Find statement',
  'Download',
  'Filename',
  'Control totals',
  'Upload',
  'Classification',
  'Extraction check',
  'Totals',
  'Policy match',
  'Payment model',
  'Exceptions',
  'Summary',
  'Submit',
] as const;

type Checklist = {
  controlConfirmed: boolean;
  portalRemindersAck: boolean;
  identityChecked: boolean;
  downloadedOriginal: boolean;
  downloadedBothFormats: boolean;
  filename: string;
  carrier: string;
  producerCode: string;
  statementPeriod: string;
  statementDate: string;
  paymentDate: string;
  statementNumber: string;
  rowCount: string;
  grossPremium: string;
  totalPositive: string;
  totalChargebacks: string;
  netCommission: string;
  paymentRef: string;
  noCarrierTotal: boolean;
  classification: 'statement' | 'rate_sheet' | 'both' | 'needs_mapping' | '';
  ocrSpotCheck: boolean;
  paymentModel: 'advance' | 'as_earned' | 'hybrid' | 'unknown';
  paymentModelNote: string;
  policyMatchNotes: string;
  exceptions: Array<{ reason: string; amount: string; explanation: string }>;
  recommended: 'ready_for_approval' | 'needs_review';
};

const emptyChecklist = (prefill?: ControlEntry | null): Checklist => ({
  controlConfirmed: false,
  portalRemindersAck: false,
  identityChecked: false,
  downloadedOriginal: false,
  downloadedBothFormats: false,
  filename: '',
  carrier: prefill?.carrier_name ?? '',
  producerCode: prefill?.producer_code ?? '',
  statementPeriod: prefill?.statement_period ?? '',
  statementDate: '',
  paymentDate: '',
  statementNumber: '',
  rowCount: '',
  grossPremium: '',
  totalPositive: '',
  totalChargebacks: '',
  netCommission: '',
  paymentRef: '',
  noCarrierTotal: false,
  classification: '',
  ocrSpotCheck: false,
  paymentModel: prefill?.payment_model ?? 'unknown',
  paymentModelNote: '',
  policyMatchNotes: '',
  exceptions: [],
  recommended: 'ready_for_approval',
});

export default function ProcessStatementWizard({
  email,
  prefill,
  onEscalate,
}: {
  email: string | null;
  prefill?: ControlEntry | null;
  onEscalate?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [ck, setCk] = useState<Checklist>(() => emptyChecklist(prefill));
  const [batch, setBatch] = useState<finance.StagedBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestedName = useMemo(() => {
    const d = new Date().toISOString().slice(0, 10);
    const carrier = (ck.carrier || 'Carrier').replace(/\s+/g, '');
    const period = ck.statementPeriod || 'YYYY-MM';
    const code = ck.producerCode || 'ProducerCode';
    return `${d}_${carrier}_${period}_${code}_CommissionStatement.pdf`;
  }, [ck.carrier, ck.statementPeriod, ck.producerCode]);

  const parsedVsCarrier = useMemo(() => {
    const parsed = batch?.crosscheck.parsed_total_commission ?? null;
    const stated = ck.noCarrierTotal
      ? null
      : (ck.netCommission ? Number(ck.netCommission) : batch?.crosscheck.stated_total_commission ?? null);
    const diff = parsed != null && stated != null ? parsed - stated : null;
    const severity = differenceSeverity(diff, !ck.noCarrierTotal && stated != null);
    return { parsed, stated, diff, severity };
  }, [batch, ck.netCommission, ck.noCarrierTotal]);

  const set = <K extends keyof Checklist>(key: K, value: Checklist[K]) => {
    setCk((prev) => ({ ...prev, [key]: value }));
  };

  const canNext = (): boolean => {
    switch (step) {
      case 0: return ck.controlConfirmed && !!ck.carrier && !!ck.statementPeriod;
      case 1: return ck.portalRemindersAck;
      case 2: return ck.identityChecked;
      case 3: return ck.downloadedOriginal;
      case 4: return ck.filename.trim().length > 0;
      case 5: return ck.noCarrierTotal || ck.netCommission.trim().length > 0;
      case 6: return !!batch?.batch_id;
      case 7: return !!ck.classification;
      case 8: return !batch?.is_ocr || ck.ocrSpotCheck;
      case 9: return true;
      case 10: return true;
      case 11: return ck.paymentModel !== 'unknown' || ck.paymentModelNote.includes('requires confirmation') || ck.paymentModelNote.length > 0;
      case 12: return true;
      case 13: return true;
      case 14: return !!email && !!batch?.batch_id;
      default: return true;
    }
  };

  const upload = async (file: File) => {
    if (!email) {
      setMessage('Sign in with your own account before uploading.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const staged = await finance.stageStatement({
        file,
        uploadedBy: email,
        carrier: ck.carrier || undefined,
        statedCommission: ck.noCarrierTotal ? undefined : (ck.netCommission || undefined),
        statedPremium: ck.grossPremium || undefined,
      });
      setBatch(staged);
      if (!ck.filename) set('filename', file.name);
      if (staged.duplicate_of) {
        setMessage('System flagged a duplicate. Do not upload again — compare filename/period/batch and escalate if totals differ.');
        set('recommended', 'needs_review');
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!email || !batch?.batch_id) return;
    setBusy(true);
    setMessage(null);
    try {
      const checklist = {
        ...ck,
        suggestedFilename: suggestedName,
        difference: parsedVsCarrier,
        batch_id: batch.batch_id,
        warnings: batch.warnings,
        crosscheck: batch.crosscheck,
        preparedAt: new Date().toISOString(),
      };
      await finance.handoffStatement(batch.batch_id, email, {
        handoffStatus: 'ready_for_approval',
        prepChecklist: checklist,
      });
      if (prefill?.id) {
        await coord.upsertControlEntry({
          id: prefill.id,
          carrier_name: ck.carrier || prefill.carrier_name,
          statement_period: ck.statementPeriod || prefill.statement_period,
          status: ck.recommended === 'needs_review' ? 'needs_review' : 'uploaded_pending_review',
          batch_id: batch.batch_id,
          original_filename: ck.filename,
          net_commission: ck.netCommission ? Number(ck.netCommission) : null,
          carrier_stated_total: parsedVsCarrier.stated,
          parsed_total: parsedVsCarrier.parsed,
          total_difference: parsedVsCarrier.diff,
          difference_severity: parsedVsCarrier.severity,
          payment_model: ck.paymentModel,
          prepared_by: email,
          next_action: 'Waiting on manager approval — after approval, reopen and read the record back.',
        });
      }
      setDone(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Handoff failed');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-xl space-y-4">
        <OverridingRuleBanner />
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6">
          <CheckCircle2 className="w-8 h-8 text-emerald-700 mb-2" />
          <h2 className="text-lg font-bold text-emerald-950">Submitted for approval</h2>
          <p className="text-sm text-emerald-900 mt-2">
            You stopped at the money gate — correctly. Your manager will approve or return the batch.
            After they approve, reopen the saved record and verify it can be read back. A success message alone is not enough.
          </p>
          <button
            type="button"
            className="mt-4 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-900 text-white"
            onClick={() => {
              setDone(false);
              setStep(0);
              setBatch(null);
              setCk(emptyChecklist(null));
            }}
          >
            Process another statement
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      <OverridingRuleBanner />
      <div>
        <h2 className="text-lg font-bold">Process one statement</h2>
        <p className="text-sm text-slate-600">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}. Follow each screen. If unsure, escalate — do not guess.
        </p>
      </div>

      <div className="flex flex-wrap gap-1">
        {STEPS.map((label, i) => (
          <span
            key={label}
            className={`text-[10px] px-1.5 py-0.5 rounded ${i === step ? 'bg-slate-900 text-white' : i < step ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-500'}`}
          >
            {i + 1}
          </span>
        ))}
      </div>

      {message && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{message}</span>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 text-sm">
        {step === 0 && (
          <>
            <p>Before the portal: confirm the Control Log row. If the carrier is missing, stop and escalate.</p>
            <label className="block text-xs font-medium">Carrier
              <input className="mt-1 w-full border rounded-md px-2 py-1.5" value={ck.carrier} onChange={(e) => set('carrier', e.target.value)} />
            </label>
            <label className="block text-xs font-medium"><TermTip glossaryId="producer-code">Producer code</TermTip>
              <input className="mt-1 w-full border rounded-md px-2 py-1.5" value={ck.producerCode} onChange={(e) => set('producerCode', e.target.value)} />
            </label>
            <label className="block text-xs font-medium">Statement period
              <input className="mt-1 w-full border rounded-md px-2 py-1.5" value={ck.statementPeriod} onChange={(e) => set('statementPeriod', e.target.value)} placeholder="2026-07" />
            </label>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={ck.controlConfirmed} onChange={(e) => set('controlConfirmed', e.target.checked)} />
              I confirmed carrier, producer code, period, bill type, payment model, and previous statement on the Control Log.
            </label>
          </>
        )}

        {step === 1 && (
          <>
            <p className="font-medium">Portal reminders — do not do any of these:</p>
            <ul className="list-disc pl-5 space-y-1 text-slate-700">
              <li>Change banking information</li>
              <li>Change commission elections</li>
              <li>Change agency or producer information</li>
              <li>Accept revised contracts</li>
              <li>Create another user</li>
            </ul>
            <p className="text-slate-600">If the portal requires one of these, stop and escalate.</p>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={ck.portalRemindersAck} onChange={(e) => set('portalRemindersAck', e.target.checked)} />
              I will use my assigned login + MFA and will escalate if the portal asks me to change money or agency settings.
            </label>
            {onEscalate && (
              <button type="button" onClick={onEscalate} className="text-xs text-amber-800 underline">Portal is asking me to change something → Escalate</button>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <p>On the statement screen, confirm agency name, producer code, carrier, period, payment date, and statement number. Do not rely only on the filename.</p>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={ck.identityChecked} onChange={(e) => set('identityChecked', e.target.checked)} />
              I verified those fields on the carrier’s screen (not just the download name).
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <p>Download the original PDF, CSV, or Excel. Do not print-and-scan, convert before saving, edit, delete prior versions, or rename a revision so it replaces the first.</p>
            <p>If both PDF and CSV are offered, download both.</p>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={ck.downloadedOriginal} onChange={(e) => set('downloadedOriginal', e.target.checked)} />
              I saved the original file(s) without editing.
            </label>
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5" checked={ck.downloadedBothFormats} onChange={(e) => set('downloadedBothFormats', e.target.checked)} />
              Both formats downloaded when offered (or only one was offered).
            </label>
          </>
        )}

        {step === 4 && (
          <>
            <p className="text-xs text-slate-600">Pattern: <code className="bg-slate-100 px-1 rounded">YYYY-MM-DD_Carrier_StatementPeriod_ProducerCode_FileType</code></p>
            <p className="text-xs">Suggested: <span className="font-mono">{suggestedName}</span></p>
            <p className="text-xs text-amber-800">For a revision, add <code>_REVISED_</code> — never overwrite the first version’s name.</p>
            <label className="block text-xs font-medium">Filename you will use / used
              <input className="mt-1 w-full border rounded-md px-2 py-1.5 font-mono text-xs" value={ck.filename} onChange={(e) => set('filename', e.target.value)} />
            </label>
          </>
        )}

        {step === 5 && (
          <>
            <p>
              Enter control totals from the statement.
              {' '}
              <TermTip glossaryId="control-total">Never invent a carrier total.</TermTip>
            </p>
            <label className="flex items-start gap-2 text-xs mb-2">
              <input type="checkbox" className="mt-0.5" checked={ck.noCarrierTotal} onChange={(e) => set('noCarrierTotal', e.target.checked)} />
              Carrier statement does not provide a control total
            </label>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                ['statementDate', 'Statement date'],
                ['paymentDate', 'Payment date'],
                ['statementNumber', 'Statement number'],
                ['rowCount', 'Detail rows (if shown)'],
                ['grossPremium', 'Gross premium'],
                ['totalPositive', 'Total positive commission'],
                ['totalChargebacks', 'Chargebacks / negatives'],
                ['netCommission', 'Net commission (carrier-stated)'],
                ['paymentRef', 'Payment reference'],
              ].map(([key, label]) => (
                <label key={key} className="text-xs font-medium">{label}
                  <input
                    className="mt-1 w-full border rounded-md px-2 py-1.5"
                    value={ck[key as keyof Checklist] as string}
                    onChange={(e) => set(key as keyof Checklist, e.target.value as never)}
                    disabled={key === 'netCommission' && ck.noCarrierTotal}
                  />
                </label>
              ))}
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <p>Upload the original to stage it. Nothing is booked until your manager approves.</p>
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-emerald-400"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void upload(f);
              }}
            >
              {busy ? <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-500" /> : <UploadCloud className="w-6 h-6 mx-auto text-slate-400" />}
              <p className="text-xs text-slate-600 mt-2">Drop PDF / CSV / Excel or click to choose</p>
              <input ref={inputRef} type="file" className="hidden" accept=".pdf,.csv,.xlsx,.xls"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            </div>
            {batch && (
              <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
                <div>Batch: <span className="font-mono">{batch.batch_id}</span></div>
                <div>Carrier recognized: {batch.carrier ?? '—'}</div>
                <div>Rows: {batch.line_count} · Method: {batch.extraction_method}{batch.is_ocr ? ' (OCR)' : ''}</div>
                <div>Parsed commission: {batch.crosscheck.parsed_total_commission}</div>
                <div>Status: pending review (staged)</div>
              </div>
            )}
          </>
        )}

        {step === 7 && (
          <>
            <p>Classify the file. A <TermTip glossaryId="rate-sheet">rate sheet</TermTip> must not be processed as money received.</p>
            <div className="space-y-2">
              {([
                ['statement', 'Statement — policy-level payment transactions'],
                ['rate_sheet', 'Rate sheet — rates only, no policy payments'],
                ['both', 'Both — payments and rate information'],
                ['needs_mapping', 'Needs mapping — system cannot confidently read it'],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-start gap-2 text-xs">
                  <input type="radio" name="class" checked={ck.classification === value}
                    onChange={() => set('classification', value)} />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500">If unsure, choose needs mapping or escalate — never guess.</p>
          </>
        )}

        {step === 8 && (
          <>
            <p>Compare the system result with the original: carrier, period, statement number, policy count, net, positives/negatives, payment date, producer code.</p>
            {batch?.is_ocr && (
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" className="mt-0.5" checked={ck.ocrSpotCheck} onChange={(e) => set('ocrSpotCheck', e.target.checked)} />
                OCR: I manually checked the first five rows, five middle rows, final five rows, every negative, and the statement total.
              </label>
            )}
            {!batch?.is_ocr && <p className="text-xs text-slate-600">Non-OCR file — still spot-check a few rows against the original.</p>}
          </>
        )}

        {step === 9 && (
          <>
            <p>Compare parsed total vs carrier-stated total. Do not change rows just to make totals agree.</p>
            <div className="rounded-md bg-slate-50 border p-3 text-xs space-y-1">
              <div>Parsed: {parsedVsCarrier.parsed ?? '—'}</div>
              <div>Carrier-stated: {ck.noCarrierTotal ? 'Carrier statement does not provide a control total' : (parsedVsCarrier.stated ?? '—')}</div>
              <div>Difference: {parsedVsCarrier.diff ?? '—'}</div>
              <div className="font-medium">{SEVERITY_PLAIN[parsedVsCarrier.severity]}</div>
            </div>
            {parsedVsCarrier.severity === 'critical' && onEscalate && (
              <button type="button" onClick={onEscalate} className="text-xs text-amber-800 underline">Critical difference — escalate</button>
            )}
          </>
        )}

        {step === 10 && (
          <>
            <p>Use NowCerts to verify policy number, insured, dates, carrier, LOB, status. A policy number beats a similar name. If records conflict, flag needs review — do not pick the “closest.”</p>
            <label className="block text-xs font-medium">Notes from policy matching
              <textarea className="mt-1 w-full border rounded-md px-2 py-1.5" rows={3} value={ck.policyMatchNotes}
                onChange={(e) => set('policyMatchNotes', e.target.value)}
                placeholder="All checked / Policy X not found / Name mismatch on…" />
            </label>
          </>
        )}

        {step === 11 && (
          <>
            <p>Before calling something underpaid, confirm the payment model.</p>
            <div className="space-y-2">
              {([
                ['advance', 'Advance'],
                ['as_earned', 'As-earned (partial monthly may be normal)'],
                ['hybrid', 'Hybrid'],
                ['unknown', 'Unknown'],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-start gap-2 text-xs">
                  <input type="radio" name="pm" checked={ck.paymentModel === value}
                    onChange={() => {
                      set('paymentModel', value);
                      if (value === 'unknown') set('paymentModelNote', 'Payment model requires confirmation');
                    }} />
                  <TermTip glossaryId={value === 'as_earned' ? 'as-earned' : value === 'advance' ? 'advance' : undefined}>{label}</TermTip>
                </label>
              ))}
            </div>
            <label className="block text-xs font-medium mt-2">Note
              <input className="mt-1 w-full border rounded-md px-2 py-1.5" value={ck.paymentModelNote}
                onChange={(e) => set('paymentModelNote', e.target.value)} />
            </label>
          </>
        )}

        {step === 12 && (
          <>
            <p>Categorize exceptions. Each needs amount, explanation, owner, and follow-up (add in notes).</p>
            <button
              type="button"
              className="text-xs px-2 py-1 rounded bg-slate-100"
              onClick={() => set('exceptions', [...ck.exceptions, { reason: EXCEPTION_REASONS[0], amount: '', explanation: '' }])}
            >
              Add exception
            </button>
            {ck.exceptions.map((ex, i) => (
              <div key={i} className="grid sm:grid-cols-3 gap-2 border rounded-md p-2">
                <select className="border rounded px-1 text-xs" value={ex.reason}
                  onChange={(e) => {
                    const next = [...ck.exceptions];
                    next[i] = { ...ex, reason: e.target.value };
                    set('exceptions', next);
                  }}>
                  {EXCEPTION_REASONS.map((r) => <option key={r}>{r}</option>)}
                </select>
                <input className="border rounded px-1 text-xs" placeholder="Amount" value={ex.amount}
                  onChange={(e) => {
                    const next = [...ck.exceptions];
                    next[i] = { ...ex, amount: e.target.value };
                    set('exceptions', next);
                  }} />
                <input className="border rounded px-1 text-xs" placeholder="Explanation" value={ex.explanation}
                  onChange={(e) => {
                    const next = [...ck.exceptions];
                    next[i] = { ...ex, explanation: e.target.value };
                    set('exceptions', next);
                  }} />
              </div>
            ))}
            {ck.exceptions.length === 0 && <p className="text-xs text-slate-500">No exceptions recorded (OK if totals and policies match).</p>}
          </>
        )}

        {step === 13 && (
          <>
            <p className="font-medium">Review summary (auto-built)</p>
            <pre className="text-[11px] bg-slate-50 border rounded-md p-3 whitespace-pre-wrap font-mono text-slate-800">
{`Carrier: ${ck.carrier}
Statement period: ${ck.statementPeriod}
Statement number: ${ck.statementNumber || '—'}
Batch number: ${batch?.batch_id ?? '—'}
Rows processed: ${batch?.line_count ?? ck.rowCount ?? '—'}
Carrier-stated total: ${ck.noCarrierTotal ? 'Carrier statement does not provide a control total' : (parsedVsCarrier.stated ?? '—')}
Parsed total: ${parsedVsCarrier.parsed ?? '—'}
Difference: ${parsedVsCarrier.diff ?? '—'} (${parsedVsCarrier.severity})
Payment model: ${ck.paymentModel}${ck.paymentModelNote ? ` — ${ck.paymentModelNote}` : ''}
Exceptions found: ${ck.exceptions.length}
Classification: ${ck.classification || '—'}
Recommended status: ${ck.recommended === 'ready_for_approval' ? 'Ready for approval' : 'Needs review'}
Prepared by: ${email ?? '—'}
Date: ${new Date().toISOString().slice(0, 10)}`}
            </pre>
            <div className="space-y-1">
              <label className="flex gap-2 text-xs">
                <input type="radio" checked={ck.recommended === 'ready_for_approval'} onChange={() => set('recommended', 'ready_for_approval')} />
                Ready for approval
              </label>
              <label className="flex gap-2 text-xs">
                <input type="radio" checked={ck.recommended === 'needs_review'} onChange={() => set('recommended', 'needs_review')} />
                Needs review
              </label>
            </div>
          </>
        )}

        {step === 14 && (
          <>
            <p className="font-bold text-slate-900">Stop for approval</p>
            <p>Only an authorized reviewer may approve the batch, change rules, accept unexplained differences, commit to the ledger, write off, dispute, or move money.</p>
            <p className="text-xs text-slate-600">Statuses you may see later: {CONTROL_STATUSES.filter((s) => ['approved', 'rejected_correction', 'closed'].includes(s.value)).map((s) => s.label).join(', ')}.</p>
            <button
              type="button"
              disabled={busy || !canNext()}
              onClick={() => void submit()}
              className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50"
            >
              {busy ? 'Submitting…' : 'Submit for manager approval'}
            </button>
          </>
        )}
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 flex items-center gap-1 disabled:opacity-40"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back
        </button>
        {step < STEPS.length - 1 && (
          <button
            type="button"
            disabled={!canNext()}
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-900 text-white flex items-center gap-1 disabled:opacity-40"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
