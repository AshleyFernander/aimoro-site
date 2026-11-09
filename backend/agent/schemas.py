"""Request/response models.

Customer-facing models (RequestOut, CustomerQuoteOut, InvoiceOut) must never
include supplier listings, CNY prices, FX rate, freight cost or margin.
"""
import json
from datetime import datetime

from typing import Literal

import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

COUNTRIES = ("Bahamas", "United States", "Canada")


def normalize_phone(v: str) -> str:
    """Bahamas, US and Canada all use +1: store as "+1 242-555-0100". Blank stays blank."""
    digits = re.sub(r"\D", "", v or "")
    if not digits:
        return ""
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) != 10:
        raise ValueError("Enter your phone number with the area code, e.g. 242 555 0100")
    return f"+1 {digits[:3]}-{digits[3:6]}-{digits[6:]}"


class SignupIn(BaseModel):
    email: str
    password: str = Field(min_length=8)
    name: str = Field(min_length=1)
    phone: str = ""
    country: Literal["Bahamas", "United States", "Canada"] = "Bahamas"
    island: str = "New Providence"  # island (Bahamas), state (US) or province (Canada)
    address: str = ""

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_phone(v)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Enter a valid email")
        return v


class LoginIn(BaseModel):
    email: str
    password: str


class ForgotPasswordIn(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.strip().lower()


class ResetPasswordIn(BaseModel):
    token: str
    password: str = Field(min_length=8)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    role: str
    name: str
    phone: str
    country: str | None = "Bahamas"
    island: str
    address: str


class TokenOut(BaseModel):
    token: str
    user: UserOut


class RequestIn(BaseModel):
    product_name: str = Field(min_length=2, max_length=255)
    description: str = ""
    reference_url: str = ""
    delivery_address: str = ""  # blank = use the address on the customer's profile
    quantity: int = Field(default=1, ge=1, le=100000)
    target_price_bsd: float | None = Field(default=None, ge=0)


class CustomerQuoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    product_cost_bsd: float
    shipping_bsd: float
    service_fee_bsd: float
    total_bsd: float
    message: str
    status: str
    created_at: datetime
    expires_at: datetime


class SpecRow(BaseModel):
    """One line of the side-by-side comparison: what the customer asked for vs what we found."""
    label: str = Field(min_length=1, max_length=60)
    requested: str = Field(default="", max_length=200)
    found: str = Field(default="", max_length=200)
    match: Literal["match", "close", "different"] = "match"


class CustomerOptionOut(BaseModel):
    """A found product as the customer sees it. Never includes supplier, platform, link or CNY price."""
    id: int  # the quote id; used to choose this option
    option_number: int
    title: str
    notes: str
    specs: list[SpecRow]  # when locked: label and "requested" only; "found" is blank
    has_photo: bool
    locked: bool = False  # preview: details stay hidden until the report fee is paid
    product_cost_bsd: float
    shipping_bsd: float
    service_fee_bsd: float
    total_bsd: float
    status: str
    expires_at: datetime


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    number: str
    amount_bsd: float
    status: str
    paid_at: datetime | None
    created_at: datetime


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    kind: str
    message: str
    created_at: datetime


class CustomerShipmentOut(BaseModel):
    """Shipment as the customer sees it: no freight cost, weight or notes."""
    model_config = ConfigDict(from_attributes=True)
    reference: str
    method: str
    carrier: str
    tracking_number: str
    status: str
    eta: str
    shipped_at: datetime | None
    delivered_at: datetime | None


class WarehousePhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    caption: str
    media_type: str = "image"
    created_at: datetime

    @field_validator("media_type", mode="before")
    @classmethod
    def _default_image(cls, v):
        return v or "image"


class RequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    product_name: str
    description: str
    reference_url: str
    delivery_address: str = ""
    has_photo: bool = False
    quantity: int
    target_price_bsd: float | None
    status: str
    tracking_number: str
    created_at: datetime
    updated_at: datetime
    quote: CustomerQuoteOut | None = None
    invoice: InvoiceOut | None = None
    shipment: CustomerShipmentOut | None = None
    options: list[CustomerOptionOut] = []
    timeline: list[EventOut] = []
    warehouse_photos: list[WarehousePhotoOut] = []
    report_unlocked: bool = False
    report_fee_bsd: float = 100
    report_paid_at: datetime | None = None


# ---------- admin ----------

class ListingIn(BaseModel):
    platform: str
    url: str = ""
    title: str = ""
    currency: Literal["CNY", "USD"] = "CNY"  # currency of price_cny and china_shipping_cny
    price_cny: float = Field(ge=0)
    china_shipping_cny: float = Field(default=0, ge=0)
    seller_rating: float | None = Field(default=None, ge=0, le=5)
    weight_kg: float | None = Field(default=None, ge=0)
    notes: str = ""
    # customer-facing
    public_title: str = Field(default="", max_length=120)
    preview_title: str = Field(default="", max_length=120)
    public_notes: str = Field(default="", max_length=600)
    specs: list[SpecRow] = Field(default=[], max_length=12)


class ListingOut(ListingIn):
    id: int
    is_chosen: bool
    has_photo: bool = False
    price_bsd_estimate: float | None = None
    created_at: datetime


class QuoteBuildIn(BaseModel):
    listing_id: int
    fx_cny_usd: float | None = Field(default=None, gt=0)
    freight_cost_bsd: float = Field(default=0, ge=0)
    freight_markup_pct: float = Field(default=0, ge=0, le=2)
    insurance_bsd: float = Field(default=0, ge=0)
    service_fee_pct: float = Field(default=0.12, ge=0, le=1)
    service_fee_min_bsd: float = Field(default=15, ge=0)
    message: str = ""


class ProposalIn(BaseModel):
    """1-3 options sent together. Each option is priced like a single quote."""
    options: list["QuoteBuildIn"] = Field(min_length=1, max_length=3)
    message: str = ""


class AdminQuoteOut(CustomerQuoteOut):
    listing_id: int | None
    proposal_no: int | None = None
    option_number: int | None = None
    fx_cny_usd: float
    freight_cost_bsd: float
    freight_markup_pct: float
    insurance_bsd: float
    service_fee_pct: float
    service_fee_min_bsd: float
    margin_bsd: float


class CustomerBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: str
    phone: str
    country: str | None = "Bahamas"
    island: str
    address: str


class AdminEventOut(EventOut):
    customer_visible: bool


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    to_address: str
    subject: str
    body: str
    status: str
    error: str
    attachments: list[str] = []
    created_at: datetime
    sent_at: datetime | None = None

    @field_validator("attachments", mode="before")
    @classmethod
    def _parse_attachments(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except ValueError:
                return []
        return v or []


AttachmentKind = Literal["options_preview", "options_full", "invoice"]


class EmailIn(BaseModel):
    subject: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1, max_length=20000)
    attachments: list[AttachmentKind] = []
    send: bool = False


class EmailUpdate(BaseModel):
    subject: str | None = Field(default=None, min_length=1, max_length=255)
    body: str | None = Field(default=None, min_length=1, max_length=20000)
    attachments: list[AttachmentKind] | None = None


class EmailTemplateOut(BaseModel):
    key: str
    label: str
    subject: str
    body: str
    attachments: list[str] = []


class EmailPreviewIn(BaseModel):
    body: str = Field(max_length=20000)
    subject: str = Field(default="", max_length=255)
    attachments: list[AttachmentKind] = []
    request_id: int | None = None       # new email for this request (recipient = the customer)
    notification_id: int | None = None  # existing draft (recipient = its address)


class EmailDraftBrief(BaseModel):
    id: int
    request_id: int
    product_name: str
    customer_name: str
    subject: str
    created_at: datetime


class AdminRequestOut(RequestOut):
    admin_notes: str
    admin_unread: bool = False
    customer: CustomerBrief
    listings: list[ListingOut] = []
    quotes: list[AdminQuoteOut] = []
    supplier_order_no: str | None = None
    ordered_at: datetime | None = None
    warehouse_arrived_at: datetime | None = None
    warehouse_notes: str | None = None
    shipment_id: int | None = None
    events: list[AdminEventOut] = []
    notifications: list[NotificationOut] = []
    fee_waived: bool = False
    report_fee_ref: str | None = None


class OrderIn(BaseModel):
    supplier_order_no: str = Field(min_length=1, max_length=100)
    note: str = ""


class WarehouseIn(BaseModel):
    notes: str = ""


class ShipmentIn(BaseModel):
    method: str = "air"
    carrier: str = ""
    tracking_number: str = ""
    weight_kg: float | None = Field(default=None, ge=0)
    freight_cost_bsd: float | None = Field(default=None, ge=0)
    eta: str = ""
    notes: str = ""


class ShipmentStatusIn(BaseModel):
    status: str


class ShipmentRequestBrief(BaseModel):
    id: int
    product_name: str
    quantity: int
    status: str
    customer_name: str
    customer_island: str
    delivery_address: str
    warehouse_arrived: bool


class AdminShipmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    reference: str
    method: str
    carrier: str
    tracking_number: str
    weight_kg: float | None
    freight_cost_bsd: float | None
    status: str
    eta: str
    notes: str
    created_at: datetime
    shipped_at: datetime | None
    delivered_at: datetime | None
    requests: list[ShipmentRequestBrief] = []


class AdminRequestUpdate(BaseModel):
    status: str | None = None
    admin_notes: str | None = None
    tracking_number: str | None = None
    fee_waived: bool | None = None
    # Request details (fix typos, change quantity or address). Only fields that are sent change.
    product_name: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    reference_url: str | None = Field(default=None, max_length=2000)
    delivery_address: str | None = Field(default=None, max_length=2000)
    quantity: int | None = Field(default=None, ge=1, le=100000)
    target_price_bsd: float | None = Field(default=None, ge=0)  # send null to clear the budget


class QuoteEditIn(BaseModel):
    """Change a quote that was already sent (or chosen but not yet paid). Fields left out keep their value."""
    listing_id: int | None = None
    fx_cny_usd: float | None = Field(default=None, gt=0)
    freight_cost_bsd: float | None = Field(default=None, ge=0)
    freight_markup_pct: float | None = Field(default=None, ge=0, le=2)
    insurance_bsd: float | None = Field(default=None, ge=0)
    service_fee_pct: float | None = Field(default=None, ge=0, le=1)
    service_fee_min_bsd: float | None = Field(default=None, ge=0)
    message: str | None = Field(default=None, max_length=5000)
    valid_days: int | None = Field(default=None, ge=1, le=90)  # restart the validity from today
    notify: bool = False  # tell the customer: timeline update + an email draft for review


class CustomerEditIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: str | None = None
    phone: str | None = None
    country: Literal["Bahamas", "United States", "Canada"] | None = None
    island: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=2000)

    @field_validator("phone")
    @classmethod
    def _phone(cls, v):
        return None if v is None else normalize_phone(v)

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        if v is None:
            return None
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Enter a valid email")
        return v


