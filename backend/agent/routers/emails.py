"""Admin email review: edit automatic customer emails before they send, or write new ones from templates."""
import json

import base64

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..db import get_db
from ..email_templates import email_templates
from ..models import Notification, ProductRequest
from ..notify import (ATTACHMENT_KINDS, build_attachment_file, build_attachments, compose_email, deliver,
                      email_enabled, email_from)
from ..schemas import EmailDraftBrief, EmailIn, EmailPreviewIn, EmailTemplateOut, EmailUpdate, NotificationOut

router = APIRouter(prefix="/admin", tags=["admin-emails"], dependencies=[Depends(require_admin)])


def _req(db: Session, request_id: int) -> ProductRequest:
    req = db.get(ProductRequest, request_id)
    if req is None:
        raise HTTPException(404, "Request not found")
    return req


def _draft(db: Session, notification_id: int) -> Notification:
    n = db.get(Notification, notification_id)
    if n is None:
        raise HTTPException(404, "Email not found")
    if n.status != "draft":
        raise HTTPException(400, "This email has already been sent or discarded")
    return n


def _check_attachments(db: Session, request_id: int | None, kinds: list[str]) -> None:
    try:
        build_attachments(db, request_id, kinds)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


def _queue(n: Notification, background: BackgroundTasks) -> None:
    n.status = "queued"
    background.add_task(deliver, n.id)


@router.get("/requests/{request_id}/email-templates", response_model=list[EmailTemplateOut])
def templates(request_id: int, db: Session = Depends(get_db)):
    return email_templates(_req(db, request_id))


@router.post("/requests/{request_id}/emails", response_model=NotificationOut)
def create_email(request_id: int, body: EmailIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    req = _req(db, request_id)
    _check_attachments(db, req.id, body.attachments)
    n = Notification(user_id=req.user_id, request_id=req.id, channel="email", to_address=req.user.email,
                     subject=body.subject, body=body.body, attachments=json.dumps(body.attachments), status="draft")
    db.add(n)
    db.flush()
    if body.send:
        _queue(n, background)
    db.commit()
    return NotificationOut.model_validate(n)


@router.patch("/notifications/{notification_id}", response_model=NotificationOut)
def update_email(notification_id: int, body: EmailUpdate, db: Session = Depends(get_db)):
    n = _draft(db, notification_id)
    if body.subject is not None:
        n.subject = body.subject
    if body.body is not None:
        n.body = body.body
    if body.attachments is not None:
        _check_attachments(db, n.request_id, body.attachments)
        n.attachments = json.dumps(body.attachments)
    db.commit()
    return NotificationOut.model_validate(n)


@router.post("/notifications/{notification_id}/send", response_model=NotificationOut)
def send_email(notification_id: int, background: BackgroundTasks, db: Session = Depends(get_db)):
    n = _draft(db, notification_id)
    _check_attachments(db, n.request_id, json.loads(n.attachments or "[]"))
    _queue(n, background)
    db.commit()
    return NotificationOut.model_validate(n)


@router.post("/notifications/{notification_id}/discard", response_model=NotificationOut)
def discard_email(notification_id: int, db: Session = Depends(get_db)):
    n = _draft(db, notification_id)
    n.status = "discarded"
    db.commit()
    return NotificationOut.model_validate(n)


@router.post("/emails/preview")
def preview_email(body: EmailPreviewIn, db: Session = Depends(get_db)):
    """Exactly what the customer will receive: sender, recipient, subject, the HTML and plain-text
    versions, and the attachments as they would be built right now (same code path as sending)."""
    to, request_id = "", body.request_id
    if body.notification_id is not None:
        n = db.get(Notification, body.notification_id)
        if n is None:
            raise HTTPException(404, "Email not found")
        to, request_id = n.to_address, n.request_id
    elif request_id is not None:
        to = _req(db, request_id).user.email
    warnings = []
    try:
        msg = compose_email(db, to, body.subject, body.body, request_id, body.attachments)
    except ValueError as exc:
        warnings.append(f"Attachment problem: {exc}. Untick it or fix it before sending.")
        msg = compose_email(db, to, body.subject, body.body, request_id, [])
    if not email_enabled():
        warnings.append("Email sending is not set up (RESEND_API_KEY / EMAIL_FROM), so this would be logged as "
                        "skipped instead of sent.")
    files = []
    kinds = [k for k in body.attachments if k in ATTACHMENT_KINDS]
    if len(msg["attachments"]) == len(kinds):
        for kind, f in zip(kinds, msg["attachments"]):
            files.append({"kind": kind, "filename": f["filename"],
                          "size_bytes": len(base64.b64decode(f["content"]))})
    return {"from": msg["from"] or email_from() or "(EMAIL_FROM not set)", "to": to, "reply_to": msg["reply_to"],
            "subject": msg["subject"], "html": msg["html"], "text": msg["text"], "attachments": files,
            "warnings": warnings}


@router.get("/requests/{request_id}/attachments/{kind}")
def attachment_file(request_id: int, kind: str, db: Session = Depends(get_db)):
    """The exact PDF that would be attached to an email right now (opens inline for the preview)."""
    req = _req(db, request_id)
    if kind not in ATTACHMENT_KINDS:
        raise HTTPException(404, "Unknown attachment")
    try:
        pdf, name = build_attachment_file(db, req.id, kind)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{name}"'})


@router.get("/email-drafts", response_model=list[EmailDraftBrief])
def email_drafts(db: Session = Depends(get_db)):
    rows = db.scalars(select(Notification).where(Notification.status == "draft", Notification.user_id.is_not(None))
                      .order_by(Notification.id)).all()
    out = []
    for n in rows:
        req = db.get(ProductRequest, n.request_id) if n.request_id else None
        if req is None:
            continue
        out.append(EmailDraftBrief(id=n.id, request_id=req.id, product_name=req.product_name,
                                   customer_name=req.user.name, subject=n.subject, created_at=n.created_at))
    return out
