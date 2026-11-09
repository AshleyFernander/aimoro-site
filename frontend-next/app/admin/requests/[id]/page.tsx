'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { RequireAuth } from '@/components/agent/RequireAuth'
import { Card, ErrorNote, StatusBadge, inputClass, labelClass, primaryBtn, secondaryBtn } from '@/components/agent/ui'
import * as api from '@/lib/agent'
import { PLATFORMS, REQUEST_STATUS_OPTIONS, SHIPMENT_LABELS, STATUS_LABELS, CUR_SYMBOL, bsd, dateTime, locationText, money, requestPageUrl, shortDate, whatsappLink } from '@/lib/agent'
import { Timeline } from '@/components/agent/Timeline'
import { ListingCustomerView } from '@/components/agent/ListingCustomerView'
import { FlowSteps } from '@/components/agent/FlowSteps'
import { OptionsBuilder } from '@/components/agent/OptionsBuilder'
import { EmailCenter } from '@/components/agent/EmailCenter'
import { WarehousePhotoUpload } from '@/components/agent/WarehousePhotos'
import { CustomerEditor, RequestDetailsEditor, SentOptionsCard, editableQuotes } from '@/components/agent/AdminEdits'

const EMPTY_LISTING = { platform: 'taobao', currency: 'CNY' as api.Currency, url: '', title: '', price_cny: '', china_shipping_cny: '', seller_rating: '', weight_kg: '', notes: '' }

const searchLinks = (q: string) => [
  ['Taobao', `https://s.taobao.com/search?q=${encodeURIComponent(q)}`],
  ['AliExpress', `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(q)}`],
  ['Alibaba', `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(q)}`],
] as const

const num = (s: string) => (s.trim() === '' ? null : Number(s))

/** Step 4: confirm the report fee to unlock the full report for the customer. */
function ReportFeeCard({ req, busy, act }: { req: api.AdminRequest; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [ref, setRef] = useState('')
  const fee = bsd(req.report_fee_bsd).replace('.00', '')
  if (!req.options.length && !req.report_unlocked) return null
  if (req.report_unlocked) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm">
        <span className="font-semibold text-emerald-800">✓ Report fee paid{req.report_paid_at ? ` on ${shortDate(req.report_paid_at)}` : ''}{req.report_fee_ref ? ` (${req.report_fee_ref})` : ''}: the customer sees the full report.</span>
        {!req.invoice && (
          <button type="button" disabled={busy} className="text-xs font-semibold text-slate-500 underline"
            onClick={() => { if (confirm('Undo the report fee? The customer goes back to the blurred preview.')) act(() => api.adminReportFee(req.id, false)) }}>Undo</button>
        )}
      </div>
    )
  }
  return (
    <form className="flex flex-wrap items-center gap-2 rounded-xl border border-[#c40000]/30 bg-red-50/60 px-4 py-3 text-sm"
      onSubmit={e => { e.preventDefault(); act(() => api.adminReportFee(req.id, true, ref.trim())) }}>
      <span className="font-semibold text-slate-900 mr-auto">Preview sent. Waiting for the {fee} report fee; the customer sees blurred details until you confirm it.</span>
      <input aria-label="Payment reference" placeholder="Reference (e.g. Zelle 1234)" className={`${inputClass} !w-56 !py-2`}
        value={ref} onChange={e => setRef(e.target.value)} />
      <button type="submit" disabled={busy} className={`${primaryBtn} !py-2`}>Confirm {fee} paid · send full report</button>
    </form>
  )
}

