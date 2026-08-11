/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Beginner glossary + SOP constants for the Commission Statement Coordinator.
 * Keep definitions short (1–2 sentences) and example-led.
 */

export const OVERRIDING_RULE =
  'Your job is to collect, document, validate, and prepare. You do not approve commission entries, change commission rates, move money, issue refunds, or decide that a mismatch is acceptable. If you are unsure, stop and escalate.';

export type GlossaryEntry = {
  id: string;
  term: string;
  plain: string;
  category: 'basics' | 'money' | 'status' | 'exception' | 'system' | 'rule';
};

export const GLOSSARY: GlossaryEntry[] = [
  {
    id: 'direct-bill',
    term: 'Direct bill',
    plain: 'The carrier bills the customer and pays the agency its commission. Most Progressive/GEICO statements are direct bill.',
    category: 'basics',
  },
  {
    id: 'agency-bill',
    term: 'Agency bill',
    plain: 'The agency bills and collects from the customer, then remits what is owed to the carrier or MGA. Most of that money is not agency revenue.',
    category: 'basics',
  },
  {
    id: 'commission-statement',
    term: 'Commission statement',
    plain: 'The carrier’s report showing policies, premiums, commissions, adjustments, and chargebacks for a period.',
    category: 'basics',
  },
  {
    id: 'rate-sheet',
    term: 'Rate sheet',
    plain: 'A document showing commission percentages. It is not proof of payment and must not be booked as money received.',
    category: 'basics',
  },
  {
    id: 'advance',
    term: 'Advance commission',
    plain: 'Commission paid before the full premium has been earned. Cancellations often create chargebacks.',
    category: 'money',
  },
  {
    id: 'as-earned',
    term: 'As-earned commission',
    plain: 'Commission paid gradually as the carrier earns the premium. A partial monthly payment is often normal — not automatically a shortage.',
    category: 'money',
  },
  {
    id: 'chargeback',
    term: 'Chargeback',
    plain: 'Previously paid commission taken back, usually after a cancellation, return premium, or adjustment.',
    category: 'money',
  },
  {
    id: 'expected-commission',
    term: 'Expected commission',
    plain: 'What the agency calculates it should receive based on rules and the policy.',
    category: 'money',
  },
  {
    id: 'actual-commission',
    term: 'Actual commission',
    plain: 'What the carrier statement says was paid.',
    category: 'money',
  },
  {
    id: 'cash-received',
    term: 'Cash received',
    plain: 'What actually reached the bank. Statements and deposits can disagree — flag, do not invent a match.',
    category: 'money',
  },
  {
    id: 'exception',
    term: 'Exception',
    plain: 'Anything missing, duplicated, unexpected, or not matched. Every exception needs an amount, explanation, owner, and follow-up date.',
    category: 'basics',
  },
  {
    id: 'producer-code',
    term: 'Producer code',
    plain: 'The agency’s identifier at the carrier. Confirm it on the statement — do not rely only on the filename.',
    category: 'basics',
  },
  {
    id: 'control-total',
    term: 'Control total',
    plain: 'The carrier’s printed statement total. Never calculate a number and pretend it is the carrier’s stated total.',
    category: 'money',
  },
  {
    id: 'fiduciary',
    term: 'Fiduciary / premium funds',
    plain: 'Customer premium collected on agency-bill often belongs in a separate premium account with state rules. You prepare; management releases money. See the NAIC fiduciary chart linked in How this job works.',
    category: 'rule',
  },
];

export type ControlStatus = {
  value: string;
  label: string;
  plain: string;
};

export const CONTROL_STATUSES: ControlStatus[] = [
  { value: 'not_due', label: 'Not due', plain: 'Not expected yet this cycle.' },
  { value: 'ready_to_retrieve', label: 'Ready to retrieve', plain: 'Time to sign into the carrier portal and download.' },
  { value: 'retrieved', label: 'Retrieved', plain: 'File downloaded; not uploaded yet.' },
  { value: 'uploaded_pending_review', label: 'Uploaded—pending review', plain: 'Staged in the tracker; still being checked.' },
  { value: 'needs_mapping', label: 'Needs mapping', plain: 'System cannot confidently read the format.' },
  { value: 'needs_review', label: 'Needs review', plain: 'Something looks off — escalate or keep documenting.' },
  { value: 'approved', label: 'Approved', plain: 'Manager approved; money may be booked.' },
  { value: 'rejected_correction', label: 'Rejected—correction required', plain: 'Manager sent it back; fix and resubmit.' },
  { value: 'missing_from_carrier', label: 'Missing from carrier', plain: 'Expected but not available in the portal.' },
  { value: 'carrier_dispute', label: 'Carrier dispute', plain: 'Open issue with the carrier — manager-owned.' },
  { value: 'closed', label: 'Closed', plain: 'Done for this period. Read the record back to confirm.' },
];

