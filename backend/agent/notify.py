"""Timeline events and customer/admin notifications.

Email goes through Resend (https://resend.com) when RESEND_API_KEY and
EMAIL_FROM are set; otherwise each message is logged with status "skipped"
so nothing breaks in development. Sending happens in a background task so a
slow mail API never delays the page.

WhatsApp: the admin page builds a wa.me link with the same message text,
so Ashley can forward any update in one tap.
"""
import base64
import html
import json
import os
import re
from datetime import datetime, timezone

import httpx
from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import admin_emails
from .db import SessionLocal
from .models import Notification, ProductRequest, RequestEvent

SITE_URL = os.getenv("SITE_URL", "http://localhost:3000").rstrip("/")
CONTACT_EMAIL = os.getenv("CONTACT_EMAIL", "aimoroinfo@gmail.com")
CONTACT_WHATSAPP = os.getenv("CONTACT_WHATSAPP", "+1 242-426-1965")
CONTACT_WHATSAPP_2 = os.getenv("CONTACT_WHATSAPP_2", "+1 281-673-6703")
CONTACT_WHATSAPP_ALL = " or ".join(n for n in (CONTACT_WHATSAPP, CONTACT_WHATSAPP_2) if n)
EMAIL_LOGO_URL = os.getenv("EMAIL_LOGO_URL", f"{SITE_URL}/email-logo.png")
SIGNATURE_TEXT = (f"AIMORO\n{SITE_URL.split('://')[-1]} | {CONTACT_EMAIL} | WhatsApp {CONTACT_WHATSAPP_ALL}\n"
                  "You tell us what you want. We find it and deliver it to your door.")


def email_review_on() -> bool:
    """When on (default), customer emails are saved as drafts for Ashley to edit and send."""
    return os.getenv("EMAIL_REVIEW", "on").strip().lower() not in ("off", "0", "false", "no")


def add_event(db: Session, req: ProductRequest, kind: str, message: str, visible: bool = True) -> RequestEvent:
    ev = RequestEvent(request_id=req.id, kind=kind, message=message, customer_visible=visible)
    db.add(ev)
    return ev


def _request_link(req: ProductRequest) -> str:
    return f"{SITE_URL}/my-requests/{req.id}"


def _email_body(name: str, message: str, link: str) -> str:
    return (f"Hi {name},\n\n{message}\n\nView your request: {link}\n\n"
            f"Questions? Reply to this email or write to {CONTACT_EMAIL}.")


def notify_customer(db: Session, background: BackgroundTasks | None, req: ProductRequest,
                    subject: str, message: str) -> Notification:
    user = req.user
    n = Notification(
        user_id=user.id, request_id=req.id, channel="email", to_address=user.email,
        subject=f"{subject} · {req.product_name}",
        body=_email_body(user.name.split(" ")[0] or user.name, message, _request_link(req)),
        status="draft" if email_review_on() else "queued",
    )
    db.add(n)
    db.flush()
    if background is not None and n.status == "queued":
        background.add_task(deliver, n.id)
    return n


def send_welcome(db: Session, background: BackgroundTasks | None, user) -> Notification:
    """Welcome email for a new customer account. Sent straight away (not held for review)."""
    first = (user.name or "").split(" ")[0] or "there"
    body = "\n\n".join([
        f"Hello {first},",
        "Welcome to AIMORO! Your account has been created, and you can log in any time at "
        f"{SITE_URL}/login with this email address.",
        "**How it works**",
        "1. Tell us what you want: send a photo or a link, and how many you need.\n"
        "2. We find it and send you up to 3 options to compare, with one price in BSD.\n"
        "3. Choose an option and pay your invoice.\n"
        "4. We order it, ship it and deliver it to your address.",
        f"Ready to start? Send your first request here: {SITE_URL}/my-requests/new",
        f"If you have any questions, reply to this email or message us on WhatsApp at {CONTACT_WHATSAPP_ALL}.",
        "Kind regards,\n" + os.getenv("EMAIL_SENDER_NAME", "Ashley"),
    ])
    n = Notification(user_id=user.id, request_id=None, channel="email", to_address=user.email,
                     subject="Welcome to AIMORO", body=body, status="queued")
    db.add(n)
    db.flush()
    if background is not None:
        background.add_task(deliver, n.id)
    return n


