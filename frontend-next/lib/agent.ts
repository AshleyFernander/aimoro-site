// API client for the sourcing-agent features (accounts, requests, quotes, invoices).

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000'
const TOKEN_KEY = 'aimoro_token'

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'aimoroinfo@gmail.com'
export const CONTACT_WHATSAPP = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP || '+1 242-426-1965'
export const CONTACT_WHATSAPP_2 = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP_2 || '+1 281-673-6703'

export type RequestStatus =
  | 'received' | 'sourcing' | 'quote_ready' | 'paid'
  | 'ordered' | 'shipped' | 'delivered' | 'cancelled'

export const STATUS_FLOW: RequestStatus[] = [
  'received', 'sourcing', 'quote_ready', 'paid', 'ordered', 'shipped', 'delivered',
]

export const STATUS_LABELS: Record<RequestStatus, string> = {
  received: 'Received',
  sourcing: 'Sourcing',
  quote_ready: 'Quote ready',
  paid: 'Paid',
  ordered: 'Ordered',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

export const PLATFORMS = ['taobao', 'pinduoduo', '1688', 'alibaba', 'aliexpress', 'other'] as const
export type Platform = (typeof PLATFORMS)[number]

export const ISLANDS = [
  'New Providence', 'Grand Bahama', 'Abaco', 'Eleuthera', 'Exuma', 'Andros',
  'Long Island', 'Bimini', 'Cat Island', 'Inagua', 'Other',
]

export const COUNTRIES = ['Bahamas', 'United States', 'Canada'] as const
export type Country = (typeof COUNTRIES)[number]

export const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware',
  'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas',
  'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi',
  'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Puerto Rico', 'Rhode Island',
  'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
]

export const CA_PROVINCES = [
  'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador',
  'Northwest Territories', 'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec',
  'Saskatchewan', 'Yukon',
]

/** Islands (Bahamas), states (US) or provinces (Canada) for the location dropdown. */
export const REGIONS: Record<Country, { label: string; options: string[] }> = {
  Bahamas: { label: 'Island', options: ISLANDS },
  'United States': { label: 'State', options: US_STATES },
  Canada: { label: 'Province', options: CA_PROVINCES },
}

/** "Florida, United States" / "New Providence, Bahamas". */
export const locationText = (u: { island: string; country?: string | null }) =>
  [u.island, u.country].filter(Boolean).join(', ')

