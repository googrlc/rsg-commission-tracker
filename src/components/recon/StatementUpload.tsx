/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Statement upload — drop a file, review what it WOULD do, then approve.
 *
 * This component used to parse in the browser and write straight to Supabase.
 * The file went in and the money was booked in one motion, with no staging and
 * no approver on the record. It now posts to the commission service, which
 * stages the batch, and the confirm button is a separate, named act against
 * something already parsed and cross-checked.
 *
 * The review card deliberately shows consequences rather than rows: how many
 * lines will attach to existing ledger rows, how many will create one, and
 * which policy numbers will match nothing. Rubber-stamping a list of numbers is
 * easy; rubber-stamping "4 lines will match no policy at all" is harder, which
 * is the point.
 *
 * PDFs carry one extra step. Their columns are inferred from the document's
 * geometry (or read off a picture of it), so the service refuses to commit one
 * until the approver states they checked it against the file itself.
 */

import React, { useRef, useState } from 'react';
import {
  UploadCloud, CheckCircle2, AlertTriangle, FileSpreadsheet, Loader2, XCircle, ShieldAlert,
} from 'lucide-react';
import * as finance from '../../data/financeApi';
import { Card, formatCurrencyDecimal } from './shared';

type Phase = 'idle' | 'staging' | 'review' | 'approving' | 'done' | 'error';

