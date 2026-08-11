"""Unit tests for capability lookup helpers."""

from __future__ import annotations

from hermes_finance.permissions import capabilities_for_email, user_can_approve


class FakeSupa:
    def __init__(self, rows):
        self.rows = rows

    def select(self, table, *, columns="*", params=None, limit=100):
        assert table == "app_allowlist"
        rows = list(self.rows)
        for k, v in (params or {}).items():
            if isinstance(v, str) and v.startswith("eq."):
                want = v[3:].casefold()
                rows = [r for r in rows if str(r.get(k)).casefold() == want]
        return rows[:limit]


def test_unknown_email_cannot_approve():
    supa = FakeSupa([])
    assert user_can_approve(supa, "nobody@example.com") is False
    caps = capabilities_for_email(supa, "nobody@example.com")
    assert caps["allowlisted"] is False
    assert caps["can_approve"] is False


def test_admin_can_approve():
    supa = FakeSupa([{"email": "a@x.net", "is_admin": True}])
    assert user_can_approve(supa, "a@x.net") is True
    assert capabilities_for_email(supa, "a@x.net")["role"] == "approver"


def test_non_admin_is_coordinator():
    supa = FakeSupa([{"email": "c@x.net", "is_admin": False}])
    assert user_can_approve(supa, "c@x.net") is False
    assert capabilities_for_email(supa, "c@x.net")["role"] == "coordinator"
