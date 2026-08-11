"""Finance — the commission surface.

Commission rules, the ledger and its analytics, human overrides on money rows,
and the carrier-statement upload/review/approve gate.

First app split out of hermes/api.py (docs/repo-split-plan.md, Phase 2): it has
the least coupling of the six — it reaches only for the shared deps, the
commissions domain and the overrides store, and nothing reaches back into it.

The approve endpoint is the money gate. Statements stage on upload and commit
only on an explicit, named approval; nothing here writes to the AMS.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from hermes_app import deps
from hermes_finance.permissions import capabilities_for_email, require_approver

log = logging.getLogger(__name__)

router = APIRouter()


class CommissionRuleRequest(BaseModel):
    id: str | None = None
    carrier_name: str
    lob: str
    nb_percent: float | None = None
    renewal_percent: float | None = None
    commission_basis: str | None = "gross"
    active: bool = True
    # Named actor — required so coordinators cannot write rates via the API.
    changed_by: str | None = None


@router.get("/api/commission-capabilities")
def commission_capabilities(email: str):
    """Role for the signed-in user — mirrors SQL ``commission_user_capabilities``."""
    return capabilities_for_email(deps.get_supa(), email)


@router.get("/api/commission-rules")
def list_commission_rules(limit: int = 500):
    """Commission terms — carrier/LOB → new-business % and renewal %."""
    rows = deps.get_supa().select(
        "commission_rules",
        columns="id,carrier_name,lob,nb_percent,renewal_percent,commission_basis,active",
        params={"order": "carrier_name.asc"}, limit=limit,
    )
    return {"rules": rows, "count": len(rows)}


@router.post("/api/commission-rules")
def upsert_commission_rule(req: CommissionRuleRequest):
    """Add or update a commission term (carrier + LOB rate). Feeds expected
    commission when NowCerts doesn't carry an agency commission amount."""
    supa = deps.get_supa()
    actor = (req.changed_by or "").strip()
    if not actor:
        raise HTTPException(status_code=400, detail="changed_by is required")
    deps.require_users(supa, [("changed_by", actor)])
    require_approver(supa, actor, action="change commission rates")
    payload = {k: v for k, v in {
        "carrier_name": (req.carrier_name or "").strip(),
        "lob": (req.lob or "").strip(),
        "nb_percent": req.nb_percent,
        "renewal_percent": req.renewal_percent,
        "commission_basis": req.commission_basis or "gross",
        "active": req.active,
    }.items() if v is not None}
    if not payload.get("carrier_name") or not payload.get("lob"):
        raise HTTPException(status_code=400, detail="carrier_name and lob are required")
    try:
        row = supa.update("commission_rules", req.id, payload) if req.id else supa.insert("commission_rules", payload)
    except Exception as exc:
        log.exception("commission rule upsert failed")
        raise HTTPException(status_code=502, detail=str(exc))
    return {"ok": True, "rule": row}


@router.get("/api/commissions")
def list_commissions_endpoint(limit: int = 1000, status: str = "reconciled"):
    """Commission ledger, plus the context that keeps an empty result honest.

    Always returns ``counts_by_status`` (over the whole ledger) and ``coverage``
    (how much of the active book reaches the surface, and why the rest doesn't)
    — regardless of what ``status`` matches. Filtering to a status with no rows
    used to render a blank table that read as "no commission data exists", which
    was false for the entire life of the ledger. Pass ``status=all`` for everything.
    """
    from hermes_finance.surface import commission_overview

    try:
        overview = commission_overview(deps.get_supa(), status=status, limit=limit)
    except Exception as exc:
        log.exception("commissions read failed")
        raise HTTPException(status_code=502, detail=str(exc))
    return overview.as_dict()


@router.get("/api/commissions/analytics")
def commission_analytics_endpoint():
    """Whole-ledger rollups by carrier and by line of business (#236).

    The lens for "is the cockpit sufficient to replace the standalone tracker?"
    Per-carrier and per-LOB expected/actual/delta plus a status breakdown, over
    the entire ledger regardless of reconciliation status — a carrier with only
    `pending` rows still appears with its expected money.
    """
    from hermes_finance.surface import commission_analytics

    try:
        return commission_analytics(deps.get_supa()).as_dict()
    except Exception as exc:
        log.exception("commissions analytics read failed")
        raise HTTPException(status_code=502, detail=str(exc))


