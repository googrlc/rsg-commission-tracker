/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Estimated chargeback / forgone commission on cancel.
 *
 * Spec (COMMISSION_RECONCILIATION_BUILD_SPEC §1 / §4):
 *   advance      → carrier claws back the unearned remainder (estimated chargeback)
 *   as_earned    → no clawback; forgone = expected × unearned-term-fraction
 *   hybrid/other → estimate the same pro-rata figure but flag for review
 *
 * Unearned fraction is day-based over [effective, expiration):
 *   daysRemaining / termDays, clamped to [0, 1].
 * A cancel on/after term end → $0. Missing dates/expected → null (can't price).
 */

export type PaymentModel = 'advance' | 'as_earned' | 'hybrid' | 'confirm_on_upload' | string;

export interface CancelChargebackInput {
  effectiveDate: string | null | undefined;   // YYYY-MM-DD
  expirationDate: string | null | undefined;  // original term end
  cancelDate: string | null | undefined;      // AMS or statement cancel date
  /** Full-term expected (or advance paid). */
  expectedCommission: number | null | undefined;
  /** Prefer this over expected when set (ledger.advance_amount). */
  advanceAmount?: number | null | undefined;
  paymentModel?: PaymentModel | null | undefined;
}

export interface CancelChargebackEstimate {
  /** Day-based unearned remainder of the term, 0..1. */
  unearnedFraction: number;
  termDays: number;
  daysEarned: number;
  daysRemaining: number;
  /** Dollars expected back from the carrier (advance/hybrid). 0 for as_earned. */
  estimatedChargeback: number | null;
  /** Opportunity loss on unearned remainder (as_earned primary; also filled for advance). */
  estimatedForgone: number | null;
  /** Which figure the UI should lead with. */
  primaryLabel: 'estimated_chargeback' | 'estimated_forgone' | 'unconfirmed' | 'none';
  primaryAmount: number | null;
  paymentModel: string;
  midTerm: boolean;
  reason: string;
}

function parseYmd(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function estimateCancelChargeback(input: CancelChargebackInput): CancelChargebackEstimate {
  const model = (input.paymentModel || 'confirm_on_upload').toLowerCase();
  const eff = parseYmd(input.effectiveDate);
  const exp = parseYmd(input.expirationDate);
  const cancel = parseYmd(input.cancelDate);
  const base = input.advanceAmount != null && input.advanceAmount > 0
    ? Number(input.advanceAmount)
    : input.expectedCommission != null
      ? Number(input.expectedCommission)
      : null;

  const empty = (reason: string, midTerm = false): CancelChargebackEstimate => ({
    unearnedFraction: 0,
    termDays: 0,
    daysEarned: 0,
    daysRemaining: 0,
    estimatedChargeback: null,
    estimatedForgone: null,
    primaryLabel: 'none',
    primaryAmount: null,
    paymentModel: model,
    midTerm,
    reason,
  });

  if (!eff || !exp || !cancel) {
    return empty('Need effective, expiration, and cancel dates to price a cancel.');
  }
  if (base == null || !(base > 0)) {
    return empty('No expected/advance commission on file to pro-rate.');
  }

  const termDays = Math.max(1, daysBetween(eff, exp));
  const daysEarned = Math.min(termDays, Math.max(0, daysBetween(eff, cancel)));
  const daysRemaining = Math.max(0, termDays - daysEarned);
  const unearnedFraction = Math.min(1, Math.max(0, daysRemaining / termDays));
  const midTerm = cancel < exp;
  const proRata = roundMoney(base * unearnedFraction);

  if (!midTerm || unearnedFraction === 0) {
    return {
      unearnedFraction: 0,
      termDays,
      daysEarned,
      daysRemaining: 0,
      estimatedChargeback: 0,
      estimatedForgone: 0,
      primaryLabel: model === 'as_earned' ? 'estimated_forgone' : 'estimated_chargeback',
      primaryAmount: 0,
      paymentModel: model,
      midTerm: false,
      reason: 'Cancel on or after original term end — nothing unearned.',
    };
  }

  if (model === 'as_earned') {
    return {
      unearnedFraction,
      termDays,
      daysEarned,
      daysRemaining,
      estimatedChargeback: 0,
      estimatedForgone: proRata,
      primaryLabel: 'estimated_forgone',
      primaryAmount: proRata,
      paymentModel: model,
      midTerm: true,
      reason: `As-earned: stop earning; forgone ≈ ${Math.round(unearnedFraction * 100)}% of expected remaining.`,
    };
  }

  if (model === 'advance') {
    return {
      unearnedFraction,
      termDays,
      daysEarned,
      daysRemaining,
      estimatedChargeback: proRata,
      estimatedForgone: proRata,
      primaryLabel: 'estimated_chargeback',
      primaryAmount: proRata,
      paymentModel: model,
      midTerm: true,
      reason: `Advance: est. clawback ≈ ${Math.round(unearnedFraction * 100)}% of term commission unearned.`,
    };
  }

  // hybrid / confirm_on_upload — still compute the figure, flag for review
  return {
    unearnedFraction,
    termDays,
    daysEarned,
    daysRemaining,
    estimatedChargeback: proRata,
    estimatedForgone: proRata,
    primaryLabel: 'unconfirmed',
    primaryAmount: proRata,
    paymentModel: model,
    midTerm: true,
    reason: `Payment model "${model}" unconfirmed — showing pro-rata unearned ($${proRata}) for review.`,
  };
}