export default function StatementUpload({
  uploadedBy, onUploaded,
}: {
  uploadedBy: string | null;
  onUploaded?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [drag, setDrag] = useState(false);
  const [batch, setBatch] = useState<finance.StagedBatch | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<finance.CommitResult | null>(null);
  const [confirmedSource, setConfirmedSource] = useState(false);
  const [statedPremium, setStatedPremium] = useState('');
  const [statedCommission, setStatedCommission] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPhase('idle'); setBatch(null); setMessage(null); setResult(null);
    setConfirmedSource(false); setStatedPremium(''); setStatedCommission('');
  };

  const handleFile = async (file: File) => {
    if (!uploadedBy) {
      setPhase('error');
      setMessage('You must be signed in to upload a statement — the approval is recorded against your account.');
      return;
    }
    setPhase('staging'); setMessage(null); setResult(null);
    try {
      const staged = await finance.stageStatement({
        file,
        uploadedBy,
        statedPremium: statedPremium.trim() || undefined,
        statedCommission: statedCommission.trim() || undefined,
      });
      setBatch(staged);
      setPhase('review');
    } catch (e) {
      setPhase('error');
      setMessage(e instanceof Error ? e.message : 'Upload failed.');
    }
  };

  const approve = async () => {
    if (!batch?.batch_id || !uploadedBy) return;
    setPhase('approving'); setMessage(null);
    try {
      setResult(await finance.approveStatement(batch.batch_id, uploadedBy, { confirmedSource }));
      setPhase('done');
      onUploaded?.();
    } catch (e) {
      setPhase('error');
      setMessage(e instanceof Error ? e.message : 'Approval failed.');
    }
  };

  const reject = async () => {
    if (!batch?.batch_id || !uploadedBy) return;
    setPhase('approving');
    try {
      await finance.rejectStatement(batch.batch_id, uploadedBy, 'rejected on review');
      reset();
    } catch (e) {
      setPhase('error');
      setMessage(e instanceof Error ? e.message : 'Reject failed.');
    }
  };

  const cc = batch?.crosscheck;
  const preview = batch?.preview ?? {};
  const unmatchedNumbers: Array<[string, number]> =
    Object.entries(preview.unmatched_policy_numbers ?? ({} as Record<string, number>));
  const blocked = batch != null && !batch.approvable;
  const needsConfirmation = batch?.requires_confirmation && !confirmedSource;

  return (
    <Card
      title="Upload a carrier statement"
      subtitle="Parsed and staged on upload — nothing is booked until you approve it. .xlsx · .csv · .pdf"
    >
      {(phase === 'idle' || phase === 'staging') && (
        <div className="space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault(); setDrag(false);
              const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
            }}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${drag ? 'border-blue-400 bg-blue-50/50' : 'border-slate-300 hover:border-slate-400'}`}
          >
            <input
              ref={inputRef} type="file" accept=".xlsx,.xlsm,.csv,.tsv,.pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            {phase === 'staging' ? (
              <div className="flex flex-col items-center gap-2 text-slate-500 text-sm">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" /> Parsing &amp; staging…
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <UploadCloud className="w-8 h-8 text-slate-400" />
                <span className="text-sm font-medium text-slate-600">Drop a statement here or click to browse</span>
                <span className="text-[11px]">.xlsx · .csv · .pdf</span>
              </div>
            )}
          </div>

          {/* The carrier's own totals. Optional, but a batch with nothing to
              check against is the one a bad parse walks straight through. */}
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer hover:text-slate-700">
              Carrier-stated totals (optional — makes the cross-check verifiable)
            </summary>
            <div className="flex gap-2 mt-2">
              <input
                value={statedPremium} onChange={(e) => setStatedPremium(e.target.value)}
                placeholder="Stated total premium"
                className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
              />
              <input
                value={statedCommission} onChange={(e) => setStatedCommission(e.target.value)}
                placeholder="Stated total commission"
                className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Some statements print these on a summary sheet — those are read automatically.
            </p>
          </details>
        </div>
      )}

      {phase === 'review' && batch && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            <b>{batch.carrier ?? 'Unknown carrier'}</b> · {batch.line_count} lines · {batch.filename}
            <span className="text-[10px] uppercase tracking-wide text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
              {batch.extraction_method}
            </span>
          </div>

          {batch.duplicate_of && (
            <div className="flex items-start gap-2 text-amber-800 text-xs bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              This exact file was already uploaded. Loading it again would double-count it.
            </div>
          )}

          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Parsed vs carrier-stated</div>
            <CrossRow label="Premium" parsed={cc!.parsed_total_premium} stated={cc!.stated_total_premium} ok={cc!.verifiable ? cc!.crosscheck_ok : null} />
            <CrossRow label="Commission" parsed={cc!.parsed_total_commission} stated={cc!.stated_total_commission} ok={cc!.verifiable ? cc!.crosscheck_ok : null} />
            {!cc!.verifiable && (
              <p className="text-[10px] text-amber-600 mt-1">
                No carrier total to check against — this parse cannot be falsified.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">If you approve this</div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Consequence n={preview.will_link ?? 0} label="attach to a ledger row" tone="text-emerald-600" />
              <Consequence n={preview.will_create_ledger_rows ?? 0} label="create a ledger row" tone="text-blue-600" />
              <Consequence n={preview.will_be_unmatched ?? 0} label="match nothing" tone="text-amber-600" />
            </div>
            {unmatchedNumbers.length > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">
                Unmatched policy numbers:{' '}
                <span className="font-mono">
                  {unmatchedNumbers.slice(0, 6).map(([n, c]) => `${n}${c > 1 ? ` ×${c}` : ''}`).join(', ')}
                  {unmatchedNumbers.length > 6 ? ` +${unmatchedNumbers.length - 6} more` : ''}
                </span>
              </p>
            )}
            {(preview.negative_lines ?? 0) > 0 && (
              <p className="mt-1 text-[11px] text-slate-500">
                {preview.negative_lines} negative line(s) — credits or chargebacks, booked as signed amounts.
              </p>
            )}
          </div>

          {batch.warnings.length > 0 && (
            <ul className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1">
              {batch.warnings.map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
          )}

          {batch.requires_confirmation && (
            <label className="flex items-start gap-2 text-xs text-slate-700 bg-blue-50/60 border border-blue-200 rounded-lg p-3 cursor-pointer">
              <input
                type="checkbox" checked={confirmedSource} className="mt-0.5"
                onChange={(e) => setConfirmedSource(e.target.checked)}
              />
              <span>
                <b className="flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-blue-600" />
                  This came from a PDF{batch.is_ocr ? ', read by OCR' : ''}.
                </b>
                Its columns were inferred, not named. I have compared these lines against the
                document and the amounts are right.
              </span>
            </label>
          )}

          <div className="flex gap-2">
            <button
              onClick={approve}
              disabled={blocked || needsConfirmation}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg"
            >
              Approve &amp; book {batch.line_count} lines
            </button>
            <button onClick={reject} className="px-4 py-2 text-red-600 hover:text-red-800 text-sm">Reject</button>
            <button onClick={reset} className="px-4 py-2 text-slate-600 hover:text-slate-900 text-sm">Cancel</button>
          </div>
          {blocked && (
            <p className="text-[11px] text-red-600">
              This batch cannot be approved — see the warnings above. Fix the file or the
              stated totals rather than forcing it through.
            </p>
          )}
        </div>
      )}

      {phase === 'approving' && (
        <div className="flex items-center gap-2 text-slate-600 text-sm py-4">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" /> Booking &amp; reconciling…
        </div>
      )}

      {phase === 'done' && result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
            <CheckCircle2 className="w-5 h-5" />
            Booked {result.committed} lines · {result.linked} linked · {result.created_ledger_rows} ledger rows created
            {result.unmatched > 0 ? ` · ${result.unmatched} unmatched` : ''}
          </div>
          <p className="text-[11px] text-slate-500 font-mono">{result.rollup}</p>
          {result.errors.length > 0 && (
            <ul className="text-[11px] text-red-600 space-y-1">
              {result.errors.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
          )}
          <button onClick={reset} className="text-xs text-blue-600 hover:underline">Upload another</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg p-3">
            <XCircle className="w-4 h-4 mt-0.5 shrink-0" /> {message}
          </div>
          <button onClick={reset} className="text-xs text-blue-600 hover:underline">Start over</button>
        </div>
      )}
    </Card>
  );
}

function CrossRow({ label, parsed, stated, ok }: {
  label: string; parsed: number; stated: number | null; ok: boolean | null;
}) {
  return (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-slate-500">{label}</span>
      <span className="flex items-center gap-2 font-mono">
        <span className="text-slate-800">{formatCurrencyDecimal(parsed)}</span>
        <span className="text-slate-300">vs</span>
        <span className="text-slate-500">{stated == null ? '—' : formatCurrencyDecimal(stated)}</span>
        {ok === true && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
        {ok === false && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
      </span>
    </div>
  );
}

function Consequence({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div>
      <div className={`text-lg font-bold font-mono ${n > 0 ? tone : 'text-slate-300'}`}>{n}</div>
      <div className="text-[10px] text-slate-500 leading-tight">{label}</div>
    </div>
  );
}