class CommissionOverrideRequest(BaseModel):
    """A human correction to a commission row.

    ``approved_by`` must be an active agency_crm_users identity — an override is
    a named decision on money data, and the audit log records who made it.
    """
    field_name: str
    value: Any
    approved_by: str
    reason: str | None = None


@router.post("/api/commissions/{ledger_id}/override")
def override_commission_field(ledger_id: str, req: CommissionOverrideRequest):
    """Correct a commission field in the portal.

    The override outranks the synced value until the AMS reports the same thing,
    at which point the nightly reconcile retires it automatically. Fix NowCerts
    by hand separately — this does NOT write to the AMS.
    """
    from hermes_finance.surface import ENTITY_TYPE, OVERRIDABLE_FIELDS
    from hermes_core.overrides.store import set_override

    supa = deps.get_supa()
    deps.require_users(supa, [("approved_by", req.approved_by)])
    require_approver(supa, req.approved_by, action="override commission ledger fields")

    field_name = (req.field_name or "").strip()
    if field_name not in OVERRIDABLE_FIELDS:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name!r} is not overridable; allowed: {sorted(OVERRIDABLE_FIELDS)}",
        )

    try:
        rows = supa.select("commission_ledger", columns="*",
                           params={"id": f"eq.{ledger_id}"}, limit=1)
    except Exception:
        rows = []          # malformed uuid -> not found
    if not rows:
        raise HTTPException(status_code=404, detail="commission row not found")
    ledger = rows[0]

    policy_number = str(ledger.get("policy_number") or "").strip()
    if not policy_number:
        raise HTTPException(
            status_code=400,
            detail="row has no policy_number; overrides are keyed by it so they "
                   "survive a re-seed",
        )

    try:
        row = set_override(
            supa,
            entity_type=ENTITY_TYPE,
            entity_key=policy_number,
            field_name=field_name,
            override_value=req.value,
            original_value=ledger.get(field_name),   # the SOURCE value, for reconcile
            approved_by=req.approved_by,
            reason=req.reason,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        log.exception("commission override failed: %s %s", ledger_id, field_name)
        raise HTTPException(status_code=502, detail=str(exc))

    return {"ok": True, "override": row,
            "note": "Portal value only — correct NowCerts separately. The override "
                    "retires itself once the AMS reports the same value."}


@router.delete("/api/commissions/overrides/{override_id}")
def withdraw_commission_override(override_id: str, approved_by: str):
    """Withdraw an override — the correction was wrong or is no longer wanted."""
    from hermes_core.overrides.store import withdraw

    supa = deps.get_supa()
    deps.require_users(supa, [("approved_by", approved_by)])
    require_approver(supa, approved_by, action="withdraw commission overrides")
    try:
        row = withdraw(supa, override_id, actor=approved_by)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        log.exception("override withdraw failed: %s", override_id)
        raise HTTPException(status_code=502, detail=str(exc))
    return {"ok": True, "override": row}


@router.get("/api/commissions/overrides")
def list_commission_overrides(status: str = "active", limit: int = 500):
    """Active corrections, plus anything the sync flagged as conflicted."""
    from hermes_finance.surface import ENTITY_TYPE

    params: dict[str, str] = {"entity_type": f"eq.{ENTITY_TYPE}",
                              "order": "approved_at.desc"}
    if status and status.lower() != "all":
        params["status"] = f"eq.{status}"
    rows = deps.get_supa().select("portal_overrides", columns="*", params=params, limit=limit)
    return {"overrides": rows, "count": len(rows)}


# ── Commission statements — upload, review, approve ──────────────────────────
@router.post("/api/commission-statements")
async def upload_commission_statement(
    file: UploadFile = File(...),
    uploaded_by: str = Form(...),
    carrier: str = Form(default=""),
    stated_total_premium: str = Form(default=""),
    stated_total_commission: str = Form(default=""),
):
    """Upload a carrier statement. Parses and STAGES it — writes no money.

    Returns a review card: what parsed, whether it matches the carrier's own
    stated totals, and where every line would land. Approve separately.

    Supply the carrier's stated totals when the statement prints them; the
    crosscheck is what stops a bad parse reaching the ledger.
    """
    from hermes_finance.statements import stage_statement

    supa = deps.get_supa()
    deps.require_users(supa, [("uploaded_by", uploaded_by)])

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="empty file")

    try:
        staged = stage_statement(
            supa,
            content=content,
            filename=file.filename or "statement.csv",
            uploaded_by=uploaded_by,
            carrier=carrier.strip() or None,
            stated_premium=stated_total_premium.strip() or None,
            stated_commission=stated_total_commission.strip() or None,
        )
    except Exception as exc:
        log.exception("statement staging failed: %s", file.filename)
        raise HTTPException(status_code=502, detail=str(exc))
    return staged.as_dict()


