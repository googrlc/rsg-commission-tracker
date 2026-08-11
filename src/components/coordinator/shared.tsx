/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Info } from 'lucide-react';
import { glossaryById, type GlossaryEntry } from '../../content/commissionGlossary';

/** Inline “what does this mean?” tip for beginner screens. */
export function TermTip({
  glossaryId, plain, children,
}: {
  glossaryId?: string;
  plain?: string;
  children?: React.ReactNode;
}) {
  const entry: GlossaryEntry | undefined = glossaryId ? glossaryById(glossaryId) : undefined;
  const text = plain ?? entry?.plain;
  if (!text) return <>{children}</>;
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <span className="relative group inline-flex">
        <Info className="w-3.5 h-3.5 text-sky-700 cursor-help" aria-label="What does this mean?" />
        <span className="pointer-events-none absolute z-20 left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block w-56 rounded-md bg-slate-900 text-white text-[11px] leading-snug p-2 shadow-lg">
          {entry ? <span className="font-semibold block mb-0.5">{entry.term}</span> : null}
          {text}
        </span>
      </span>
    </span>
  );
}

export function OverridingRuleBanner() {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-bold text-xs uppercase tracking-wide text-amber-800 mb-1">Your only job</p>
      <p className="text-sm leading-relaxed">
        Collect, document, validate, and prepare. You do <strong>not</strong> approve commission entries,
        change rates, move money, issue refunds, or decide a mismatch is acceptable.
        If you are unsure, stop and escalate.
      </p>
    </div>
  );
}