def send_password_reset(db: Session, background: BackgroundTasks | None, user, token: str) -> Notification:
    """Password reset link. Sent straight away (never held for review)."""
    first = (user.name or "").split(" ")[0] or "there"
    body = "\n\n".join([
        f"Hi {first},",
        "We received a request to reset the password for your AIMORO account. "
        "Use this link to choose a new password. It works once and expires in 1 hour:",
        f"{SITE_URL}/reset-password?token={token}",
        "If you didn't ask for this, you can ignore this email. Your password won't change.",
        "Kind regards,\n" + os.getenv("EMAIL_SENDER_NAME", "Ashley"),
    ])
    n = Notification(user_id=user.id, request_id=None, channel="email", to_address=user.email,
                     subject="Reset your AIMORO password", body=body, status="queued")
    db.add(n)
    db.flush()
    if background is not None:
        background.add_task(deliver, n.id)
    return n


def notify_admins(db: Session, background: BackgroundTasks | None, req: ProductRequest,
                  subject: str, message: str) -> None:
    for email in sorted(admin_emails()):
        n = Notification(
            request_id=req.id, channel="email", to_address=email, subject=subject,
            body=f"{message}\n\nOpen: {SITE_URL}/admin/requests/{req.id}",
        )
        db.add(n)
        db.flush()
        if background is not None:
            background.add_task(deliver, n.id)


BOLD = re.compile(r"\*\*(.+?)\*\*")
URL = re.compile(r"(https?://[^\s<]+)")
BULLET = re.compile(r"^\s*[*-]\s+")
NUMBER = re.compile(r"^\s*\d+[.)]\s+")


def _inline(text: str) -> str:
    text = BOLD.sub(r"<strong>\1</strong>", text)
    return URL.sub(r'<a href="\1" style="color:#C40000;font-weight:bold;">\1</a>', text)


def _list_html(tag: str, pattern, lines: list[str]) -> str:
    items = "".join('<li style="margin:0 0 6px;">' + _inline(pattern.sub("", ln)) + "</li>" for ln in lines)
    return f'<{tag} style="margin:0 0 14px;padding-left:22px;">{items}</{tag}>'


def _blocks_html(body: str) -> str:
    """Plain text to HTML: blank line = new paragraph, "* " or "- " lines = bullets,
    "1. " lines = numbered list, **bold** = bold."""
    out = []
    for block in html.escape(body).replace("\r\n", "\n").split("\n\n"):
        lines = [ln for ln in block.split("\n") if ln.strip()]
        if not lines:
            continue
        if all(BULLET.match(ln) for ln in lines):
            out.append(_list_html("ul", BULLET, lines))
        elif all(NUMBER.match(ln) for ln in lines):
            out.append(_list_html("ol", NUMBER, lines))
        else:
            out.append('<p style="margin:0 0 14px;">' + "<br>".join(_inline(ln) for ln in lines) + "</p>")
    return "".join(out)


def email_text(body: str) -> str:
    """Plain-text version: drop the **bold** markers and add the text signature."""
    return BOLD.sub(r"\1", body) + "\n\n--\n" + SIGNATURE_TEXT


def email_html(body: str) -> str:
    """Branded HTML version of a notification, with the AIMORO signature footer."""
    paras = _blocks_html(body)
    wa_links = " &nbsp;|&nbsp; ".join(
        '<a href="https://wa.me/%s" style="color:#475569;text-decoration:none;">%s</a>' % (re.sub(r"\D", "", n), n)
        for n in (CONTACT_WHATSAPP, CONTACT_WHATSAPP_2) if n)
    site = SITE_URL.split("://")[-1]
    return f"""<!doctype html><html><body style="margin:0;padding:0;background:#F1F5F9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#0F172A;">
<tr><td style="height:5px;background:#C40000;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 28px 8px;font-size:15px;line-height:22px;">{paras}</td></tr>
<tr><td style="padding:8px 28px 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #E2E8F0;padding-top:18px;width:100%;"><tr>
<td style="padding:18px 16px 0 0;vertical-align:middle;width:70px;"><a href="{SITE_URL}"><img src="{EMAIL_LOGO_URL}" width="64" height="70" alt="AIMORO" style="display:block;border:0;"></a></td>
<td style="padding:18px 0 0 14px;border-left:3px solid #C40000;vertical-align:middle;font-size:12px;line-height:18px;color:#475569;">
<div style="font-size:14px;font-weight:bold;color:#C40000;">AIMORO</div>
<a href="{SITE_URL}" style="color:#0F172A;text-decoration:none;font-weight:bold;">{site}</a> &nbsp;|&nbsp;
<a href="mailto:{CONTACT_EMAIL}" style="color:#475569;text-decoration:none;">{CONTACT_EMAIL}</a><br>
WhatsApp: {wa_links}<br>
<span style="color:#94A3B8;font-style:italic;">You tell us what you want. We find it and deliver it to your door.</span>
</td></tr></table>
</td></tr></table>
</td></tr></table></body></html>"""