@router.get("/api/commission-statements")
def list_commission_batches(status: str = "", limit: int = 50):
    """Uploaded statement batches, newest first."""
    from hermes_finance.statements import BATCHES_TABLE

    params: dict[str, str] = {"order": "created_at.desc"}
    if status.strip():
        params["ingest_status"] = f"eq.{status.strip()}"
    rows = deps.get_supa().select(BATCHES_TABLE, columns="*", params=params, limit=limit)
    return {"batches": rows, "count": len(rows)}


@router.get("/api/commission-statements/{batch_id}")
def get_commission_batch(batch_id: str, lines: int = 100):
    """One batch plus its staged lines — the review detail."""
    from hermes_finance.statements import BATCHES_TABLE, STAGING_TABLE

    supa = deps.get_supa()
    rows = supa.select(BATCHES_TABLE, columns="*", params={"id": f"eq.{batch_id}"}, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="batch not found")
    staged = supa.select(STAGING_TABLE, columns="*",
                         params={"batch_id": f"eq.{batch_id}"}, limit=lines)
    return {"batch": rows[0], "lines": staged, "line_count": len(staged)}


class StatementDecision(BaseModel):
    approved_by: str
    reason: str | None = None
    # PDF batches only: the approver states they compared the parsed lines
    # against the document. Ignored for CSV/XLSX, which name their own columns.
    confirmed_source: bool = False


@router.post("/api/commission-statements/{batch_id}/approve")
def approve_commission_statement(batch_id: str, req: StatementDecision):
    """Commit a reviewed batch: statement + transactions + link + rollup.

    This is the money gate. Refuses a batch that isn't pending review, parsed
    nothing, or failed its crosscheck — and refuses a PDF batch outright unless
    ``confirmed_source`` says a human checked it against the document.
    """
    from hermes_finance.statements import commit_statement

    supa = deps.get_supa()
    deps.require_users(supa, [("approved_by", req.approved_by)])
    require_approver(supa, req.approved_by, action="approve and book commission statements")
    try:
        result = commit_statement(supa, batch_id=batch_id, approved_by=req.approved_by,
                                  confirmed_source=req.confirmed_source)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        log.exception("statement commit failed: %s", batch_id)
        raise HTTPException(status_code=502, detail=str(exc))
    return {"ok": True, **result.as_dict()}


@router.post("/api/commission-statements/{batch_id}/reject")
def reject_commission_statement(batch_id: str, req: StatementDecision):
    """Reject a staged batch. The staged lines stay for diagnosis."""
    from hermes_finance.statements import reject_statement

    supa = deps.get_supa()
    deps.require_users(supa, [("approved_by", req.approved_by)])
    require_approver(supa, req.approved_by, action="reject commission statements")
    try:
        row = reject_statement(supa, batch_id=batch_id,
                               reviewed_by=req.approved_by, reason=req.reason)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        log.exception("statement reject failed: %s", batch_id)
        raise HTTPException(status_code=502, detail=str(exc))
    return {"ok": True, "batch": row}


class StatementHandoff(BaseModel):
    prepared_by: str
    handoff_status: str = "ready_for_approval"
    prep_checklist: dict[str, Any] | None = None
    return_notes: str | None = None


@router.post("/api/commission-statements/{batch_id}/handoff")
def handoff_commission_statement(batch_id: str, req: StatementHandoff):
    """Coordinator marks a staged batch ready for (or returned from) approval.

    Does not book money. Coordinators and approvers may both call this.
    """
    from hermes_finance.statements import BATCHES_TABLE

    allowed = {"draft", "ready_for_approval", "returned"}
    status = (req.handoff_status or "").strip()
    if status not in allowed:
        raise HTTPException(status_code=400, detail=f"handoff_status must be one of {sorted(allowed)}")

    supa = deps.get_supa()
    deps.require_users(supa, [("prepared_by", req.prepared_by)])
    rows = supa.select(BATCHES_TABLE, columns="*", params={"id": f"eq.{batch_id}"}, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="batch not found")

    from datetime import datetime

    payload: dict[str, Any] = {
        "handoff_status": status,
        "prepared_by": req.prepared_by,
        "prepared_at": datetime.now().astimezone().isoformat(),
    }
    if req.prep_checklist is not None:
        payload["prep_checklist"] = req.prep_checklist
    if req.return_notes:
        flags = dict(rows[0].get("flags") or {})
        flags["return_notes"] = req.return_notes
        payload["flags"] = flags
    try:
        row = supa.update(BATCHES_TABLE, batch_id, payload)
    except Exception as exc:
        log.exception("statement handoff failed: %s", batch_id)
        raise HTTPException(status_code=502, detail=str(exc))
    return {"ok": True, "batch": row}


