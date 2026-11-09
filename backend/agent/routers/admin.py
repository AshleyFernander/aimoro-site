"""Admin-only endpoints: request queue, sourcing listings, quote builder."""
import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..common import parse_specs, report_fee_bsd, save_photo, to_customer, upload_path
from ..db import get_db
from ..fx import get_cny_usd
from ..models import PLATFORMS, REQUEST_STATUSES, Invoice, Notification, ProductRequest, Quote, SupplierListing, User
from ..pricing import QuoteInputs, calculate_quote
from ..schemas import (AdminEventOut, AdminQuoteOut, AdminRequestOut, AdminRequestUpdate, CustomerBrief,
                       CustomerEditIn, InvoiceOut, ListingIn, ListingOut, NotificationOut, ProposalIn, QuoteBuildIn,
                       QuoteEditIn)
from .customer import mark_invoice_paid
from ..notify import add_event, notify_customer

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

QUOTE_VALID_DAYS = 7


def _listing_out(listing: SupplierListing, fx: float | None = None) -> ListingOut:
    out = ListingOut(
        id=listing.id, platform=listing.platform, url=listing.url, title=listing.title,
        currency=listing.currency or "CNY", price_cny=listing.price_cny, china_shipping_cny=listing.china_shipping_cny,
        seller_rating=listing.seller_rating, weight_kg=listing.weight_kg, notes=listing.notes,
        public_title=listing.public_title or "", preview_title=listing.preview_title or "", public_notes=listing.public_notes or "",
        specs=parse_specs(listing), is_chosen=listing.is_chosen, has_photo=bool(listing.photo_path),
        created_at=listing.created_at,
    )
    rate = 1.0 if listing.currency == "USD" else fx
    if rate:
        out.price_bsd_estimate = round((listing.price_cny + listing.china_shipping_cny) * rate, 2)
    return out


def _admin_view(req: ProductRequest, fx: float | None = None) -> AdminRequestOut:
    base = to_customer(req, as_admin=True).model_dump()
    return AdminRequestOut(
        **base,
        admin_notes=req.admin_notes,
        customer=CustomerBrief.model_validate(req.user),
        listings=[_listing_out(l, fx) for l in req.listings],
        quotes=[AdminQuoteOut.model_validate(x) for x in sorted(req.quotes, key=lambda x: x.id, reverse=True)],
        supplier_order_no=req.supplier_order_no,
        ordered_at=req.ordered_at,
        warehouse_arrived_at=req.warehouse_arrived_at,
        warehouse_notes=req.warehouse_notes,
        shipment_id=req.shipment_id,
        events=[AdminEventOut.model_validate(e) for e in reversed(req.events)],
        notifications=[NotificationOut.model_validate(n) for n in sorted(
            _notifications_for(req), key=lambda n: n.id, reverse=True)],
        fee_waived=bool(req.fee_waived),
        report_fee_ref=req.report_fee_ref,
        admin_unread=bool(req.admin_unread),
    )


def _notifications_for(req: ProductRequest):
    from sqlalchemy.orm import object_session
    db = object_session(req)
    return db.scalars(select(Notification).where(Notification.request_id == req.id)).all() if db else []


def _get_req(db: Session, request_id: int) -> ProductRequest:
    req = db.get(ProductRequest, request_id)
    if req is None:
        raise HTTPException(404, "Request not found")
    return req


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(ProductRequest.status, func.count()).group_by(ProductRequest.status)).all())
    return {s: counts.get(s, 0) for s in REQUEST_STATUSES}


@router.get("/requests", response_model=list[AdminRequestOut])
def list_requests(status: str | None = Query(default=None), db: Session = Depends(get_db)):
    stmt = select(ProductRequest).order_by(ProductRequest.id.desc())
    if status:
        stmt = stmt.where(ProductRequest.status == status)
    return [_admin_view(r) for r in db.scalars(stmt).all()]


@router.get("/requests/{request_id}", response_model=AdminRequestOut)
def get_request(request_id: int, db: Session = Depends(get_db)):
    req = _get_req(db, request_id)
    if req.admin_unread:  # opening the request marks it as read
        req.admin_unread = False
        db.commit()
    return _admin_view(req, get_cny_usd()["rate"])


