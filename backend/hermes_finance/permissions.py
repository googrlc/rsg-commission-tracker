"""Coordinator vs approver capabilities for the finance money gate.

The SPA may hide Approve buttons, but enforcement lives here: any allowlisted
user can stage and prepare; only an approver (app_allowlist.is_admin) may
approve/reject statements, override ledger fields, or release remittances.

Fail closed: unknown or non-admin identities cannot approve money.
"""

from __future__ import annotations

import os
from typing import Any, Literal

from fastapi import HTTPException

Role = Literal["approver", "coordinator"]


def _env_approver_emails() -> set[str]:
    raw = os.environ.get("COMMISSION_APPROVER_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def lookup_allowlist_row(supa: Any, email: str) -> dict[str, Any] | None:
    """Return the app_allowlist row for ``email``, or None."""
    want = (email or "").strip().lower()
    if not want:
        return None
    try:
        rows = supa.select(
            "app_allowlist",
            columns="email,is_admin,display_name",
            params={"email": f"eq.{want}"},
            limit=1,
        )
    except Exception:
        rows = []
    if rows:
        return rows[0]
    # Some projects store mixed-case emails; fall back to a short scan.
    try:
        all_rows = supa.select(
            "app_allowlist",
            columns="email,is_admin,display_name",
            limit=2000,
        )
    except Exception:
        return None
    for row in all_rows or []:
        if str(row.get("email") or "").strip().lower() == want:
            return row
    return None


def capabilities_for_email(supa: Any, email: str) -> dict[str, Any]:
    """Shape mirrored by the SQL RPC ``commission_user_capabilities()``."""
    want = (email or "").strip().lower()
    env_approvers = _env_approver_emails()
    row = lookup_allowlist_row(supa, want) if want else None
    allowlisted = row is not None
    if env_approvers and want in env_approvers:
        return {
            "role": "approver",
            "can_approve": True,
            "allowlisted": allowlisted or True,
            "email": want or None,
        }
    if not allowlisted:
        return {
            "role": None,
            "can_approve": False,
            "allowlisted": False,
            "email": want or None,
        }
    is_admin = bool(row.get("is_admin"))
    role: Role = "approver" if is_admin else "coordinator"
    return {
        "role": role,
        "can_approve": is_admin,
        "allowlisted": True,
        "email": want,
    }


def user_can_approve(supa: Any, email: str) -> bool:
    return bool(capabilities_for_email(supa, email).get("can_approve"))


def require_approver(supa: Any, email: str, *, action: str = "approve") -> None:
    """Raise 403 unless ``email`` is an approver. Call after require_users."""
    if user_can_approve(supa, email):
        return
    raise HTTPException(
        status_code=403,
        detail=(
            f"'{email}' is not allowed to {action}. "
            "Coordinators collect, document, validate, and prepare — "
            "only an approver may book money, change rates, or release payments."
        ),
    )
