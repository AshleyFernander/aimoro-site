'use client'

import { useEffect, useMemo, useState } from 'react'
import * as api from '@/lib/agent'
import { COUNTRIES, REGIONS, bsd, shortDate, type Country } from '@/lib/agent'
import { ErrorNote, inputClass, labelClass, primaryBtn, secondaryBtn } from './ui'

async function attempt(setBusy: (b: boolean) => void, setError: (e: string | null) => void, fn: () => Promise<unknown>) {
  setBusy(true); setError(null)
  try { await fn(); return true } catch (e) { setError((e as Error).message); return false } finally { setBusy(false) }
}

/** Edit what the customer asked for: name, quantity, budget, details, link, delivery address. */
export function RequestDetailsEditor({ req, onDone }: { req: api.AdminRequest; onDone: (changed: boolean) => Promise<void> | void }) {
  const [f, setF] = useState({
    product_name: req.product_name, quantity: String(req.quantity),
    target_price_bsd: req.target_price_bsd == null ? '' : String(req.target_price_bsd),
    description: req.description, reference_url: req.reference_url, delivery_address: req.delivery_address,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const qtyChanged = Number(f.quantity) !== req.quantity
  const repriced = qtyChanged && req.quotes.some(q => q.status === 'sent' || q.status === 'approved')

  async function save() {
    const ok = await attempt(setBusy, setError, () => api.adminUpdateRequest(req.id, {
      product_name: f.product_name.trim(), quantity: Number(f.quantity),
      target_price_bsd: f.target_price_bsd.trim() === '' ? null : Number(f.target_price_bsd),
      description: f.description, reference_url: f.reference_url.trim(), delivery_address: f.delivery_address.trim(),
    }))
    if (ok) await onDone(true)
  }

  return (
    <form className="space-y-2" onSubmit={e => { e.preventDefault(); save() }}>
      <div>
        <label className={labelClass} htmlFor="ed-name">Product</label>
        <input id="ed-name" required minLength={2} maxLength={255} className={inputClass} value={f.product_name}
          onChange={e => setF({ ...f, product_name: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} htmlFor="ed-qty">Quantity</label>
          <input id="ed-qty" required type="number" min={1} className={inputClass} value={f.quantity}
            onChange={e => setF({ ...f, quantity: e.target.value })} />
        </div>
        <div>
          <label className={labelClass} htmlFor="ed-budget">Budget (BSD)</label>
          <input id="ed-budget" type="number" min={0} step="0.01" placeholder="none" className={inputClass} value={f.target_price_bsd}
            onChange={e => setF({ ...f, target_price_bsd: e.target.value })} />
        </div>
      </div>
      {repriced && <p className="text-xs text-amber-700">Changing the quantity re-prices the options the customer can still choose or pay (and the unpaid invoice).</p>}
      <div>
        <label className={labelClass} htmlFor="ed-desc">Details</label>
        <textarea id="ed-desc" rows={3} className={inputClass} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
      </div>
      <div>
        <label className={labelClass} htmlFor="ed-link">Link</label>
        <input id="ed-link" type="url" className={inputClass} value={f.reference_url} onChange={e => setF({ ...f, reference_url: e.target.value })} />
      </div>
      <div>
        <label className={labelClass} htmlFor="ed-addr">Deliver to</label>
        <textarea id="ed-addr" rows={2} className={inputClass} value={f.delivery_address} onChange={e => setF({ ...f, delivery_address: e.target.value })} />
      </div>
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={primaryBtn}>Save</button>
        <button type="button" disabled={busy} className={secondaryBtn} onClick={() => onDone(false)}>Cancel</button>
      </div>
    </form>
  )
}

/** Edit the customer's account details. Future emails (and drafts waiting for review) go to the new email. */
export function CustomerEditor({ req, onDone }: { req: api.AdminRequest; onDone: (changed: boolean) => Promise<void> | void }) {
  const c = req.customer
  const [f, setF] = useState({ name: c.name, email: c.email, phone: c.phone, country: (c.country || 'Bahamas') as Country, island: c.island, address: c.address })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const region = REGIONS[f.country]

  async function save() {
    const ok = await attempt(setBusy, setError, () => api.editCustomer(c.id, {
      name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), country: f.country, island: f.island, address: f.address.trim(),
    }))
    if (ok) await onDone(true)
  }

  return (
    <form className="space-y-2" onSubmit={e => { e.preventDefault(); save() }}>
      <div>
        <label className={labelClass} htmlFor="cu-name">Name</label>
        <input id="cu-name" required className={inputClass} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      </div>
      <div>
        <label className={labelClass} htmlFor="cu-email">Email</label>
        <input id="cu-email" required type="email" className={inputClass} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
      </div>
      <div>
        <label className={labelClass} htmlFor="cu-phone">Phone / WhatsApp</label>
        <input id="cu-phone" className={inputClass} value={f.phone} placeholder="242 555 0100" onChange={e => setF({ ...f, phone: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass} htmlFor="cu-country">Country</label>
          <select id="cu-country" className={inputClass} value={f.country}
            onChange={e => { const country = e.target.value as Country; setF({ ...f, country, island: REGIONS[country].options[0] }) }}>
            {COUNTRIES.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="cu-island">{region.label}</label>
          <select id="cu-island" className={inputClass} value={f.island} onChange={e => setF({ ...f, island: e.target.value })}>
            {!region.options.includes(f.island) && <option value={f.island}>{f.island}</option>}
            {region.options.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={labelClass} htmlFor="cu-addr">Profile address</label>
        <textarea id="cu-addr" rows={2} className={inputClass} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} />
        <p className="text-[11px] text-slate-500 mt-1">This request&apos;s delivery address is edited under Request.</p>
      </div>
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={primaryBtn}>Save</button>
        <button type="button" disabled={busy} className={secondaryBtn} onClick={() => onDone(false)}>Cancel</button>
      </div>
    </form>
  )
}

const isExpired = (q: api.AdminQuote) => new Date(q.expires_at).getTime() < Date.now()

/** Options the customer can still choose or pay. They can be re-priced without sending new ones. */
export function editableQuotes(req: api.AdminRequest) {
  if (req.status !== 'quote_ready') return []
  return req.quotes
    .filter(q => q.status === 'sent' || (q.status === 'approved' && req.invoice?.status !== 'paid'))
    .sort((a, b) => (a.option_number ?? 1) - (b.option_number ?? 1))
}

/** Sent options with an Edit button each: change the product, freight, fees or validity, with a live before/after. */
export function SentOptionsCard({ req, onChanged }: { req: api.AdminRequest; onChanged: () => Promise<void> }) {
  const quotes = editableQuotes(req)
  const [editing, setEditing] = useState<number | null>(null)
  if (!quotes.length) return null
  const chosen = quotes.some(q => q.status === 'approved')
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        {chosen ? `The customer chose this option. Editing it also updates invoice ${req.invoice?.number ?? ''} (until it's paid).`
          : 'Fix a price or swap the product without sending new options. The customer keeps the same link.'}
      </p>
      {quotes.map(q => {
        const listing = req.listings.find(l => l.id === q.listing_id)
        return (
          <div key={q.id} className="rounded-2xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-bold text-slate-900 mr-auto">
                Option {q.option_number ?? 1}: {listing?.public_title || listing?.title || req.product_name}
                {q.status === 'approved' && <span className="ml-2 text-xs font-semibold text-emerald-700">✓ chosen</span>}
              </p>
              <span className="tabular-nums font-extrabold">{bsd(q.total_bsd)}</span>
              <span className="text-xs text-emerald-700">(+{bsd(q.margin_bsd)})</span>
              <span className={`text-xs ${isExpired(q) ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                {isExpired(q) ? 'Expired' : 'Valid until'} {shortDate(q.expires_at)}
              </span>
              <button type="button" className={`${secondaryBtn} !py-1.5 text-xs`} onClick={() => setEditing(editing === q.id ? null : q.id)}>
                {editing === q.id ? 'Close' : 'Edit'}
              </button>
            </div>
            {editing === q.id && (
              <QuoteEditForm req={req} quote={q} others={quotes.filter(o => o.id !== q.id)}
                onSaved={async () => { setEditing(null); await onChanged() }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function QuoteEditForm({ req, quote, others, onSaved }: {
  req: api.AdminRequest; quote: api.AdminQuote; others: api.AdminQuote[]; onSaved: () => Promise<void>
}) {
  const [f, setF] = useState({
    listing_id: String(quote.listing_id ?? ''), fx: String(quote.fx_cny_usd),
    freight: String(quote.freight_cost_bsd), markup: String(+(quote.freight_markup_pct * 100).toFixed(2)),
    insurance: String(quote.insurance_bsd), fee: String(+(quote.service_fee_pct * 100).toFixed(2)),
    feeMin: String(quote.service_fee_min_bsd), validDays: isExpired(quote) ? '7' : '', message: quote.message,
  })
  const [notify, setNotify] = useState(true)
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof api.previewQuoteEdit>> | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const taken = new Set(others.map(o => o.listing_id))
  const listings = req.listings.filter(l => l.id === quote.listing_id || !taken.has(l.id))
  const listing = req.listings.find(l => String(l.id) === f.listing_id)
  const needsFx = listing?.currency !== 'USD'

  const body = useMemo<api.QuoteEdit>(() => ({
    listing_id: Number(f.listing_id),
    ...(needsFx && Number(f.fx) > 0 ? { fx_cny_usd: Number(f.fx) } : {}),
    freight_cost_bsd: Number(f.freight) || 0, freight_markup_pct: (Number(f.markup) || 0) / 100,
    insurance_bsd: Number(f.insurance) || 0, service_fee_pct: (Number(f.fee) || 0) / 100,
    service_fee_min_bsd: Number(f.feeMin) || 0, message: f.message,
    ...(f.validDays.trim() ? { valid_days: Number(f.validDays) } : {}),
  }), [f, needsFx])

  useEffect(() => {
    const t = setTimeout(() => {
      api.previewQuoteEdit(quote.id, body).then(p => { setPreview(p); setError(null) }).catch(e => setError(e.message))
    }, 300)
    return () => clearTimeout(t)
  }, [quote.id, body])

  async function save() {
    const ok = await attempt(setBusy, setError, () => api.editQuote(quote.id, { ...body, notify }))
    if (ok) await onSaved()
  }

  const field = (k: keyof typeof f, label: string, step = '0.01') => (
    <div>
      <label className={labelClass} htmlFor={`qe-${quote.id}-${k}`}>{label}</label>
      <input id={`qe-${quote.id}-${k}`} type="number" min={0} step={step} className={inputClass} value={f[k]}
        onChange={e => setF({ ...f, [k]: e.target.value })} />
    </div>
  )

  const diff = preview ? preview.total_bsd - preview.before.total_bsd : 0
  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="col-span-2">
          <label className={labelClass} htmlFor={`qe-${quote.id}-l`}>Product (listing)</label>
          <select id={`qe-${quote.id}-l`} className={inputClass} value={f.listing_id} onChange={e => setF({ ...f, listing_id: e.target.value })}>
            {listings.map(l => <option key={l.id} value={l.id}>{l.public_title || l.title || l.platform} · {api.money(l.currency, l.price_cny)}</option>)}
          </select>
        </div>
        {needsFx ? field('fx', 'RMB → USD rate', '0.0001') : <p className="text-xs text-slate-500 self-end pb-2.5">USD price: no conversion</p>}
        {field('freight', 'Freight (BSD)')}
        {field('markup', 'Freight markup %', '1')}
        {field('insurance', 'Insurance (BSD)')}
        {field('fee', 'Service fee %', '0.5')}
        {field('feeMin', 'Min service fee (BSD)', '1')}
        <div>
          <label className={labelClass} htmlFor={`qe-${quote.id}-v`}>Valid for (days)</label>
          <input id={`qe-${quote.id}-v`} type="number" min={1} max={90} placeholder="keep" className={inputClass} value={f.validDays}
            onChange={e => setF({ ...f, validDays: e.target.value })} />
        </div>
        <div className="col-span-2 sm:col-span-3">
          <label className={labelClass} htmlFor={`qe-${quote.id}-m`}>Message to customer</label>
          <input id={`qe-${quote.id}-m`} className={inputClass} value={f.message} onChange={e => setF({ ...f, message: e.target.value })} />
        </div>
      </div>
      <p className="text-[11px] text-slate-500">To change the supplier price itself, edit the listing under Sourcing first; this option re-prices from it.</p>

      {preview && (
        <div className="rounded-xl bg-slate-50 p-3 text-sm grid grid-cols-2 sm:grid-cols-5 gap-2">
          {([['Product', preview.product_cost_bsd], ['Shipping', preview.shipping_bsd], ['Service fee', preview.service_fee_bsd]] as const).map(([k, v]) => (
            <div key={k}><p className="text-xs text-slate-500">{k}</p><p className="tabular-nums">{bsd(v)}</p></div>
          ))}
          <div>
            <p className="text-xs text-slate-500">Total</p>
            <p className="tabular-nums font-extrabold">{bsd(preview.total_bsd)}</p>
            <p className="text-[11px] text-slate-400">was {bsd(preview.before.total_bsd)}
              {Math.abs(diff) >= 0.005 && <span className={`ml-1 font-semibold ${diff > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{diff > 0 ? '+' : '−'}{bsd(Math.abs(diff))}</span>}
            </p>
          </div>
          <div><p className="text-xs text-slate-500">Your margin</p><p className="tabular-nums text-emerald-700">{bsd(preview.margin_bsd)}</p></div>
        </div>
      )}

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-1" checked={notify} onChange={e => setNotify(e.target.checked)} />
        <span>Tell the customer: add an update to their timeline and create an email draft (with the updated {quote.status === 'approved' ? 'invoice' : 'PDF'}) for you to review below.</span>
      </label>
      <ErrorNote message={error} />
      <button type="button" disabled={busy || !preview} className={primaryBtn} onClick={save}>Save changes</button>
    </div>
  )
}