@router.get("/unread")
def unread_counts(db: Session = Depends(get_db)):
    """Badge counts for the admin menu: requests and branding projects with customer activity not yet opened."""
    from ..models import BrandingProject
    return {
        "requests": db.scalar(select(func.count()).select_from(ProductRequest).where(ProductRequest.admin_unread.is_(True))) or 0,
        "branding": db.scalar(select(func.count()).select_from(BrandingProject).where(BrandingProject.admin_unread.is_(True))) or 0,
    }


DETAIL_LABELS = {"product_name": "product", "description": "details", "reference_url": "link",
                 "delivery_address": "delivery address", "quantity": "quantity", "target_price_bsd": "budget"}


@router.patch("/requests/{request_id}", response_model=AdminRequestOut)
def update_request(request_id: int, body: AdminRequestUpdate, background: BackgroundTasks,
                   db: Session = Depends(get_db)):
    req = _get_req(db, request_id)
    changed = []
    for field in DETAIL_LABELS:
        if field not in body.model_fields_set:
            continue
        value = getattr(body, field)
        if field == "target_price_bsd":
            pass  # null clears the budget
        elif value is None:
            continue
        elif isinstance(value, str):
            value = value.strip()
        if value != getattr(req, field):
            changed.append(field)
            setattr(req, field, value)
    if "quantity" in changed:
        if any(q.invoice is not None and q.invoice.status == "paid" for q in req.quotes):
            raise HTTPException(400, "This order is already paid, so the quantity can't change here.")
        # Prices depend on quantity: re-price every option the customer can still choose or pay.
        for q in _repriceable(req):
            old = q.total_bsd
            _reprice(db, req, q, QuoteEditIn())
            if q.total_bsd != old:
                add_event(db, req, "quote_edit", f"Option {q.option_number or 1} re-priced for quantity "
                          f"{req.quantity}: ${old:,.2f} → ${q.total_bsd:,.2f}.", visible=False)
    if changed:
        add_event(db, req, "edit", "Request details edited by admin: " + ", ".join(DETAIL_LABELS[f] for f in changed)
                  + ".", visible=False)
    if body.status is not None and body.status != req.status:
        if body.status not in REQUEST_STATUSES:
            raise HTTPException(400, f"Status must be one of: {', '.join(REQUEST_STATUSES)}")
        add_event(db, req, "status", f"Status changed from {req.status} to {body.status} by admin.", visible=False)
        req.status = body.status
    if body.admin_notes is not None:
        req.admin_notes = body.admin_notes
    if body.tracking_number is not None:
        req.tracking_number = body.tracking_number
    if body.fee_waived is not None and bool(req.fee_waived) != body.fee_waived:
        req.fee_waived = body.fee_waived
        add_event(db, req, "fee", "Friends and Family: sourcing fee waived." if body.fee_waived
                  else "Sourcing fee waiver removed.", visible=False)
    db.commit()
    return _admin_view(req)


@router.post("/requests/{request_id}/report-fee", response_model=AdminRequestOut)
def report_fee(request_id: int, background: BackgroundTasks, paid: bool = Query(default=True),
               reference: str = Query(default="", max_length=255), db: Session = Depends(get_db)):
    """Confirm (or undo) the report fee. Confirming unlocks the full report for the customer."""
    req = _get_req(db, request_id)
    if paid and req.report_paid_at is None:
        req.report_paid_at = datetime.now(timezone.utc)
        req.report_fee_ref = reference.strip() or None
        msg = ("Report fee received, thank you! Your full report is ready: model names, clear photos and the "
               "complete comparison for every option. Choose the option you want and we'll send your invoice.")
        add_event(db, req, "report", msg)
        n = notify_customer(db, background, req, "Your full report is ready", msg)
        if any(q.status == "sent" for q in req.quotes):
            n.attachments = json.dumps(["options_full"])
    elif not paid and req.report_paid_at is not None:
        req.report_paid_at = None
        req.report_fee_ref = None
        add_event(db, req, "report", "Report fee confirmation removed: the options are a preview again.",
                  visible=False)
    db.commit()
    return _admin_view(req)