ATTACHMENT_KINDS = ("options_preview", "options_full", "invoice")


def build_attachments(db: Session, request_id: int | None, kinds: list[str]) -> list[dict]:
    """Generate the PDFs to attach. Raises ValueError if one is not available yet."""
    from .common import active_options
    from .invoice_pdf import build_invoice_pdf
    from .models import Invoice, Quote
    from .options_pdf import build_options_pdf
    files = []
    req = db.get(ProductRequest, request_id) if request_id else None
    for kind in kinds:
        if req is None:
            raise ValueError("Attachments need a request")
        if kind in ("options_preview", "options_full"):
            opts = active_options(req)
            if not opts:
                raise ValueError("There are no options to attach yet")
            preview = kind == "options_preview"
            pdf = build_options_pdf(req, opts, preview=preview)
            name = f"AIMORO-options-request-{req.id}{'-preview' if preview else ''}.pdf"
        elif kind == "invoice":
            inv = db.scalars(select(Invoice).join(Quote)
                             .where(Quote.request_id == req.id).order_by(Invoice.id.desc())).first()
            if inv is None:
                raise ValueError("There is no invoice to attach yet")
            pdf, name = build_invoice_pdf(inv), f"AIMORO-invoice-{inv.number}.pdf"
        else:
            raise ValueError(f"Unknown attachment: {kind}")
        files.append({"filename": name, "content": base64.b64encode(pdf).decode()})
    return files


def build_attachment_file(db: Session, request_id: int, kind: str) -> tuple[bytes, str]:
    """One attachment as raw PDF bytes + file name, exactly as it would be attached now."""
    f = build_attachments(db, request_id, [kind])[0]
    return base64.b64decode(f["content"]), f["filename"]


def email_enabled() -> bool:
    return bool(os.getenv("RESEND_API_KEY") and os.getenv("EMAIL_FROM"))


def email_from() -> str:
    return os.getenv("EMAIL_FROM", "").strip()


def compose_email(db: Session, to_address: str, subject: str, body: str, request_id: int | None,
                  attachment_kinds: list[str]) -> dict:
    """The exact message sent to Resend. deliver() and the admin preview both use this,
    so the preview always matches what the customer receives.
    Raises ValueError if an attachment can't be built yet."""
    return {"from": email_from(), "to": [to_address], "subject": subject, "text": email_text(body),
            "html": email_html(body), "reply_to": CONTACT_EMAIL,
            "attachments": build_attachments(db, request_id, attachment_kinds)}


def deliver(notification_id: int) -> None:
    """Runs after the response is sent. Never raises."""
    db = SessionLocal()
    try:
        n = db.get(Notification, notification_id)
        if n is None or n.status != "queued":
            return
        if not email_enabled():
            n.status = "skipped"
            n.error = "Email not configured (set RESEND_API_KEY and EMAIL_FROM)"
        else:
            try:
                payload = compose_email(db, n.to_address, n.subject, n.body, n.request_id,
                                        json.loads(n.attachments or "[]"))
                resp = httpx.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"},
                    json=payload,
                    timeout=30,
                )
                resp.raise_for_status()
                n.status = "sent"
                n.sent_at = datetime.now(timezone.utc)
            except Exception as exc:  # noqa: BLE001
                n.status = "failed"
                n.error = str(exc)[:500]
        db.commit()
    finally:
        db.close()