/** Bahamas, US and Canada all use +1: area code + 7 digits. Returns null when invalid. */
export function formatPhone(input: string): string | null {
  let d = input.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  if (d.length !== 10) return null
  return `+1 ${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
}

export interface User {
  id: number; email: string; role: 'customer' | 'admin'
  name: string; phone: string; country: Country | null; island: string; address: string
}

export interface CustomerQuote {
  id: number
  product_cost_bsd: number; shipping_bsd: number; service_fee_bsd: number; total_bsd: number
  message: string; status: 'sent' | 'approved' | 'expired' | 'superseded'
  created_at: string; expires_at: string
}

export interface Invoice {
  id: number; number: string; amount_bsd: number
  status: 'sent' | 'paid' | 'refunded'; paid_at: string | null; created_at: string
}

export interface TimelineEvent { kind: string; message: string; created_at: string }

// AIMORO's responsibility ends at delivery to the customer's address.
export type ShipmentStatus = 'preparing' | 'in_transit' | 'delivered'
export const SHIPMENT_FLOW: ShipmentStatus[] = ['preparing', 'in_transit', 'delivered']
export const SHIPMENT_LABELS: Record<ShipmentStatus, string> = {
  preparing: 'Preparing', in_transit: 'In transit', delivered: 'Delivered',
}
export const SHIPMENT_METHODS = ['courier', 'air', 'sea'] as const

export interface CustomerShipment {
  reference: string; method: string; carrier: string; tracking_number: string
  status: ShipmentStatus; eta: string
  shipped_at: string | null; delivered_at: string | null
}

export type MatchLevel = 'match' | 'close' | 'different'
export interface SpecRow { label: string; requested: string; found: string; match: MatchLevel }

/** A found product as the customer sees it (never supplier, platform, link or CNY price). */
export interface CustomerOption {
  id: number; option_number: number; title: string; notes: string; specs: SpecRow[]; has_photo: boolean
  /** Preview: "found" and match status are withheld until the report fee is paid. */
  locked: boolean
  product_cost_bsd: number; shipping_bsd: number; service_fee_bsd: number; total_bsd: number
  status: 'sent' | 'approved' | 'expired' | 'superseded'; expires_at: string
}

export interface ProductRequest {
  id: number; product_name: string; description: string; reference_url: string
  delivery_address: string; has_photo: boolean; quantity: number; target_price_bsd: number | null
  status: RequestStatus; tracking_number: string
  created_at: string; updated_at: string
  quote: CustomerQuote | null; invoice: Invoice | null
  shipment: CustomerShipment | null
  options: CustomerOption[]
  timeline: TimelineEvent[]
  warehouse_photos: WarehousePhoto[]
  /** The full report unlocks once Ashley confirms the report fee. */
  report_unlocked: boolean; report_fee_bsd: number; report_paid_at: string | null
}

export interface WarehousePhoto { id: number; caption: string; media_type: 'image' | 'video'; created_at: string }

export type Currency = 'CNY' | 'USD'
export const CUR_SYMBOL: Record<Currency, string> = { CNY: '¥', USD: '$' }
/** Listing price in its own currency, e.g. "¥128.00" or "$45.00". */
export const money = (cur: Currency | null | undefined, n: number) => `${CUR_SYMBOL[cur || 'CNY']}${n.toFixed(2)}`

export interface Listing {
  id: number; platform: Platform; url: string; title: string
  currency: Currency  // price_cny / china_shipping_cny are in this currency
  price_cny: number; china_shipping_cny: number
  seller_rating: number | null; weight_kg: number | null; notes: string
  // customer-facing presentation
  public_title: string; preview_title: string; public_notes: string; specs: SpecRow[]; has_photo: boolean
  is_chosen: boolean; price_bsd_estimate: number | null; created_at: string
}

export type ListingInput = Omit<Listing, 'id' | 'is_chosen' | 'price_bsd_estimate' | 'created_at' | 'has_photo'>

export const MATCH_LABELS: Record<MatchLevel, string> = { match: 'Match', close: 'Close', different: 'Different' }

export interface AdminQuote extends CustomerQuote {
  proposal_no: number | null; option_number: number | null
  listing_id: number | null; fx_cny_usd: number
  freight_cost_bsd: number; freight_markup_pct: number; insurance_bsd: number
  service_fee_pct: number; service_fee_min_bsd: number; margin_bsd: number
}

export interface AdminEvent extends TimelineEvent { customer_visible: boolean }

export type AttachmentKind = 'options_preview' | 'options_full' | 'invoice'
export const ATTACHMENT_LABELS: Record<AttachmentKind, string> = {
  options_preview: 'Options PDF (preview, blurred)', options_full: 'Options PDF (full report)', invoice: 'Invoice PDF',
}

export interface NotificationLog {
  id: number; to_address: string; subject: string; body: string
  status: 'draft' | 'queued' | 'sent' | 'skipped' | 'failed' | 'discarded'; error: string
  attachments: AttachmentKind[]; created_at: string; sent_at: string | null
}

export interface EmailTemplate { key: string; label: string; subject: string; body: string; attachments: AttachmentKind[] }
export interface EmailDraftBrief { id: number; request_id: number; product_name: string; customer_name: string; subject: string; created_at: string }

export interface AdminRequest extends ProductRequest {
  admin_notes: string
  admin_unread: boolean
  customer: { id: number; name: string; email: string; phone: string; country: string | null; island: string; address: string }
  listings: Listing[]
  quotes: AdminQuote[]
  supplier_order_no: string | null; ordered_at: string | null
  warehouse_arrived_at: string | null; warehouse_notes: string | null
  shipment_id: number | null
  events: AdminEvent[]
  notifications: NotificationLog[]
  fee_waived: boolean
  report_fee_ref: string | null
}

export interface ShipmentItem {
  id: number; product_name: string; quantity: number; status: RequestStatus
  customer_name: string; customer_island: string; delivery_address: string; warehouse_arrived: boolean
}

export interface AdminShipment {
  id: number; reference: string; method: string; carrier: string; tracking_number: string
  weight_kg: number | null; freight_cost_bsd: number | null; status: ShipmentStatus; eta: string; notes: string
  created_at: string; shipped_at: string | null; delivered_at: string | null
  requests: ShipmentItem[]
}

export interface ShipmentInput {
  method: string; carrier: string; tracking_number: string
  weight_kg: number | null; freight_cost_bsd: number | null; eta: string; notes: string
}

export interface QuoteBuildInput {
  listing_id: number; fx_cny_usd?: number | null
  freight_cost_bsd: number; freight_markup_pct: number; insurance_bsd: number
  service_fee_pct: number; service_fee_min_bsd: number; message?: string
}

export interface QuotePreview {
  fx_cny_usd: number
  product_cost_bsd: number; shipping_bsd: number; service_fee_bsd: number
  total_bsd: number; margin_bsd: number
}

// ── token storage ─────────────────────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* storage unavailable */ }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, cache: 'no-store' })
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') message = data.detail
      else if (Array.isArray(data.detail) && data.detail[0]?.msg) message = data.detail[0].msg
    } catch { /* not json */ }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

const json = (body: unknown) => JSON.stringify(body)

// ── auth ──────────────────────────────────────────────────────────────────────

export interface SignupInput {
  email: string; password: string; name: string; phone: string; country: Country; island: string; address: string
}
export const signup = (body: SignupInput) =>
  request<{ token: string; user: User }>('/auth/signup', { method: 'POST', body: json(body) })
export const login = (email: string, password: string) =>
  request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: json({ email, password }) })
export const me = () => request<User>('/auth/me')

// ── customer ──────────────────────────────────────────────────────────────────

export interface RequestInput {
  product_name: string; description: string; reference_url: string; delivery_address: string
  quantity: number; target_price_bsd: number | null
}
export const createRequest = (body: RequestInput) =>
  request<ProductRequest>('/requests', { method: 'POST', body: json(body) })
export const uploadPhoto = (id: number, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return request<ProductRequest>(`/requests/${id}/photo`, { method: 'POST', body: form })
}
export const myRequests = () => request<ProductRequest[]>('/requests')
export const getRequest = (id: number) => request<ProductRequest>(`/requests/${id}`)
export const approveQuote = (id: number, quoteId?: number) =>
  request<ProductRequest>(`/requests/${id}/approve${quoteId ? `?quote_id=${quoteId}` : ''}`, { method: 'POST' })
export const warehousePhotoPath = (requestId: number, photoId: number) => `/requests/${requestId}/warehouse-photos/${photoId}`
export const optionPhotoPath = (requestId: number, quoteId: number) => `/requests/${requestId}/options/${quoteId}/photo`

export async function downloadOptionsPdf(requestId: number) {
  const url = await fetchFileUrl(`/requests/${requestId}/options.pdf`)
  const a = document.createElement('a')
  a.href = url
  a.download = `AIMORO-options-request-${requestId}.pdf`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
export const cancelRequest = (id: number) =>
  request<ProductRequest>(`/requests/${id}/cancel`, { method: 'POST' })
export const paymentConfig = () =>
  request<{ stripe_enabled: boolean; bank_instructions: string }>('/payments/config')
export const startCheckout = (invoiceId: number) =>
  request<{ url: string }>(`/invoices/${invoiceId}/checkout`, { method: 'POST' })
export const confirmPayment = (invoiceId: number, sessionId: string) =>
  request<ProductRequest>(`/invoices/${invoiceId}/confirm?session_id=${encodeURIComponent(sessionId)}`, { method: 'POST' })

/** Fetches an authenticated file (photo, invoice PDF) as an object URL. */
export async function fetchFileUrl(path: string): Promise<string> {
  const token = getToken()
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new ApiError(res.status, 'Could not load file')
  return URL.createObjectURL(await res.blob())
}

export async function downloadInvoice(invoice: Invoice) {
  const url = await fetchFileUrl(`/invoices/${invoice.id}/pdf`)
  const a = document.createElement('a')
  a.href = url
  a.download = `${invoice.number}.pdf`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

// ── admin ─────────────────────────────────────────────────────────────────────

export const adminSummary = () => request<Record<RequestStatus, number>>('/admin/summary')
export const adminRequests = (status?: string) =>
  request<AdminRequest[]>(`/admin/requests${status ? `?status=${status}` : ''}`)
export const adminRequest = (id: number) => request<AdminRequest>(`/admin/requests/${id}`)
export type RequestEdit = Partial<Pick<AdminRequest, 'status' | 'admin_notes' | 'tracking_number' | 'fee_waived'
  | 'product_name' | 'description' | 'reference_url' | 'delivery_address' | 'quantity' | 'target_price_bsd'>>
export const adminUpdateRequest = (id: number, body: RequestEdit) =>
  request<AdminRequest>(`/admin/requests/${id}`, { method: 'PATCH', body: json(body) })

/** Edit a sent option (or the chosen one before payment). Fields left out keep their value. */
export interface QuoteEdit {
  listing_id?: number; fx_cny_usd?: number; freight_cost_bsd?: number; freight_markup_pct?: number
  insurance_bsd?: number; service_fee_pct?: number; service_fee_min_bsd?: number; message?: string
  valid_days?: number; notify?: boolean
}
export const previewQuoteEdit = (quoteId: number, body: QuoteEdit) =>
  request<QuotePreview & { before: { total_bsd: number; margin_bsd: number } }>(`/admin/quotes/${quoteId}/preview`, { method: 'POST', body: json(body) })
export const editQuote = (quoteId: number, body: QuoteEdit) =>
  request<AdminRequest>(`/admin/quotes/${quoteId}`, { method: 'PATCH', body: json(body) })

export type CustomerEdit = Partial<Pick<AdminRequest['customer'], 'name' | 'email' | 'phone' | 'island' | 'address'>> & { country?: Country }
export const editCustomer = (userId: number, body: CustomerEdit) =>
  request<AdminRequest['customer']>(`/admin/customers/${userId}`, { method: 'PATCH', body: json(body) })
export const updateListing = (id: number, body: ListingInput) =>
  request<Listing>(`/admin/listings/${id}`, { method: 'PATCH', body: json(body) })
export const uploadListingPhoto = (id: number, file: File) => {
  const form = new FormData()
  form.append('file', file)
  return request<Listing>(`/admin/listings/${id}/photo`, { method: 'POST', body: form })
}
export const listingPhotoPath = (listingId: number) => `/admin/listings/${listingId}/photo`
export const previewProposal = (requestId: number, options: QuoteBuildInput[]) =>
  request<(QuotePreview & { listing_id: number })[]>(`/admin/requests/${requestId}/proposal/preview`, { method: 'POST', body: json({ options }) })
export const sendProposal = (requestId: number, options: QuoteBuildInput[], message: string) =>
  request<AdminQuote[]>(`/admin/requests/${requestId}/proposal`, { method: 'POST', body: json({ options, message }) })
export const emailTemplates = (requestId: number) => request<EmailTemplate[]>(`/admin/requests/${requestId}/email-templates`)
export const createEmail = (requestId: number, body: { subject: string; body: string; attachments: AttachmentKind[]; send: boolean }) =>
  request<NotificationLog>(`/admin/requests/${requestId}/emails`, { method: 'POST', body: json(body) })
export const updateEmail = (id: number, body: { subject?: string; body?: string; attachments?: AttachmentKind[] }) =>
  request<NotificationLog>(`/admin/notifications/${id}`, { method: 'PATCH', body: json(body) })
export const sendEmail = (id: number) => request<NotificationLog>(`/admin/notifications/${id}/send`, { method: 'POST' })
export const discardEmail = (id: number) => request<NotificationLog>(`/admin/notifications/${id}/discard`, { method: 'POST' })
/** Exactly what the customer receives: same code path as sending, attachments included. */
export interface EmailPreview {
  from: string; to: string; reply_to: string; subject: string; html: string; text: string
  attachments: { kind: AttachmentKind; filename: string; size_bytes: number }[]
  warnings: string[]
}
export const previewEmail = (body: { subject: string; body: string; attachments: AttachmentKind[]; request_id?: number; notification_id?: number }) =>
  request<EmailPreview>('/admin/emails/preview', { method: 'POST', body: json(body) })
export const attachmentPath = (requestId: number, kind: AttachmentKind) => `/admin/requests/${requestId}/attachments/${kind}`
export const emailDrafts = () => request<EmailDraftBrief[]>('/admin/email-drafts')
/** Upload warehouse photos/videos with progress (0-100), since videos can be large. */
export function uploadWarehousePhotos(requestId: number, files: File[], caption: string,
                                      onProgress?: (pct: number) => void): Promise<AdminRequest> {
  const fd = new FormData()
  files.forEach(f => fd.append('files', f))
  fd.append('caption', caption)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE_URL}/admin/requests/${requestId}/warehouse-photos`)
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      let data: unknown = null
      try { data = JSON.parse(xhr.responseText) } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as AdminRequest)
      else {
        const d = (data as { detail?: unknown } | null)?.detail
        reject(new ApiError(xhr.status, typeof d === 'string' ? d : `Upload failed (${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed. Check your connection and try again.'))
    xhr.send(fd)
  })
}
export const deleteWarehousePhoto = (photoId: number) =>
  request<AdminRequest>(`/admin/warehouse-photos/${photoId}`, { method: 'DELETE' })
export async function downloadFile(path: string, filename: string) {
  const token = getToken()
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new ApiError(res.status, 'Could not download file')
  const blob = await res.blob()
  const ext = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' } as Record<string, string>)[blob.type] ?? ''
  if (ext && !filename.endsWith(ext)) filename += ext
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
export const addListing = (requestId: number, body: ListingInput) =>
  request<Listing>(`/admin/requests/${requestId}/listings`, { method: 'POST', body: json(body) })
export const deleteListing = (id: number) =>
  request<{ deleted: number }>(`/admin/listings/${id}`, { method: 'DELETE' })
export const getFx = () => request<{ rate: number; source: string }>('/admin/fx')
export const previewQuote = (requestId: number, body: QuoteBuildInput) =>
  request<QuotePreview>(`/admin/requests/${requestId}/quote/preview`, { method: 'POST', body: json(body) })
export const sendQuote = (requestId: number, body: QuoteBuildInput) =>
  request<AdminQuote>(`/admin/requests/${requestId}/quote`, { method: 'POST', body: json(body) })
export const markInvoicePaid = (invoiceId: number, reference: string) =>
  request<Invoice>(`/admin/invoices/${invoiceId}/mark-paid?reference=${encodeURIComponent(reference)}`, { method: 'POST' })
/** Confirm (or undo) the report fee: confirming unlocks the full report for the customer. */
export const adminReportFee = (id: number, paid: boolean, reference = '') =>
  request<AdminRequest>(`/admin/requests/${id}/report-fee?paid=${paid}&reference=${encodeURIComponent(reference)}`, { method: 'POST' })

// ── operations (admin) ────────────────────────────────────────────────────────

export const recordOrder = (id: number, supplier_order_no: string, note = '') =>
  request<AdminRequest>(`/admin/requests/${id}/order`, { method: 'POST', body: json({ supplier_order_no, note }) })
export const warehouseArrival = (id: number, notes: string) =>
  request<AdminRequest>(`/admin/requests/${id}/warehouse`, { method: 'POST', body: json({ notes }) })
export const readyToShip = () => request<ShipmentItem[]>('/admin/ready-to-ship')
export const listShipments = () => request<AdminShipment[]>('/admin/shipments')
export const getShipment = (id: number) => request<AdminShipment>(`/admin/shipments/${id}`)
export const createShipment = (body: Partial<ShipmentInput>) =>
  request<AdminShipment>('/admin/shipments', { method: 'POST', body: json(body) })
export const updateShipment = (id: number, body: ShipmentInput) =>
  request<AdminShipment>(`/admin/shipments/${id}`, { method: 'PATCH', body: json(body) })
export const addToShipment = (id: number, requestId: number) =>
  request<AdminShipment>(`/admin/shipments/${id}/requests/${requestId}`, { method: 'POST' })
export const removeFromShipment = (id: number, requestId: number) =>
  request<AdminShipment>(`/admin/shipments/${id}/requests/${requestId}`, { method: 'DELETE' })
export const advanceShipment = (id: number, status: ShipmentStatus) =>
  request<AdminShipment>(`/admin/shipments/${id}/status`, { method: 'POST', body: json({ status }) })

/** Digits for wa.me: always with the +1 country code (Bahamas, US and Canada). */
export const whatsappNumber = (phone: string) => {
  const d = phone.replace(/\D/g, '')
  return d.length === 10 ? `1${d}` : d
}

/** wa.me link with a prefilled message. */
export const whatsappLink = (phone: string, text?: string) =>
  `https://wa.me/${whatsappNumber(phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`

/** Email text -> WhatsApp text: *bold*, • bullets, and the request link (with the PDFs) added when missing. */
export function whatsappText(body: string, link: string, hasAttachments = false) {
  let t = body.replace(/\*\*(.+?)\*\*/g, '*$1*').replace(/^\s*[*-]\s+/gm, '• ').trim()
  if (!t.includes(link)) {
    t += hasAttachments ? `\n\nView your request and download your PDF here: ${link}` : `\n\nView your request: ${link}`
  }
  return t
}

/** Customer-facing link to a request page, for WhatsApp messages. */
export const requestPageUrl = (id: number) =>
  `${process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : 'https://aimoro.co')}/my-requests/${id}`

// ── formatting ────────────────────────────────────────────────────────────────

export const bsd = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const dateTime = (iso: string) =>
  new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`)
    .toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
export const shortDate = (iso: string) =>
  new Date(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export const REQUEST_STATUS_OPTIONS: RequestStatus[] = [...STATUS_FLOW, 'cancelled']

// ── branding ──────────────────────────────────────────────────────────────────

export type BrandingStatus =
  | 'awaiting_payment' | 'in_design' | 'proofs_ready' | 'changes_requested'
  | 'approved' | 'completed' | 'cancelled'
export type BrandingPackageKey = 'basic' | 'standard' | 'full'

/** Steps shown to the customer. "Changes requested" shares the design step. */
export const BRANDING_FLOW: BrandingStatus[] = ['awaiting_payment', 'in_design', 'proofs_ready', 'approved', 'completed']
export const BRANDING_LABELS: Record<BrandingStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  in_design: 'In design',
  proofs_ready: 'Proofs ready',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  completed: 'Final files delivered',
  cancelled: 'Cancelled',
}

export interface BrandingPackage { key: BrandingPackageKey; name: string; price: number; rounds: number; days: string }
export interface BrandingFile {
  id: number; kind: 'reference' | 'proof' | 'final'; round_no: number | null
  filename: string; content_type: string; size_bytes: number; created_at: string
}
export interface BrandingProject {
  id: number; package: BrandingPackageKey; package_name: string; price_bsd: number
  rounds_included: number; changes_used: number; changes_left: number; proof_round: number
  business_name: string; industry: string; description: string; style_notes: string; colours: string; reference_url: string
  status: BrandingStatus; invoice_number: string | null; invoice_due: string | null
  paid_at: string | null; completed_at: string | null; created_at: string; updated_at: string
  files: BrandingFile[]; timeline: TimelineEvent[]
}
export interface AdminBrandingProject extends BrandingProject {
  admin_notes: string; payment_ref: string; admin_unread: boolean; drive_folder_url: string | null
  customer: AdminRequest['customer']
  events: AdminEvent[]; notifications: NotificationLog[]
}
export interface BrandingInput {
  package: BrandingPackageKey; business_name: string; industry: string; description: string
  style_notes: string; colours: string; reference_url: string
}

export const brandingPackages = () => request<BrandingPackage[]>('/branding/packages')
export const createBranding = (body: BrandingInput) =>
  request<BrandingProject>('/branding', { method: 'POST', body: json(body) })
export const myBranding = () => request<BrandingProject[]>('/branding')
export const getBranding = (id: number) => request<BrandingProject>(`/branding/${id}`)
export const approveBranding = (id: number) => request<BrandingProject>(`/branding/${id}/approve`, { method: 'POST' })
export const requestBrandingChanges = (id: number, feedback: string) =>
  request<BrandingProject>(`/branding/${id}/changes`, { method: 'POST', body: json({ feedback }) })
export const cancelBranding = (id: number) => request<BrandingProject>(`/branding/${id}/cancel`, { method: 'POST' })
export const startBrandingCheckout = (id: number) =>
  request<{ url: string }>(`/branding/${id}/checkout`, { method: 'POST' })
export const confirmBrandingPayment = (id: number, sessionId: string) =>
  request<BrandingProject>(`/branding/${id}/confirm?session_id=${encodeURIComponent(sessionId)}`, { method: 'POST' })
export const brandingFilePath = (projectId: number, fileId: number) => `/branding/${projectId}/files/${fileId}`
export const downloadBrandingInvoice = (p: BrandingProject) =>
  downloadFile(`/branding/${p.id}/invoice.pdf`, `${p.invoice_number ?? `AIMORO-branding-${p.id}`}.pdf`)

/** Multipart upload with progress (0-100); design files can be large. */
export function uploadWithProgress<T>(path: string, files: File[], fields: Record<string, string> = {},
                                      onProgress?: (pct: number) => void): Promise<T> {
  const fd = new FormData()
  files.forEach(f => fd.append('files', f))
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v))
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE_URL}${path}`)
    const token = getToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      let data: unknown = null
      try { data = JSON.parse(xhr.responseText) } catch { /* not json */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T)
      else {
        const d = (data as { detail?: unknown } | null)?.detail
        reject(new ApiError(xhr.status, typeof d === 'string' ? d : `Upload failed (${xhr.status})`))
      }
    }
    xhr.onerror = () => reject(new ApiError(0, 'Upload failed. Check your connection and try again.'))
    xhr.send(fd)
  })
}
export const uploadBrandingReferences = (id: number, files: File[], onProgress?: (pct: number) => void) =>
  uploadWithProgress<BrandingProject>(`/branding/${id}/files`, files, {}, onProgress)