export const EXCEPTION_REASONS = [
  'Policy not found',
  'Insured name mismatch',
  'Policy number mismatch',
  'Effective-date mismatch',
  'Line-of-business mismatch',
  'Missing commission rule',
  'Possible rate mismatch',
  'Statement-only policy',
  'Duplicate transaction',
  'Cancellation',
  'Chargeback',
  'Audit adjustment',
  'Endorsement adjustment',
  'As-earned partial',
  'Deposit not found',
  'Unknown carrier format',
  'OCR requires review',
  'Missing carrier total',
  'Other—management review',
] as const;

export const ESCALATE_REASONS = [
  { code: 'unknown_carrier', label: 'Unknown carrier or producer code' },
  { code: 'banking_change', label: 'Changed banking instructions' },
  { code: 'duplicate_different_totals', label: 'Duplicate statement with different totals' },
  { code: 'missing_pages', label: 'Missing statement pages' },
  { code: 'unopenable_file', label: 'File that cannot be opened' },
  { code: 'unexplained_negative', label: 'Unexplained negative amount' },
  { code: 'suspected_duplicate_payment', label: 'Suspected duplicate payment' },
  { code: 'wrong_account', label: 'Customer payment sent to the wrong account' },
  { code: 'cancellation_risk', label: 'Carrier payment approaching cancellation' },
  { code: 'refund_request', label: 'Refund request' },
  { code: 'unapplied_cash', label: 'Unapplied cash' },
  { code: 'policy_not_found', label: 'Policy not found in NowCerts' },
  { code: 'total_mismatch', label: 'Statement total does not agree' },
  { code: 'missing_rate', label: 'Missing commission rate' },
  { code: 'alter_original', label: 'Any request to alter an original document' },
  { code: 'suspected_fraud', label: 'Any suspected fraud or unauthorized access' },
] as const;

export function differenceSeverity(diff: number | null, hasCarrierTotal: boolean): string {
  if (!hasCarrierTotal) return 'missing_carrier_total';
  if (diff == null || Number.isNaN(diff)) return 'missing_carrier_total';
  const a = Math.abs(diff);
  if (a === 0) return 'exact';
  if (a <= 1) return 'rounding';
  if (a <= 50) return 'low';
  if (a <= 200) return 'medium';
  if (a <= 500) return 'high';
  return 'critical';
}

export const SEVERITY_PLAIN: Record<string, string> = {
  exact: 'Exact match — mark control total matched.',
  rounding: 'Difference within $1 — matched, rounding.',
  low: 'Difference $1–$50 — low exception.',
  medium: 'Difference $50–$200 — medium exception.',
  high: 'Difference $200–$500 — high exception.',
  critical: 'Difference over $500 — critical exception. Escalate.',
  missing_carrier_total: 'Carrier statement does not provide a control total.',
};

export const SYSTEMS = [
  { name: 'Carrier and MGA portals', use: 'Where statements are downloaded. Use your named login + MFA.' },
  { name: 'Carrier Control Log', use: 'Tracks what is due, retrieved, missing, and approved.' },
  { name: 'Commission inbox', use: 'Approved location for dropping original statements.' },
  { name: 'Commission tracker (this app)', use: 'Where statements are staged and prepared for approval.' },
  { name: 'NowCerts', use: 'Verify insureds, policies, dates, and lines of business.' },
  { name: 'Nextcloud', use: 'Permanent archive for original carrier documents.' },
  { name: 'Bank or accounting report', use: 'Match deposits only unless broader access is approved.' },
];

export function glossaryById(id: string): GlossaryEntry | undefined {
  return GLOSSARY.find((g) => g.id === id);
}
