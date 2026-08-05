"""Pro-rata estimated chargeback / forgone on cancel."""

from decimal import Decimal

from hermes_finance.cancel_math import estimate_cancel_chargeback


def test_advance_midterm_chargeback_is_unearned_share_of_expected():
    # 180-day term, cancel at day 60 → 120/180 = 2/3 unearned
    est = estimate_cancel_chargeback(
        effective_date="2026-01-01",
        expiration_date="2026-07-01",  # 181 days in a non-leap... use fixed
        cancel_date="2026-03-02",
        expected_commission=300,
        payment_model="advance",
    )
    assert est.mid_term is True
    assert est.primary_label == "estimated_chargeback"
    assert est.term_days == 181  # Jan1→Jul1
    # days earned Jan1→Mar2 = 60; remaining 121; 121/181
    assert est.days_earned == 60
    assert est.estimated_chargeback == Decimal("200.55")  # 300 * 121/181
    assert est.primary_amount == est.estimated_chargeback


def test_as_earned_midterm_is_forgone_not_chargeback():
    est = estimate_cancel_chargeback(
        effective_date="2026-01-01",
        expiration_date="2026-07-01",
        cancel_date="2026-03-02",
        expected_commission=300,
        payment_model="as_earned",
    )
    assert est.estimated_chargeback == Decimal("0.00")
    assert est.estimated_forgone == Decimal("200.55")
    assert est.primary_label == "estimated_forgone"


def test_cancel_on_term_end_is_zero():
    est = estimate_cancel_chargeback(
        effective_date="2026-01-01",
        expiration_date="2026-07-01",
        cancel_date="2026-07-01",
        expected_commission=300,
        payment_model="advance",
    )
    assert est.mid_term is False
    assert est.estimated_chargeback == Decimal("0.00")
    assert est.primary_amount == Decimal("0.00")


def test_prefers_advance_amount_over_expected():
    est = estimate_cancel_chargeback(
        effective_date="2026-01-01",
        expiration_date="2026-07-01",
        cancel_date="2026-03-02",
        expected_commission=300,
        advance_amount=600,
        payment_model="advance",
    )
    assert est.estimated_chargeback == Decimal("401.10")  # 600 * 121/181


def test_missing_dates_returns_none():
    est = estimate_cancel_chargeback(
        effective_date="2026-01-01",
        expiration_date=None,
        cancel_date="2026-03-02",
        expected_commission=300,
        payment_model="advance",
    )
    assert est.primary_amount is None
    assert est.primary_label == "none"
