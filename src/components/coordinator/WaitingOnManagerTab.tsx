/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import * as finance from '../../data/financeApi';

export default function WaitingOnManagerTab({ email }: { email: string | null }) {
  const [batches, setBatches] = useState<finance.BatchSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const all = await finance.listBatches('pending_review');
      setBatches(all.filter((b) => {
        const handoff = (b as finance.BatchSummary & { handoff_status?: string; prepared_by?: string }).handoff_status;
        const preparedBy = (b as finance.BatchSummary & { prepared_by?: string }).prepared_by;
        if (handoff === 'ready_for_approval') return true;
        if (email && preparedBy && preparedBy.toLowerCase() === email.toLowerCase()) return true;
        return handoff == null; // legacy staged batches still pending
      }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load batches');
    }
  };

  useEffect(() => { void load(); }, [email]);

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold">Waiting on manager</h2>
        <p className="text-sm text-slate-600">
          Packages you submitted. After approval, reopen the record and confirm status, archive path, and amounts — do not trust a toast alone.
        </p>
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <button type="button" onClick={() => void load()} className="text-xs px-2 py-1 border rounded-md">Refresh</button>
      <ul className="space-y-2">
        {batches.map((b) => {
          const ext = b as finance.BatchSummary & {
            handoff_status?: string;
            prepared_by?: string;
            prep_checklist?: { recommended?: string };
          };
          return (
            <li key={b.id} className="border border-slate-200 rounded-lg p-3 text-sm bg-white">
              <div className="font-medium">{b.carrier_name ?? 'Unknown carrier'}</div>
              <div className="text-xs text-slate-500 font-mono">{b.source_file}</div>
              <div className="text-xs mt-1">
                Batch {b.id.slice(0, 8)}… · {b.row_count ?? '—'} rows · handoff: {ext.handoff_status ?? 'draft'} · ingest: {b.ingest_status}
              </div>
              {ext.prepared_by && <div className="text-xs text-slate-600">Prepared by {ext.prepared_by}</div>}
            </li>
          );
        })}
      </ul>
      {batches.length === 0 && !error && (
        <p className="text-sm text-slate-500">Nothing waiting right now.</p>
      )}
    </div>
  );
}

/** Approver queue of coordinator handoffs. */
export function PendingApprovalQueue({
  email, canApprove,
}: {
  email: string | null;
  canApprove: boolean;
}) {
  const [batches, setBatches] = useState<Array<finance.BatchSummary & Record<string, unknown>>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ batch: Record<string, unknown>; lines: Array<Record<string, unknown>> } | null>(null);
  const [confirmedSource, setConfirmedSource] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const pending = await finance.listBatches('pending_review');
    setBatches(pending.filter((b) => {
      const h = (b as { handoff_status?: string }).handoff_status;
      return h === 'ready_for_approval' || h == null || h === 'draft';
    }) as Array<finance.BatchSummary & Record<string, unknown>>);
  };

  useEffect(() => { void load().catch((e) => setMessage(String(e))); }, []);

  const open = async (id: string) => {
    setSelected(id);
    setConfirmedSource(false);
    setDetail(await finance.getBatch(id));
  };

  const approve = async () => {
    if (!email || !selected || !canApprove) return;
    setBusy(true);
    try {
      await finance.approveStatement(selected, email, { confirmedSource });
      setMessage('Committed. Ask the coordinator to read the record back.');
      setSelected(null);
      setDetail(null);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Approve failed');
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!email || !selected || !canApprove) return;
    setBusy(true);
    try {
      await finance.rejectStatement(selected, email, 'returned to coordinator');
      await finance.handoffStatement(selected, email, {
        handoffStatus: 'returned',
        returnNotes: 'Rejected on review — correct and resubmit.',
      });
      setMessage('Rejected and returned.');
      setSelected(null);
      setDetail(null);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Reject failed');
    } finally {
      setBusy(false);
    }
  };

  if (!canApprove) {
    return <p className="text-sm text-slate-500">Approver access required.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-sm">Pending approval ({batches.length})</h3>
        <button type="button" className="text-xs border rounded px-2 py-1" onClick={() => void load()}>Refresh</button>
      </div>
      {message && <p className="text-xs text-slate-700 bg-slate-50 border rounded p-2">{message}</p>}
      <ul className="space-y-2">
        {batches.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => void open(b.id)}
              className={`w-full text-left border rounded-lg p-3 text-sm hover:border-emerald-400 ${selected === b.id ? 'border-emerald-500 bg-emerald-50/40' : 'border-slate-200'}`}
            >
              <div className="font-medium">{String(b.carrier_name ?? 'Unknown')}</div>
              <div className="text-xs text-slate-500">{String(b.source_file)} · handoff {String(b.handoff_status ?? '—')}</div>
              <div className="text-xs">Prepared by {String(b.prepared_by ?? b.uploaded_by ?? '—')}</div>
            </button>
          </li>
        ))}
      </ul>
      {detail && selected && (
        <div className="border border-slate-200 rounded-lg p-4 space-y-3">
          <pre className="text-[11px] bg-slate-50 p-2 rounded overflow-auto max-h-40">
            {JSON.stringify(detail.batch.prep_checklist ?? { note: 'No checklist attached' }, null, 2)}
          </pre>
          <p className="text-xs text-slate-600">{detail.lines.length} staged lines (showing review payload above).</p>
          {(detail.batch.extraction_method === 'pdf_text' || detail.batch.extraction_method === 'pdf_ocr' || detail.batch.is_ocr) && (
            <label className="flex gap-2 text-xs">
              <input type="checkbox" checked={confirmedSource} onChange={(e) => setConfirmedSource(e.target.checked)} />
              I checked the parsed lines against the source PDF.
            </label>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void approve()}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white disabled:opacity-50">
              Approve &amp; book
            </button>
            <button type="button" disabled={busy} onClick={() => void reject()}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-600 text-white disabled:opacity-50">
              Reject / return
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
