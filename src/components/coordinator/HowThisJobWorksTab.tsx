/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const WEEKLY = [
  {
    day: 'Monday',
    title: 'Review what is due',
    steps: [
      'Open This week / Control Log.',
      'Filter: due this week, missing last week, pending approval, open discrepancies, agency-bill due.',
      'Confirm every carrier has a status — never leave blank.',
    ],
  },
  {
    day: 'Tuesday',
    title: 'Primary statement collection',
    steps: [
      'Retrieve every statement that is available.',
      'Use Process statement for each file — do not skip the checklist.',
    ],
  },
  {
    day: 'Friday',
    title: 'Missing-statement sweep',
    steps: [
      'Statements not available Tuesday, late/revised statements, deposit notices.',
      'Agency-bill account currents and open discrepancies awaiting carrier response.',
    ],
  },
];

const TRAINING = [
  {
    week: 'Week 1 — Observation',
    items: [
      'Learn direct bill vs agency bill (glossary).',
      'Watch two carrier portals with your trainer.',
      'Process one simple statement together.',
      'Practice file naming and Control Log statuses.',
      'No approval or payment authority.',
    ],
  },
  {
    week: 'Week 2 — Supervised processing',
    items: [
      'Retrieve five statements yourself.',
      'Trainer watches each upload and control total.',
      'Practice duplicates, chargebacks, missing statements.',
    ],
  },
  {
    week: 'Week 3 — Independent preparation',
    items: [
      'Complete collection and staging independently.',
      'Trainer reviews 100% before approval.',
      'Practice agency-bill records on historical examples.',
      'Practice three-way match without releasing payments.',
    ],
  },
  {
    week: 'Week 4 — Qualification',
    items: [
      'Correct portal retrieval, filename, control record.',
      'Duplicate detection, total comparison, exception coding.',
      'Direct-bill vs agency-bill handling and escalation.',
      'Handoff to manager and successful read-back after approval.',
    ],
  },
];

export default function HowThisJobWorksTab() {
  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="text-lg font-bold">How this job works</h2>
        <p className="text-sm text-slate-600 mt-1">
          Follow the weekly rhythm. When something is unclear, use Escalate — guessing is not part of the job.
        </p>
      </div>

      <section className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Weekly workflow</h3>
        {WEEKLY.map((w) => (
          <div key={w.day} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="font-bold text-slate-900">{w.day}: {w.title}</div>
            <ol className="mt-2 list-decimal pl-5 text-sm text-slate-700 space-y-1">
              {w.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
          </div>
        ))}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="font-bold">Month-end</div>
          <p className="text-slate-700 mt-1">
            During the first ten business days of each month, complete the prior-month statement close
            with your manager. Confirm every Control Log row for that month is Closed or escalated.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Four-week training plan</h3>
        {TRAINING.map((t) => (
          <div key={t.week} className="rounded-lg border border-sky-200 bg-sky-50/50 p-4">
            <div className="font-bold text-sky-950">{t.week}</div>
            <ul className="mt-2 space-y-1 text-sm text-sky-950/90">
              {t.items.map((i) => (
                <li key={i} className="flex gap-2">
                  <input type="checkbox" className="mt-1" />
                  <span>{i}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-xs text-slate-500">
          Even after qualification, management reviews 100% of approvals and money movements.
          For the first 90 days, expect spot-checks of at least 25% of completed statement packages.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
        <div className="font-bold mb-1">Fiduciary note (agency bill)</div>
        <p>
          Premium funds are commonly fiduciary funds with state-specific handling requirements.
          Confirm bank-account structure and state rules with the agency’s CPA or insurance counsel.
        </p>
        <a
          className="text-sky-700 underline text-xs mt-2 inline-block"
          href="https://content.naic.org/sites/default/files/model-law-chart-pr-60-producers%27-fiduciary-responsibilities-premiums.pdf"
          target="_blank"
          rel="noreferrer"
        >
          NAIC producers’ fiduciary responsibilities chart (PDF)
        </a>
      </section>
    </div>
  );
}