class RemittanceDecision(BaseModel):
    approved_by: str
    confirmation_number: str | None = None
    reason: str | None = None


class RemittanceSubmit(BaseModel):
    prepared_by: str


@router.post("/api/agency-bill/remittances/{remittance_id}/submit")
def submit_agency_bill_remittance(remittance_id: str, req: RemittanceSubmit):
    """Coordinator submits a drafted remittance for manager approval."""
    from datetime import datetime

    supa = deps.get_supa()
    deps.require_users(supa, [("prepared_by", req.prepared_by)])
    rows = supa.select(
        "agency_bill_remittances", columns="*",
        params={"id": f"eq.{remittance_id}"}, limit=1,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="remittance not found")
    if rows[0].get("status") not in ("drafted", "returned"):
        raise HTTPException(status_code=400, detail=f"remittance is {rows[0].get('status')}")
    try:
        row = supa.update("agency_bill_remittances", remittance_id, {
            "status": "pending_approval",
            "prepared_by": req.prepared_by,
            "updated_at": datetime.now().astimezone().isoformat(),
        })
    except Exception as exc:
        log.exception("remittance submit failed: %s", remittance_id)
        raise HTTPException(status_code=502, detail=str(exc))
    return {"ok": True, "remittance": row}


@router.post("/api/agency-bill/remittances/{remittance_id}/approve")
def approve_agency_bill_remittance(remittance_id: str, req: RemittanceDecision):
    """Approver-only: authorize the prepared carrier remittance (does not send ACH)."""
    from datetime import datetime

    supa = deps.get_supa()
    deps.require_users(supa, [("approved_by", req.approved_by)])
    require_approver(supa, req.approved_by, action="approve agency-bill remittances")
    rows = supa.select(
        "agency_bill_remittances", columns="*",
        params={"id": f"eq.{remittance_id}"}, limit=1,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="remittance not found")
    if rows[0].get("status") != "pending_approval":
        raise HTTPException(status_code=400, detail=f"remittance is {rows[0].get('status')}")
    try:
        row = supa.update("agency_bill_remittances", remittance_id, {
            "status": "approved",
            "approved_by": req.approved_by,
            "approved_at": datetime.now().astimezone().isoformat(),
            "updated_at": datetime.now().astimezone().isoformat(),
        })
    except Exception as exc:
        log.exception("remittance approve failed: %s", remittance_id)
        raise HTTPException(status_code=502, detail=str(exc))
    return {"ok": True, "remittance": row}


@router.post("/api/agency-bill/remittances/{remittance_id}/mark-paid")
def mark_agency_bill_remittance_paid(remittance_id: str, req: RemittanceDecision):
    """Approver-only: record that payment was released outside the app."""
    from datetime import datetime

    supa = deps.get_supa()
    deps.require_users(supa, [("approved_by", req.approved_by)])
    require_approver(supa, req.approved_by, action="mark agency-bill remittances paid")
    rows = supa.select(
        "agency_bill_remittances", columns="*",
        params={"id": f"eq.{remittance_id}"}, limit=1,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="remittance not found")
    if rows[0].get("status") not in ("approved", "pending_approval"):
        raise HTTPException(status_code=400, detail=f"remittance is {rows[0].get('status')}")
    try:
        row = supa.update("agency_bill_remittances", remittance_id, {
            "status": "paid",
            "approved_by": req.approved_by,
            "confirmation_number": req.confirmation_number,
            "paid_at": datetime.now().astimezone().isoformat(),
            "updated_at": datetime.now().astimezone().isoformat(),
        })
    except Exception as exc:
        log.exception("remittance mark-paid failed: %s", remittance_id)
        raise HTTPException(status_code=502, detail=str(exc))
    return {"ok": True, "remittance": row}
