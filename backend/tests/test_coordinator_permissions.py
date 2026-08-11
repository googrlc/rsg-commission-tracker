"""Approver vs coordinator gates on the money path."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from hermes_finance.service import create_app

app = create_app()


@pytest.fixture(autouse=True)
def _reset_singletons():
    from hermes_app import deps
    deps.reset_clients()
    yield
    deps.reset_clients()


@pytest.fixture
def client():
    return TestClient(app)


class RoleSupa:
    def __init__(self, *, admin_emails: set[str], crm_emails: set[str]):
        self.admin_emails = {e.lower() for e in admin_emails}
        self.crm_emails = {e.lower() for e in crm_emails}
        self.tables = {
            "app_allowlist": [
                {"email": e, "is_admin": e.lower() in self.admin_emails}
                for e in (admin_emails | {c for c in crm_emails})
            ],
            "agency_crm_users": [
                {"email": e, "active": True} for e in crm_emails
            ],
            "commission_ingest_batches": [
                {
                    "id": "batch-1",
                    "ingest_status": "pending_review",
                    "source_file": "x.csv",
                    "flags": {},
                    "handoff_status": "draft",
                }
            ],
            "agency_bill_remittances": [
                {
                    "id": "rem-1",
                    "status": "pending_approval",
                    "carrier_name": "Test",
                },
                {
                    "id": "rem-draft",
                    "status": "drafted",
                    "carrier_name": "Test",
                },
            ],
        }
        self.updates: list[tuple[str, str, dict]] = []

    def select(self, table, *, columns="*", params=None, limit=1000):
        rows = list(self.tables.get(table, []))
        for k, v in (params or {}).items():
            if k == "order":
                continue
            if isinstance(v, str) and v.startswith("eq."):
                want = v[3:].casefold()
                rows = [r for r in rows if str(r.get(k)).casefold() == want]
        return [dict(r) for r in rows][:limit]

    def update(self, table, row_id, payload):
        self.updates.append((table, row_id, dict(payload)))
        for row in self.tables.get(table, []):
            if str(row.get("id")) == str(row_id):
                row.update(payload)
                return dict(row)
        return {"id": row_id, **payload}

    def insert(self, table, payload):
        row = {"id": f"new-{len(self.tables.get(table, []))}", **payload}
        self.tables.setdefault(table, []).append(row)
        return dict(row)


COORD = "coord@risksolutionsgroup.net"
ADMIN = "admin@risksolutionsgroup.net"


def test_capabilities_marks_admin_as_approver(client):
    supa = RoleSupa(admin_emails={ADMIN}, crm_emails={ADMIN, COORD})
    with patch("hermes_app.deps.get_supa", return_value=supa):
        r = client.get(f"/api/commission-capabilities?email={ADMIN}")
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "approver"
    assert body["can_approve"] is True


def test_capabilities_marks_non_admin_as_coordinator(client):
    supa = RoleSupa(admin_emails={ADMIN}, crm_emails={ADMIN, COORD})
    with patch("hermes_app.deps.get_supa", return_value=supa):
        r = client.get(f"/api/commission-capabilities?email={COORD}")
    assert r.status_code == 200
    body = r.json()
    assert body["role"] == "coordinator"
    assert body["can_approve"] is False


def test_coordinator_cannot_approve_statement(client):
    supa = RoleSupa(admin_emails={ADMIN}, crm_emails={ADMIN, COORD})
    with patch("hermes_app.deps.get_supa", return_value=supa):
        r = client.post(
            "/api/commission-statements/batch-1/approve",
            json={"approved_by": COORD, "confirmed_source": True},
        )
    assert r.status_code == 403
    assert "not allowed" in r.json()["detail"].lower()


def test_coordinator_cannot_reject_statement(client):
    supa = RoleSupa(admin_emails={ADMIN}, crm_emails={ADMIN, COORD})
    with patch("hermes_app.deps.get_supa", return_value=supa):
        r = client.post(
            "/api/commission-statements/batch-1/reject",
            json={"approved_by": COORD, "reason": "nope"},
        )
    assert r.status_code == 403


def test_coordinator_can_handoff(client):
    supa = RoleSupa(admin_emails={ADMIN}, crm_emails={ADMIN, COORD})
    with patch("hermes_app.deps.get_supa", return_value=supa):
        r = client.post(
            "/api/commission-statements/batch-1/handoff",
            json={
                "prepared_by": COORD,
                "handoff_status": "ready_for_approval",
                "prep_checklist": {"recommended": "ready_for_approval"},
            },
        )
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert any(u[0] == "commission_ingest_batches" for u in supa.updates)


def test_coordinator_cannot_approve_remittance(client):
    supa = RoleSupa(admin_emails={ADMIN}, crm_emails={ADMIN, COORD})
    with patch("hermes_app.deps.get_supa", return_value=supa):
        r = client.post(
            "/api/agency-bill/remittances/rem-1/approve",
            json={"approved_by": COORD},
        )
    assert r.status_code == 403


def test_approver_can_approve_remittance(client):
    supa = RoleSupa(admin_emails={ADMIN}, crm_emails={ADMIN, COORD})
    with patch("hermes_app.deps.get_supa", return_value=supa):
        r = client.post(
            "/api/agency-bill/remittances/rem-1/approve",
            json={"approved_by": ADMIN},
        )
    assert r.status_code == 200
    assert r.json()["remittance"]["status"] == "approved"


def test_coordinator_can_submit_remittance(client):
    supa = RoleSupa(admin_emails={ADMIN}, crm_emails={ADMIN, COORD})
    with patch("hermes_app.deps.get_supa", return_value=supa):
        r = client.post(
            "/api/agency-bill/remittances/rem-draft/submit",
            json={"prepared_by": COORD},
        )
    assert r.status_code == 200
    assert r.json()["remittance"]["status"] == "pending_approval"


def test_coordinator_cannot_upsert_rules(client):
    supa = RoleSupa(admin_emails={ADMIN}, crm_emails={ADMIN, COORD})
    with patch("hermes_app.deps.get_supa", return_value=supa):
        r = client.post(
            "/api/commission-rules",
            json={
                "carrier_name": "Progressive",
                "lob": "Auto",
                "nb_percent": 10,
                "changed_by": COORD,
            },
        )
    assert r.status_code == 403


def test_env_approver_override(client, monkeypatch):
    monkeypatch.setenv("COMMISSION_APPROVER_EMAILS", COORD)
    supa = RoleSupa(admin_emails={ADMIN}, crm_emails={ADMIN, COORD})
    with patch("hermes_app.deps.get_supa", return_value=supa):
        caps = client.get(f"/api/commission-capabilities?email={COORD}").json()
        assert caps["can_approve"] is True
