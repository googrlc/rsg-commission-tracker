/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * §11a / Slice 2 statement upload. Drag a carrier statement → detect carrier →
 * parse in-browser via the parser registry → preview the parsed-vs-stated
 * cross-check → confirm → insert + reconcile. Unknown formats are flagged, not
 * guessed (spec §3).
 */

import React, { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2, AlertTriangle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { readWorkbook, detectParserKey } from '../../parsers/readWorkbook';
import { getParser } from '../../parsers/registry';
import type { ParseResult } from '../../parsers/types';
import * as recon from '../../data/reconRepository';
import { Card, formatCurrencyDecimal } from './shared';

type Phase = 'idle' | 'parsing' | 'preview' | 'saving' | 'done' | 'error';

export default function StatementUpload({
  uploadedBy, onUploaded,
}: {
  uploadedBy: string | null;
  onUploaded?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [drag, setDrag] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<{ rows: number; summary: unknown } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setPhase('parsing'); setMessage(null); setParsed(null); setResult(null);
    try {
      const wb = await readWorkbook(file);
      const key = detectParserKey(wb);
      const parser = getParser(key);
      if (!key || !parser) {
        setPhase('error');
        setMessage(`Unrecognized statement format for "${file.name}". Flagged — a parser mapping is needed for this carrier before it can be loaded (spec §3: no guessing).`);
        return;
      }
      const detailed = wb.sheet('Detailed');
      if (!detailed) { setPhase('error'); setMessage('No "Detailed" sheet found.'); return; }
      const res = parser({
        detailedRows: detailed,
        summaryRows: wb.sheet('Summary'),
        sourceFilename: wb.sourceFilename,
        uploadedBy,
      });
      setParsed(res); setPhase('preview');
    } catch (e) {
      setPhase('error');
      setMessage(e instanceof Error ? e.message : 'Could not read file.');
    }
  };

  const confirm = async () => {
    if (!parsed) return;
    setPhase('saving'); setMessage(null);
    try {
      const out = await recon.uploadParsedStatement(parsed, uploadedBy);
      setResult({ rows: out.rowCount, summary: out.reconcileSummary });
      setPhase('done');
      onUploaded?.();
    } catch (e) {
      setPhase('error');
      setMessage(e instanceof Error ? e.message : 'Upload failed.');
    }
  };

  const reset = () => { setPhase('idle'); setParsed(null); setMessage(null); setResult(null); };

  const cc = parsed?.crossCheck;
  const crossRow = (label: string, parsedV: number, statedV: number | null, ok: boolean | null) => (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-slate-500">{label}</span>
      <span className="flex items-center gap-2 font-mono">
        <span className="text-slate-800">{formatCurrencyDecimal(parsedV)}</span>
        <span className="text-slate-300">vs</span>
        <span className="text-slate-500">{statedV == null ? '—' : formatCurrencyDecimal(statedV)}</span>
        {ok === true && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
        {ok === false && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
      </span>
    </div>
  );

  return (
    <Card title="Upload a carrier statement" subtitle="Drag a statement file → parse → reconcile. Progressive .xlsx supported; more carriers as parsers are added.">
      {phase === 'idle' || phase === 'parsing' ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition ${drag ? 'border-blue-400 bg-blue-50/50' : 'border-slate-300 hover:border-slate-400'}`}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          {phase === 'parsing' ? (
            <div className="flex flex-col items-center gap-2 text-slate-500 text-sm">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" /> Parsing…
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <UploadCloud className="w-8 h-8 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">Drop a statement here or click to browse</span>
              <span className="text-[11px]">.xlsx · .csv</span>
            </div>
          )}
        </div>
      ) : null}

      {phase === 'preview' && parsed && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            <b>{parsed.header.carrier_name}</b> · {parsed.header.row_count} lines · {parsed.header.source_filename}
          </div>
          <div className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">Parsed vs carrier-stated</div>
            {crossRow('Net premium', cc!.parsed_total_premium, parsed.header.carrier_stated_total_premium, cc!.premium_matches)}
            {crossRow('Commission', cc!.parsed_total_commission, parsed.header.carrier_stated_total_commission, cc!.commission_matches)}
            {crossRow('Net due', cc!.parsed_net_due, parsed.header.carrier_stated_net_due, cc!.net_due_matches)}
          </div>
          <div className="flex gap-2">
            <button onClick={confirm} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg">
              Load {parsed.header.row_count} rows & reconcile
            </button>
            <button onClick={reset} className="px-4 py-2 text-slate-600 hover:text-slate-900 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {phase === 'saving' && (
        <div className="flex items-center gap-2 text-slate-600 text-sm py-4">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" /> Loading & reconciling…
        </div>
      )}

      {phase === 'done' && result && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
            <CheckCircle2 className="w-5 h-5" /> Loaded {result.rows} rows & reconciled.
          </div>
          <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto">
{JSON.stringify(result.summary, null, 2)}
          </pre>
          <button onClick={reset} className="text-xs text-blue-600 hover:underline">Upload another</button>
        </div>
      )}

      {phase === 'error' && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {message}
          </div>
          <button onClick={reset} className="text-xs text-blue-600 hover:underline">Try another file</button>
        </div>
      )}
    </Card>
  );
}