@router.post("/requests/{request_id}/listings", response_model=ListingOut)
def add_listing(request_id: int, body: ListingIn, db: Session = Depends(get_db)):
    req = _get_req(db, request_id)
    if body.platform not in PLATFORMS:
        raise HTTPException(400, f"Platform must be one of: {', '.join(PLATFORMS)}")
    listing = SupplierListing(request_id=req.id)
    _apply_listing(listing, body)
    db.add(listing)
    if req.status == "received":
        req.status = "sourcing"
        add_event(db, req, "sourcing", "We've started sourcing your product and comparing suppliers.")
    db.commit()
    return _listing_out(listing)


@router.patch("/listings/{listing_id}", response_model=ListingOut)
def update_listing(listing_id: int, body: ListingIn, db: Session = Depends(get_db)):
    listing = db.get(SupplierListing, listing_id)
    if listing is None:
        raise HTTPException(404, "Listing not found")
    if body.platform not in PLATFORMS:
        raise HTTPException(400, f"Platform must be one of: {', '.join(PLATFORMS)}")
    _apply_listing(listing, body)
    db.commit()
    return _listing_out(listing)


def _apply_listing(listing: SupplierListing, body: ListingIn) -> None:
    data = body.model_dump(exclude={"specs"})
    for k, v in data.items():
        setattr(listing, k, v.strip() if isinstance(v, str) else v)
    rows = [r.model_dump() for r in body.specs if r.requested.strip() or r.found.strip()]
    listing.specs_json = json.dumps(rows) if rows else None


@router.get("/listings/{listing_id}/photo")
def get_listing_photo(listing_id: int, db: Session = Depends(get_db)):
    listing = db.get(SupplierListing, listing_id)
    if listing is None or not listing.photo_path:
        raise HTTPException(404, "No photo")
    return FileResponse(upload_path(listing.photo_path))