ProposalIn.model_rebuild()


# ---------- branding ----------

class BrandingIn(BaseModel):
    package: str = Field(pattern="^(basic|standard|full)$")
    business_name: str = Field(min_length=2, max_length=255)
    industry: str = Field(default="", max_length=255)
    description: str = Field(default="", max_length=5000)
    style_notes: str = Field(default="", max_length=5000)
    colours: str = Field(default="", max_length=255)
    reference_url: str = Field(default="", max_length=2000)


class BrandingFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    round_no: int | None
    filename: str
    content_type: str
    size_bytes: int
    created_at: datetime


class BrandingOut(BaseModel):
    id: int
    package: str
    package_name: str
    price_bsd: float
    rounds_included: int
    changes_used: int
    changes_left: int
    proof_round: int
    business_name: str
    industry: str
    description: str
    style_notes: str
    colours: str
    reference_url: str
    status: str
    invoice_number: str | None
    invoice_due: datetime | None
    paid_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    files: list[BrandingFileOut]
    timeline: list[EventOut]


class AdminBrandingOut(BrandingOut):
    admin_notes: str
    admin_unread: bool = False
    drive_folder_url: str | None = None
    payment_ref: str
    customer: CustomerBrief
    events: list[AdminEventOut]
    notifications: list[NotificationOut]


class AdminBrandingUpdate(BaseModel):
    admin_notes: str | None = None
    status: str | None = None


class BrandingChangesIn(BaseModel):
    feedback: str = Field(min_length=3, max_length=5000)


class BrandingUploadMessage(BaseModel):
    message: str = ""
