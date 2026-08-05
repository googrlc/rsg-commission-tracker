"""Estimated chargeback / forgone commission on cancel.

Mirrors ``src/utils/cancelChargeback.ts``. Spec §1 / §4:

- **advance** — carrier claws back the unearned remainder
- **as_earned** — no clawback; forgone = expected × unearned-term-fraction
- **hybrid / confirm_on_upload** — same pro-rata figure, flagged for review

Unearned fraction is day-based over ``[effective, expiration)``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any


def _as_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _as_money(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        amount = Decimal(str(value))
    except Exception:
        return None
    if amount <= 0:
        return None
    return amount


def _round_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class CancelChargebackEstimate:
    unearned_fraction: Decimal
    term_days: int
    days_earned: int
    days_remaining: int
    estimated_chargeback: Decimal | None
    estimated_forgone: Decimal | None
    primary_label: str  # estimated_chargeback | estimated_forgone | unconfirmed | none
    primary_amount: Decimal | None
    payment_model: str
    mid_term: bool
    reason: str


def estimate_cancel_chargeback(
    *,
    effective_date: Any,
    expiration_date: Any,
    cancel_date: Any,
    expected_commission: Any,
    advance_amount: Any = None,
    payment_model: str | None = None,
) -> CancelChargebackEstimate:
    model = (payment_model or "confirm_on_upload").strip().lower()
    eff = _as_date(effective_date)
    exp = _as_date(expiration_date)
    cancel = _as_date(cancel_date)
    base = _as_money(advance_amount) or _as_money(expected_commission)

    def empty(reason: str, mid_term: bool = False) -> CancelChargebackEstimate:
        return CancelChargebackEstimate(
            unearned_fraction=Decimal("0"),
            term_days=0,
            days_earned=0,
            days_remaining=0,
            estimated_chargeback=None,
            estimated_forgone=None,
            primary_label="none",
            primary_amount=None,
            payment_model=model,
            mid_term=mid_term,
            reason=reason,
        )

    if not eff or not exp or not cancel:
        return empty("Need effective, expiration, and cancel dates to price a cancel.")
    if base is None:
        return empty("No expected/advance commission on file to pro-rate.")

    term_days = max(1, (exp - eff).days)
    days_earned = min(term_days, max(0, (cancel - eff).days))
    days_remaining = max(0, term_days - days_earned)
    unearned = (Decimal(days_remaining) / Decimal(term_days)).quantize(
        Decimal("0.000001")
    )
    unearned = min(Decimal("1"), max(Decimal("0"), unearned))
    mid_term = cancel < exp
    pro_rata = _round_money(base * unearned)

    if not mid_term or unearned == 0:
        zero = Decimal("0.00")
        label = "estimated_forgone" if model == "as_earned" else "estimated_chargeback"
        return CancelChargebackEstimate(
            unearned_fraction=Decimal("0"),
            term_days=term_days,
            days_earned=days_earned,
            days_remaining=0,
            estimated_chargeback=zero,
            estimated_forgone=zero,
            primary_label=label,
            primary_amount=zero,
            payment_model=model,
            mid_term=False,
            reason="Cancel on or after original term end — nothing unearned.",
        )

    if model == "as_earned":
        return CancelChargebackEstimate(
            unearned_fraction=unearned,
            term_days=term_days,
            days_earned=days_earned,
            days_remaining=days_remaining,
            estimated_chargeback=Decimal("0.00"),
            estimated_forgone=pro_rata,
            primary_label="estimated_forgone",
            primary_amount=pro_rata,
            payment_model=model,
            mid_term=True,
            reason=(
                f"As-earned: stop earning; forgone ≈ "
                f"{int(unearned * 100)}% of expected remaining."
            ),
        )

    if model == "advance":
        return CancelChargebackEstimate(
            unearned_fraction=unearned,
            term_days=term_days,
            days_earned=days_earned,
            days_remaining=days_remaining,
            estimated_chargeback=pro_rata,
            estimated_forgone=pro_rata,
            primary_label="estimated_chargeback",
            primary_amount=pro_rata,
            payment_model=model,
            mid_term=True,
            reason=(
                f"Advance: est. clawback ≈ "
                f"{int(unearned * 100)}% of term commission unearned."
            ),
        )

    return CancelChargebackEstimate(
        unearned_fraction=unearned,
        term_days=term_days,
        days_earned=days_earned,
        days_remaining=days_remaining,
        estimated_chargeback=pro_rata,
        estimated_forgone=pro_rata,
        primary_label="unconfirmed",
        primary_amount=pro_rata,
        payment_model=model,
        mid_term=True,
        reason=(
            f'Payment model "{model}" unconfirmed — showing pro-rata '
            f"unearned (${pro_rata}) for review."
        ),
    )