@router.post("/listings/{listing_id}/photo", response_model=ListingOut)
async def upload_listing_photo(listing_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """The product photo the customer sees for this option (e.g. a screenshot from the app)."""
    listing = db.get(SupplierListing, listing_id)
    if listing is None:
        raise HTTPException(404, "Listing not found")
    listing.photo_path = await save_photo(file, f"listing{listing.id}")
    db.commit()
    return _listing_out(listing)


@router.delete("/listings/{listing_id}")
def delete_listing(listing_id: int, db: Session = Depends(get_db)):
    listing = db.get(SupplierListing, listing_id)
    if listing is None:
        raise HTTPException(404, "Listing not found")
    if any(q.listing_id == listing_id for q in listing.request.quotes):
        raise HTTPException(400, "This listing is used in a quote and can't be deleted")
    db.delete(listing)
    db.commit()
    return {"deleted": listing_id}


@router.get("/fx")
def fx_rate():
    return get_cny_usd()


def _inputs(req: ProductRequest, body: QuoteBuildIn, db: Session) -> tuple[SupplierListing, QuoteInputs]:
    listing = db.get(SupplierListing, body.listing_id)
    if listing is None or listing.request_id != req.id:
        raise HTTPException(400, "Pick a listing from this request")
    # USD prices need no conversion (BSD is pegged 1:1 to USD).
    fx = 1.0 if listing.currency == "USD" else (body.fx_cny_usd or get_cny_usd()["rate"])
    return listing, QuoteInputs(
        price_cny=listing.price_cny,
        quantity=req.quantity,
        china_shipping_cny=listing.china_shipping_cny,
        fx_cny_usd=fx,
        freight_cost_bsd=body.freight_cost_bsd,
        freight_markup_pct=body.freight_markup_pct,
        insurance_bsd=body.insurance_bsd,
        service_fee_pct=body.service_fee_pct,
        service_fee_min_bsd=body.service_fee_min_bsd,
    )


@router.post("/requests/{request_id}/quote/preview")
def preview_quote(request_id: int, body: QuoteBuildIn, db: Session = Depends(get_db)):
    req = _get_req(db, request_id)
    _, inputs = _inputs(req, body, db)
    return {"fx_cny_usd": inputs.fx_cny_usd, **calculate_quote(inputs).as_dict()}


def _send_options(req: ProductRequest, options: list[QuoteBuildIn], message: str,
                  background: BackgroundTasks, db: Session) -> list[Quote]:
    if req.status not in {"received", "sourcing", "quote_ready"}:
        raise HTTPException(400, f"This request can't be quoted while its status is {req.status}")
    if any(q.status == "approved" for q in req.quotes):
        raise HTTPException(400, "The customer already approved a quote")
    ids = [o.listing_id for o in options]
    if len(set(ids)) != len(ids):
        raise HTTPException(400, "Each option must use a different listing")

    priced = [(_inputs(req, o, db)) for o in options]
    for old in req.quotes:
        if old.status == "sent":
            old.status = "superseded"
    chosen = set(ids)
    for l in req.listings:
        l.is_chosen = l.id in chosen

    proposal_no = max((q.proposal_no or 0 for q in req.quotes), default=0) + 1
    expires = datetime.now(timezone.utc) + timedelta(days=QUOTE_VALID_DAYS)
    quotes = []
    for n, (listing, inputs) in enumerate(priced, start=1):
        b = calculate_quote(inputs)
        q = Quote(
            request_id=req.id, listing_id=listing.id, proposal_no=proposal_no, option_number=n,
            fx_cny_usd=inputs.fx_cny_usd, freight_cost_bsd=inputs.freight_cost_bsd,
            freight_markup_pct=inputs.freight_markup_pct, insurance_bsd=inputs.insurance_bsd,
            service_fee_pct=inputs.service_fee_pct, service_fee_min_bsd=inputs.service_fee_min_bsd,
            margin_bsd=b.margin_bsd, product_cost_bsd=b.product_cost_bsd, shipping_bsd=b.shipping_bsd,
            service_fee_bsd=b.service_fee_bsd, total_bsd=b.total_bsd, message=message, expires_at=expires,
        )
        db.add(q)
        quotes.append(q)
    req.status = "quote_ready"

    fee = report_fee_bsd()
    if req.report_paid_at is not None:
        nxt = "Compare them side by side and choose one."
    else:
        nxt = (f"This is your preview report. To see the model names, photos and full comparison, and to choose "
               f"an option, pay the ${fee:,.0f} report fee; we send your full report as soon as it's confirmed.")
    if len(quotes) == 1:
        subject = "Your preview quote is ready" if req.report_paid_at is None else "Your quote is ready"
        msg = (f"We found a match for you: ${quotes[0].total_bsd:,.2f} BSD. {nxt} "
               f"It is valid for {QUOTE_VALID_DAYS} days.")
    else:
        low = min(q.total_bsd for q in quotes)
        subject = "Your preview report is ready" if req.report_paid_at is None else "Your options are ready"
        msg = (f"We found {len(quotes)} options for you, from ${low:,.2f} BSD. {nxt} "
               f"They are valid for {QUOTE_VALID_DAYS} days.")
    add_event(db, req, "quote", msg)
    n = notify_customer(db, background, req, subject, msg)
    n.attachments = json.dumps(["options_full" if req.report_paid_at is not None else "options_preview"])
    db.commit()
    return quotes


@router.post("/requests/{request_id}/quote", response_model=AdminQuoteOut)
def send_quote(request_id: int, body: QuoteBuildIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Send a single quote (one option)."""
    req = _get_req(db, request_id)
    q = _send_options(req, [body], body.message, background, db)[0]
    return AdminQuoteOut.model_validate(q)


@router.post("/requests/{request_id}/proposal/preview")
def preview_proposal(request_id: int, body: ProposalIn, db: Session = Depends(get_db)):
    req = _get_req(db, request_id)
    out = []
    for o in body.options:
        _, inputs = _inputs(req, o, db)
        out.append({"listing_id": o.listing_id, "fx_cny_usd": inputs.fx_cny_usd, **calculate_quote(inputs).as_dict()})
    return out


@router.post("/requests/{request_id}/proposal", response_model=list[AdminQuoteOut])
def send_proposal(request_id: int, body: ProposalIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Send 1-3 options side by side; the customer chooses one."""
    req = _get_req(db, request_id)
    quotes = _send_options(req, body.options, body.message, background, db)
    return [AdminQuoteOut.model_validate(q) for q in quotes]


# ---------- editing a quote after it was sent ----------

def _repriceable(req: ProductRequest) -> list[Quote]:
    """Options that can still change: sent, or chosen with an unpaid invoice."""
    if req.status != "quote_ready":
        return []
    return [q for q in req.quotes if q.status == "sent" or (
        q.status == "approved" and (q.invoice is None or q.invoice.status != "paid"))]


def _editable_quote(db: Session, quote_id: int) -> tuple[ProductRequest, Quote]:
    q = db.get(Quote, quote_id)
    if q is None:
        raise HTTPException(404, "Quote not found")
    req = q.request
    if q.invoice is not None and q.invoice.status == "paid":
        raise HTTPException(400, "This quote is already paid and can't be changed")
    if q not in _repriceable(req):
        raise HTTPException(400, "Only the options the customer is looking at (or chose but hasn't paid) can be "
                                 "edited. Send new options instead.")
    return req, q


def _reprice(db: Session, req: ProductRequest, q: Quote, body: QuoteEditIn):
    """Apply the edits to q (in memory) and recalculate it. Returns the breakdown."""
    listing = q.listing
    if body.listing_id is not None and body.listing_id != q.listing_id:
        listing = db.get(SupplierListing, body.listing_id)
        if listing is None or listing.request_id != req.id:
            raise HTTPException(400, "Pick a listing from this request")
        if any(o.listing_id == listing.id for o in _repriceable(req) if o.id != q.id):
            raise HTTPException(400, "That listing is already another option")
    if listing is None:
        raise HTTPException(400, "This quote has no listing; send new options instead")
    if listing.currency == "USD":
        fx = 1.0
    elif body.fx_cny_usd is not None:
        fx = body.fx_cny_usd
    elif q.listing is not None and q.listing.currency != "USD" and q.fx_cny_usd != 1.0:
        fx = q.fx_cny_usd  # keep the rate frozen on the quote
    else:
        fx = get_cny_usd()["rate"]
    pick = lambda new, old: old if new is None else new  # noqa: E731
    inputs = QuoteInputs(
        price_cny=listing.price_cny, quantity=req.quantity, china_shipping_cny=listing.china_shipping_cny,
        fx_cny_usd=fx,
        freight_cost_bsd=pick(body.freight_cost_bsd, q.freight_cost_bsd),
        freight_markup_pct=pick(body.freight_markup_pct, q.freight_markup_pct),
        insurance_bsd=pick(body.insurance_bsd, q.insurance_bsd),
        service_fee_pct=pick(body.service_fee_pct, q.service_fee_pct),
        service_fee_min_bsd=pick(body.service_fee_min_bsd, q.service_fee_min_bsd),
    )
    b = calculate_quote(inputs)
    q.listing_id, q.listing = listing.id, listing
    q.fx_cny_usd, q.freight_cost_bsd, q.freight_markup_pct = fx, inputs.freight_cost_bsd, inputs.freight_markup_pct
    q.insurance_bsd, q.service_fee_pct, q.service_fee_min_bsd = (inputs.insurance_bsd, inputs.service_fee_pct,
                                                                  inputs.service_fee_min_bsd)
    q.product_cost_bsd, q.shipping_bsd, q.service_fee_bsd = b.product_cost_bsd, b.shipping_bsd, b.service_fee_bsd
    q.total_bsd, q.margin_bsd = b.total_bsd, b.margin_bsd
    if body.message is not None:
        q.message = body.message
    if body.valid_days is not None:
        q.expires_at = datetime.now(timezone.utc) + timedelta(days=body.valid_days)
    if q.invoice is not None:
        q.invoice.amount_bsd = q.total_bsd
    for l in req.listings:
        l.is_chosen = any(o.listing_id == l.id for o in _repriceable(req))
    return b


@router.post("/quotes/{quote_id}/preview")
def preview_quote_edit(quote_id: int, body: QuoteEditIn, db: Session = Depends(get_db)):
    """What the option would cost with these changes. Nothing is saved."""
    req, q = _editable_quote(db, quote_id)
    before = {"total_bsd": q.total_bsd, "margin_bsd": q.margin_bsd}
    try:
        b = _reprice(db, req, q, body)
        fx = q.fx_cny_usd
    finally:
        db.rollback()  # discard the in-memory changes
    return {"fx_cny_usd": fx, **b.as_dict(), "before": before}


@router.patch("/quotes/{quote_id}", response_model=AdminRequestOut)
def edit_quote(quote_id: int, body: QuoteEditIn, background: BackgroundTasks, db: Session = Depends(get_db)):
    """Edit a sent option, or the chosen one before it's paid (its invoice follows the new total)."""
    req, q = _editable_quote(db, quote_id)
    old_total, old_listing = q.total_bsd, q.listing_id
    _reprice(db, req, q, body)
    n = q.option_number or 1
    parts = []
    if q.listing_id != old_listing:
        parts.append("product changed")
    if q.total_bsd != old_total:
        parts.append(f"${old_total:,.2f} → ${q.total_bsd:,.2f}")
    if body.valid_days is not None:
        parts.append(f"valid until {q.expires_at:%b %d}")
    add_event(db, req, "quote_edit", f"Option {n} edited by admin: {', '.join(parts) or 'no price change'}.",
              visible=False)
    if body.notify and parts:
        bits = [f"Option {n} has been updated" if len(_repriceable(req)) > 1 or q.status == "sent"
                else "Your quote has been updated"]
        bits.append(f"the total is now ${q.total_bsd:,.2f} BSD")
        if q.invoice is not None:
            bits.append(f"invoice {q.invoice.number} has been updated to match")
        if body.valid_days is not None:
            bits.append(f"it is valid until {q.expires_at:%B} {q.expires_at.day}")
        msg = bits[0] + ": " + ", ".join(bits[1:]) + "."
        add_event(db, req, "quote", msg)
        notification = notify_customer(db, background, req, "Your quote has been updated", msg)
        if q.invoice is not None:
            notification.attachments = json.dumps(["invoice"])
        elif q.status == "sent":
            notification.attachments = json.dumps(["options_full" if req.report_paid_at else "options_preview"])
    db.commit()
    return _admin_view(req, get_cny_usd()["rate"])


@router.patch("/customers/{user_id}", response_model=CustomerBrief)
def edit_customer(user_id: int, body: CustomerEditIn, db: Session = Depends(get_db)):
    """Fix a customer's name, email, phone or address. Future emails go to the new address."""
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "Customer not found")
    data = {k: (v.strip() if isinstance(v, str) else v) for k, v in body.model_dump(exclude_unset=True).items()
            if v is not None}
    if "email" in data and data["email"] != user.email:
        if db.scalar(select(User).where(User.email == data["email"], User.id != user.id)) is not None:
            raise HTTPException(400, "Another account already uses that email")
        # Drafts still waiting for review go to the new address too.
        for n in db.scalars(select(Notification).where(Notification.user_id == user.id,
                                                       Notification.status == "draft")):
            n.to_address = data["email"]
    for k, v in data.items():
        setattr(user, k, v)
    db.commit()
    return CustomerBrief.model_validate(user)


@router.post("/invoices/{invoice_id}/mark-paid", response_model=InvoiceOut)
def admin_mark_paid(invoice_id: int, background: BackgroundTasks, reference: str = Query(default="bank transfer"),
                    db: Session = Depends(get_db)):
    inv = db.get(Invoice, invoice_id)
    if inv is None:
        raise HTTPException(404, "Invoice not found")
    if inv.status != "paid":
        mark_invoice_paid(db, background, inv, reference)
        db.commit()
    return InvoiceOut.model_validate(inv)


@router.get("/customers", response_model=list[CustomerBrief])
def customers(db: Session = Depends(get_db)):
    return db.scalars(select(User).where(User.role == "customer").order_by(User.id.desc())).all()


@router.post("/gsync")
def gsync_all(db: Session = Depends(get_db)):
    """Re-sync every request to Google Drive and the order tracker (runs in the background)."""
    from .. import gsync
    if not gsync.enabled():
        raise HTTPException(400, "Google sync is not configured (see backend/agent/gsync.py)")
    from ..models import BrandingProject
    ids = list(db.scalars(select(ProductRequest.id).order_by(ProductRequest.id)))
    bids = list(db.scalars(select(BrandingProject.id).order_by(BrandingProject.id)))
    gsync.submit(ids, (), bids)
    return {"queued": len(ids), "branding_queued": len(bids)}