export const adminBrandingSummary = () => request<Record<BrandingStatus, number>>('/admin/branding/summary')
export const adminBrandingList = (status?: string) =>
  request<AdminBrandingProject[]>(`/admin/branding${status ? `?status=${status}` : ''}`)
export const adminBranding = (id: number) => request<AdminBrandingProject>(`/admin/branding/${id}`)
export const adminUpdateBranding = (id: number, body: { admin_notes?: string; status?: BrandingStatus }) =>
  request<AdminBrandingProject>(`/admin/branding/${id}`, { method: 'PATCH', body: json(body) })
export const adminBrandingMarkPaid = (id: number, reference: string) =>
  request<AdminBrandingProject>(`/admin/branding/${id}/mark-paid?reference=${encodeURIComponent(reference)}`, { method: 'POST' })
export const adminSendProofs = (id: number, files: File[], message: string, onProgress?: (pct: number) => void) =>
  uploadWithProgress<AdminBrandingProject>(`/admin/branding/${id}/proofs`, files, { message }, onProgress)
export const adminDeliverFinals = (id: number, files: File[], message: string, onProgress?: (pct: number) => void) =>
  uploadWithProgress<AdminBrandingProject>(`/admin/branding/${id}/finals`, files, { message }, onProgress)
export const adminDeleteBrandingFile = (fileId: number) =>
  request<AdminBrandingProject>(`/admin/branding/files/${fileId}`, { method: 'DELETE' })

export const fileSize = (n: number) =>
  n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

// ── admin unread badges + password reset ──────────────────────────────────────

export const adminUnread = () => request<{ requests: number; branding: number }>('/admin/unread')
export const forgotPassword = (email: string) =>
  request<{ ok: boolean }>('/auth/forgot-password', { method: 'POST', body: json({ email }) })
export const resetPassword = (token: string, password: string) =>
  request<{ token: string; user: User }>('/auth/reset-password', { method: 'POST', body: json({ token, password }) })