function Workspace() {
  const id = Number(useParams<{ id: string }>().id)
  const [req, setReq] = useState<api.AdminRequest | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoVersion, setPhotoVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [listing, setListing] = useState(EMPTY_LISTING)

  const [openView, setOpenView] = useState<number | null>(null)
  const [editing, setEditing] = useState<'request' | 'customer' | null>(null)

  // admin fields
  const [notes, setNotes] = useState('')
  const [tracking, setTracking] = useState('')
  const [payRef, setPayRef] = useState('bank transfer')
  const [orderNo, setOrderNo] = useState('')
  const [whNotes, setWhNotes] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await api.adminRequest(id)
      setReq(r)
      setNotes(r.admin_notes)
      setTracking(r.tracking_number)
    } catch (e) { setError((e as Error).message) }
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!req?.has_photo) return
    let url: string | null = null
    api.fetchFileUrl(`/requests/${req.id}/photo`).then(u => { url = u; setPhotoUrl(u) }).catch(() => {})
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [req?.id, req?.has_photo, photoVersion])

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null)
    try { await fn(); await load() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  if (!req) return <div className="p-8"><ErrorNote message={error} />{!error && <p className="text-sm text-slate-500">Loading…</p>}</div>

  const approved = req.quotes.some(q => q.status === 'approved')
  const canQuote = ['received', 'sourcing', 'quote_ready'].includes(req.status) && !approved
  const cheapest = req.listings.reduce<api.Listing | null>((best, l) =>
    !best || (l.price_bsd_estimate ?? Infinity) < (best.price_bsd_estimate ?? Infinity) ? l : best, null)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-4">
      <Link href="/admin" className="text-sm font-semibold text-slate-500 hover:text-slate-800">← Queue</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold text-slate-900">#{req.id} · {req.product_name}</h1>
        <StatusBadge status={req.status} />
        <label className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold cursor-pointer ${req.fee_waived ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-slate-200 text-slate-600'}`}>
          <input type="checkbox" checked={req.fee_waived} disabled={busy}
            onChange={e => { const v = e.target.checked; act(() => api.adminUpdateRequest(req.id, { fee_waived: v })) }} />
          Friends &amp; Family: sourcing fee waived
        </label>
      </div>
      <FlowSteps req={req} listingCount={req.listings.length} />
      <ErrorNote message={error} />
      <ReportFeeCard req={req} busy={busy} act={act} />
      {req.notifications.some(n => n.status === 'draft' && n.to_address === req.customer.email) && (
        <a href="#emails" className="block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          An email to {req.customer.name} is waiting for your review. Edit and send it ↓
        </a>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Request + customer */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-slate-900">Request</h2>
              {editing !== 'request' && <button type="button" className="text-xs font-semibold text-[#c40000]" onClick={() => setEditing('request')}>Edit</button>}
            </div>
            {editing === 'request' ? (
              <RequestDetailsEditor req={req} onDone={async changed => { setEditing(null); if (changed) await load() }} />
            ) : (
            <dl className="text-sm space-y-1">
              <div><dt className="inline text-slate-500">Qty: </dt><dd className="inline font-semibold">{req.quantity}</dd></div>
              {req.target_price_bsd != null && <div><dt className="inline text-slate-500">Budget: </dt><dd className="inline font-semibold">{bsd(req.target_price_bsd)}</dd></div>}
              {req.description && <div><dt className="inline text-slate-500">Details: </dt><dd className="inline whitespace-pre-wrap">{req.description}</dd></div>}
              {req.reference_url && <div className="break-all"><dt className="inline text-slate-500">Link: </dt><dd className="inline"><a className="text-[#c40000] underline" href={req.reference_url} target="_blank" rel="noopener noreferrer">{req.reference_url}</a></dd></div>}
              <div><dt className="inline text-slate-500">Received: </dt><dd className="inline">{shortDate(req.created_at)}</dd></div>
            </dl>
            )}
            {photoUrl && <img src={photoUrl} alt="Customer photo" className="mt-3 max-h-56 rounded-xl border border-slate-100" />}
            {req.has_photo && (
              <button type="button" disabled={busy} className={`${secondaryBtn} mt-3 w-full !py-2 text-xs`}
                onClick={() => act(() => api.downloadFile(`/requests/${req.id}/photo`, `request-${req.id}-photo`))}>Download photo</button>
            )}
            <label className={`${secondaryBtn} mt-2 w-full cursor-pointer !py-2 text-xs`}>
              {req.has_photo ? 'Replace "what they asked for" photo' : 'Add "what they asked for" photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''
                  if (f) act(async () => { await api.uploadPhoto(req.id, f); setPhotoVersion(v => v + 1) }) }} />
            </label>
            <p className="text-[11px] text-slate-500 mt-1">Shown to the customer and in the PDF next to each option you found.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {searchLinks(req.product_name).map(([label, href]) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">Search {label} ↗</a>
              ))}
            </div>
          </Card>
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-slate-900">Customer</h2>
              {editing !== 'customer' && <button type="button" className="text-xs font-semibold text-[#c40000]" onClick={() => setEditing('customer')}>Edit</button>}
            </div>
            {editing === 'customer' ? (
              <CustomerEditor req={req} onDone={async changed => { setEditing(null); if (changed) await load() }} />
            ) : (<>
            <p className="text-sm font-semibold">{req.customer.name}</p>
            <p className="text-sm text-slate-600">{req.customer.email}</p>
            {req.customer.phone && (
              <p className="text-sm text-slate-600">{req.customer.phone} · <a className="text-[#c40000] font-semibold" target="_blank" rel="noopener noreferrer"
                href={whatsappLink(req.customer.phone)}>WhatsApp</a></p>
            )}
            <p className="text-sm text-slate-600">{locationText(req.customer)}</p>
            <p className="text-sm text-slate-600 whitespace-pre-wrap"><span className="text-slate-500">Deliver to: </span>{req.delivery_address || '—'}</p>
            </>)}
          </Card>
          <Card>
            <h2 className="font-bold text-slate-900 mb-2">Status & shipping</h2>
            <label className={labelClass} htmlFor="status">Status</label>
            <select id="status" className={inputClass} value={req.status} disabled={busy}
              onChange={e => act(() => api.adminUpdateRequest(req.id, { status: e.target.value as api.RequestStatus }))}>
              {REQUEST_STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <label className={`${labelClass} mt-3`} htmlFor="tracking">Tracking number</label>
            <input id="tracking" className={inputClass} value={tracking} onChange={e => setTracking(e.target.value)} />
            <label className={`${labelClass} mt-3`} htmlFor="notes">Private notes</label>
            <textarea id="notes" rows={3} className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} />
            <button disabled={busy} className={`${secondaryBtn} w-full mt-3`}
              onClick={() => act(() => api.adminUpdateRequest(req.id, { tracking_number: tracking, admin_notes: notes }))}>Save</button>
          </Card>
        </div>

        {/* Sourcing + quote */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <h2 className="font-bold text-slate-900 mb-1">Sourcing <span className="text-xs font-semibold text-slate-400">(private)</span></h2>
            <p className="text-xs text-slate-500 mb-3">Paste what you find in the Taobao / Pinduoduo / 1688 apps. Prices in RMB (¥) or USD ($); RMB is converted to BSD at today's rate.
              For each listing, click <b>Add photo &amp; specs</b> (or <b>Edit</b>) to upload its photo, fill in the comparison the customer sees, or fix the price and link.</p>
            {req.listings.length > 0 && (
              <div className="overflow-x-auto -mx-1 mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                      <th className="py-2 px-1">Platform</th><th className="px-1">Item</th>
                      <th className="px-1 text-right">Price each</th><th className="px-1 text-right">China ship</th>
                      <th className="px-1 text-right">≈ BSD each</th><th className="px-1">Rating</th><th className="px-1">Details</th><th className="px-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {req.listings.map(l => (
                      <Fragment key={l.id}>
                      <tr className="border-b border-slate-50 align-top">
                        <td className="py-2 px-1 font-semibold capitalize">{l.platform}{l.is_chosen && <span className="ml-1 text-[10px] text-emerald-700">✓ quoted</span>}</td>
                        <td className="px-1 max-w-[220px]">
                          {l.url ? <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-[#c40000] underline break-all">{l.title || 'Open listing'}</a> : (l.title || '—')}
                          {l.notes && <p className="text-xs text-slate-500">{l.notes}</p>}
                        </td>
                        <td className="px-1 text-right tabular-nums whitespace-nowrap">{money(l.currency, l.price_cny)}</td>
                        <td className="px-1 text-right tabular-nums whitespace-nowrap">{money(l.currency, l.china_shipping_cny)}</td>
                        <td className={`px-1 text-right tabular-nums ${cheapest?.id === l.id ? 'font-bold text-emerald-700' : ''}`}>
                          {l.price_bsd_estimate != null ? bsd(l.price_bsd_estimate) : '—'}
                        </td>
                        <td className="px-1">{l.seller_rating ?? '—'}</td>
                        <td className="px-1">
                          <button type="button" aria-expanded={openView === l.id} onClick={() => setOpenView(openView === l.id ? null : l.id)}
                            className={`text-xs font-semibold whitespace-nowrap px-2.5 py-1 rounded-full border ${l.has_photo && l.specs.length
                              ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-[#c40000] text-white bg-[#c40000]'}`}>
                            {openView === l.id ? 'Close' : l.has_photo && l.specs.length ? 'Edit ✓' : 'Add photo & specs'}
                          </button>
                        </td>
                        <td className="px-1 text-right">
                          {!l.is_chosen && (
                            <button className="text-xs text-slate-400 hover:text-red-600" disabled={busy}
                              onClick={() => act(() => api.deleteListing(l.id))}>Remove</button>
                          )}
                        </td>
                      </tr>
                      {openView === l.id && (
                        <tr><td colSpan={8} className="py-3"><ListingCustomerView listing={l} onSaved={load} /></td></tr>
                      )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <form className="grid grid-cols-2 sm:grid-cols-4 gap-2" onSubmit={e => {
              e.preventDefault()
              act(async () => {
                const added = await api.addListing(req.id, {
                  platform: listing.platform as api.Platform, currency: listing.currency,
                  url: listing.url.trim(), title: listing.title.trim(),
                  price_cny: Number(listing.price_cny), china_shipping_cny: Number(listing.china_shipping_cny) || 0,
                  seller_rating: num(listing.seller_rating), weight_kg: num(listing.weight_kg), notes: listing.notes.trim(),
                  public_title: '', preview_title: '', public_notes: '', specs: [],
                })
                setListing(EMPTY_LISTING)
                setOpenView(added.id)  // go straight to photo & specs
              })
            }}>
              <select aria-label="Platform" className={inputClass} value={listing.platform} onChange={e => setListing({ ...listing, platform: e.target.value })}>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select aria-label="Currency" className={inputClass} value={listing.currency}
                onChange={e => setListing({ ...listing, currency: e.target.value as api.Currency })}>
                <option value="CNY">RMB (¥)</option>
                <option value="USD">USD ($)</option>
              </select>
              <input aria-label="Price each" required type="number" min={0} step="0.01" placeholder={`${CUR_SYMBOL[listing.currency]} price each`} className={inputClass}
                value={listing.price_cny} onChange={e => setListing({ ...listing, price_cny: e.target.value })} />
              <input aria-label="China shipping" type="number" min={0} step="0.01" placeholder={`${CUR_SYMBOL[listing.currency]} China shipping`} className={inputClass}
                value={listing.china_shipping_cny} onChange={e => setListing({ ...listing, china_shipping_cny: e.target.value })} />
              <input aria-label="Seller rating" type="number" min={0} max={5} step="0.1" placeholder="Rating /5" className={inputClass}
                value={listing.seller_rating} onChange={e => setListing({ ...listing, seller_rating: e.target.value })} />
              <input aria-label="Listing link" type="url" placeholder="Paste link from app" className={`${inputClass} col-span-2`}
                value={listing.url} onChange={e => setListing({ ...listing, url: e.target.value })} />
              <input aria-label="Title" placeholder="Title" className={inputClass}
                value={listing.title} onChange={e => setListing({ ...listing, title: e.target.value })} />
              <input aria-label="Weight kg" type="number" min={0} step="0.01" placeholder="Weight kg" className={inputClass}
                value={listing.weight_kg} onChange={e => setListing({ ...listing, weight_kg: e.target.value })} />
              <input aria-label="Notes" placeholder="Notes (colour, size, seller…)" className={`${inputClass} col-span-2 sm:col-span-3`}
                value={listing.notes} onChange={e => setListing({ ...listing, notes: e.target.value })} />
              <button type="submit" disabled={busy} className={`${secondaryBtn} col-span-2 sm:col-span-1`}>+ Add listing</button>
            </form>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-bold text-slate-900">Quote builder</h2>
              {req.options.length > 0 && (
                <button type="button" className={secondaryBtn} onClick={() => act(() => api.downloadOptionsPdf(req.id))}>Customer PDF</button>
              )}
            </div>
            {editableQuotes(req).length > 0 && (
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">{approved ? 'Chosen option' : 'Sent options'}</p>
                <SentOptionsCard req={req} onChanged={load} />
              </div>
            )}
            {req.listings.length === 0 ? (
              <p className="text-sm text-slate-500">Add at least one listing first.</p>
            ) : !canQuote ? (
              <p className="text-sm text-slate-500">{approved ? (req.invoice?.status === 'paid' ? 'The customer chose an option and paid.' : 'The customer chose an option. You can still edit it above until the invoice is paid.') : `This request can't be quoted while its status is “${STATUS_LABELS[req.status]}”.`}</p>
            ) : (
              <>
                <p className="text-xs text-slate-500 mb-3">{editableQuotes(req).length > 0
                  ? 'Or send a new set of 1 to 3 options (replaces the ones above).'
                  : 'Send 1 to 3 options. The customer sees each one next to what they asked for and chooses one.'}</p>
                <OptionsBuilder req={req} onSent={load} />
              </>
            )}
          </Card>

          {req.invoice && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-slate-900">Invoice {req.invoice.number}</h2>
                  <p className="text-sm text-slate-500">{bsd(req.invoice.amount_bsd)} · {req.invoice.status}</p>
                </div>
                <button className={secondaryBtn} onClick={() => act(() => api.downloadInvoice(req.invoice!))}>PDF</button>
              </div>
              {req.invoice.status !== 'paid' && (
                <div className="flex gap-2 mt-3">
                  <input aria-label="Payment reference" className={inputClass} value={payRef} onChange={e => setPayRef(e.target.value)} />
                  <button disabled={busy} className={primaryBtn} onClick={() => act(() => api.markInvoicePaid(req.invoice!.id, payRef))}>Mark paid</button>
                </div>
              )}
            </Card>
          )}

          {['paid', 'ordered', 'shipped', 'delivered'].includes(req.status) && (
            <Card>
              <h2 className="font-bold text-slate-900 mb-3">Fulfilment</h2>
              <ol className="space-y-4 text-sm">
                <li>
                  <p className="font-semibold text-slate-800">1. Supplier order</p>
                  {req.supplier_order_no ? (
                    <p className="text-slate-600">Order <span className="font-mono">{req.supplier_order_no}</span> · {req.ordered_at && dateTime(req.ordered_at)}</p>
                  ) : (
                    <form className="flex gap-2 mt-1" onSubmit={e => { e.preventDefault(); act(async () => { await api.recordOrder(req.id, orderNo); setOrderNo('') }) }}>
                      <input aria-label="Supplier order number" required placeholder="Taobao / PDD order number" className={inputClass}
                        value={orderNo} onChange={e => setOrderNo(e.target.value)} />
                      <button disabled={busy} className={primaryBtn}>Mark ordered</button>
                    </form>
                  )}
                </li>
                <li>
                  <p className="font-semibold text-slate-800">2. China warehouse check</p>
                  {req.warehouse_arrived_at ? (
                    <p className="text-slate-600">Arrived {dateTime(req.warehouse_arrived_at)}{req.warehouse_notes ? ` · ${req.warehouse_notes}` : ''}</p>
                  ) : req.status === 'ordered' ? (
                    <form className="flex gap-2 mt-1" onSubmit={e => { e.preventDefault(); act(async () => { await api.warehouseArrival(req.id, whNotes); setWhNotes('') }) }}>
                      <input aria-label="Warehouse check notes" placeholder="Check notes (colour, damage, count)" className={inputClass}
                        value={whNotes} onChange={e => setWhNotes(e.target.value)} />
                      <button disabled={busy} className={secondaryBtn}>Arrived</button>
                    </form>
                  ) : <p className="text-slate-400">After the supplier order</p>}
                  {['paid', 'ordered', 'shipped', 'delivered'].includes(req.status) && <WarehousePhotoUpload req={req} onChanged={load} />}
                </li>
                <li>
                  <p className="font-semibold text-slate-800">3. Shipment</p>
                  {req.shipment_id && req.shipment ? (
                    <p className="text-slate-600">
                      <Link className="text-[#c40000] font-semibold underline" href={`/admin/shipments/${req.shipment_id}`}>{req.shipment.reference}</Link>
                      {' '}· {SHIPMENT_LABELS[req.shipment.status]}
                    </p>
                  ) : req.status === 'ordered' ? (
                    <p className="text-slate-600">Not in a shipment yet. <Link href="/admin/shipments" className="text-[#c40000] font-semibold underline">Add it on Shipments</Link></p>
                  ) : <p className="text-slate-400">After ordering</p>}
                </li>
                <li>
                  <p className="font-semibold text-slate-800">4. Delivered</p>
                  {req.status === 'delivered'
                    ? <p className="text-slate-600">Delivered to {req.delivery_address}. Done.</p>
                    : <p className="text-slate-400">Marked from the shipment page.</p>}
                </li>
              </ol>
            </Card>
          )}

          <Card>
            <h2 className="font-bold text-slate-900 mb-3">Timeline</h2>
            <Timeline items={req.events} action={e => e.customer_visible !== false && req.customer.phone ? (
              <a className="text-xs font-semibold text-emerald-700" target="_blank" rel="noopener noreferrer"
                href={whatsappLink(req.customer.phone, `Hi ${req.customer.name.split(' ')[0]}, update on your AIMORO request "${req.product_name}": ${e.message}\n\nView your request: ${requestPageUrl(req.id)}`)}>
                Send on WhatsApp ↗
              </a>
            ) : null} />
          </Card>

          <EmailCenter req={req} onChanged={load} />

          {req.quotes.length > 0 && (
            <Card>
              <h2 className="font-bold text-slate-900 mb-2">Quote history</h2>
              <ul className="text-sm divide-y divide-slate-100">
                {req.quotes.map(q => (
                  <li key={q.id} className="flex justify-between py-2">
                    <span>{shortDate(q.created_at)}{q.option_number ? ` · option ${q.option_number}` : ''} · <span className="capitalize">{q.status}</span></span>
                    <span className="tabular-nums">{bsd(q.total_bsd)} <span className="text-xs text-emerald-700">(+{bsd(q.margin_bsd)})</span></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AdminRequestPage() {
  return <RequireAuth admin><Workspace /></RequireAuth>
}
