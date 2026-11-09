'use client'

import { useEffect, useState } from 'react'
import * as api from '@/lib/agent'
import { CUR_SYMBOL, MATCH_LABELS, PLATFORMS, type Currency, type MatchLevel, type Platform, type SpecRow } from '@/lib/agent'
import { ErrorNote, inputClass, labelClass, primaryBtn, secondaryBtn } from './ui'

const STARTER_ROWS: SpecRow[] = ['Colour', 'Size', 'Material'].map(label => ({ label, requested: '', found: '', match: 'match' }))

/** Admin editor for what the customer sees about one found product: photo, name, comparison, notes. */
export function ListingCustomerView({ listing, onSaved }: { listing: api.Listing; onSaved: () => Promise<void> }) {
  const optNum = (n: number | null) => (n == null ? '' : String(n))
  const [sup, setSup] = useState({
    platform: listing.platform, currency: listing.currency, url: listing.url, title: listing.title,
    price: String(listing.price_cny), shipping: String(listing.china_shipping_cny),
    rating: optNum(listing.seller_rating), weight: optNum(listing.weight_kg), notes: listing.notes,
  })
  const [title, setTitle] = useState(listing.public_title)
  const [previewTitle, setPreviewTitle] = useState(listing.preview_title || '')
  const [notes, setNotes] = useState(listing.public_notes)
  const [specs, setSpecs] = useState<SpecRow[]>(listing.specs.length ? listing.specs : STARTER_ROWS)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!listing.has_photo) { setPhotoUrl(null); return }
    let url: string | null = null
    api.fetchFileUrl(api.listingPhotoPath(listing.id)).then(u => { url = u; setPhotoUrl(u) }).catch(() => {})
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [listing.id, listing.has_photo])

  const setRow = (i: number, patch: Partial<SpecRow>) =>
    setSpecs(rows => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null); setSaved(false)
    try { await fn(); await onSaved() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  async function save() {
    await run(async () => {
      const n = (v: string) => (v.trim() === '' ? null : Number(v))
      await api.updateListing(listing.id, {
        platform: sup.platform, url: sup.url.trim(), title: sup.title.trim(),
        currency: sup.currency, price_cny: Number(sup.price) || 0, china_shipping_cny: Number(sup.shipping) || 0,
        seller_rating: n(sup.rating), weight_kg: n(sup.weight), notes: sup.notes.trim(),
        public_title: title.trim(), preview_title: previewTitle.trim(), public_notes: notes.trim(),
        specs: specs.filter(r => r.label.trim() && (r.requested.trim() || r.found.trim())),
      })
      setSaved(true)
    })
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-4">
      <details className="rounded-xl border border-slate-200 bg-white p-3" open={false}>
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-500">Supplier details (private): price, link, notes</summary>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select aria-label="Platform" className={inputClass} value={sup.platform} onChange={e => setSup({ ...sup, platform: e.target.value as Platform })}>
            {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select aria-label="Currency" className={inputClass} value={sup.currency} onChange={e => setSup({ ...sup, currency: e.target.value as Currency })}>
            <option value="CNY">RMB (¥)</option><option value="USD">USD ($)</option>
          </select>
          <input aria-label="Price each" type="number" min={0} step="0.01" placeholder={`${CUR_SYMBOL[sup.currency]} price each`} className={inputClass}
            value={sup.price} onChange={e => setSup({ ...sup, price: e.target.value })} />
          <input aria-label="China shipping" type="number" min={0} step="0.01" placeholder={`${CUR_SYMBOL[sup.currency]} China shipping`} className={inputClass}
            value={sup.shipping} onChange={e => setSup({ ...sup, shipping: e.target.value })} />
          <input aria-label="Listing link" type="url" placeholder="Link" className={`${inputClass} col-span-2`} value={sup.url} onChange={e => setSup({ ...sup, url: e.target.value })} />
          <input aria-label="Supplier title" placeholder="Title" className={inputClass} value={sup.title} onChange={e => setSup({ ...sup, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <input aria-label="Seller rating" type="number" min={0} max={5} step="0.1" placeholder="Rating" className={inputClass} value={sup.rating} onChange={e => setSup({ ...sup, rating: e.target.value })} />
            <input aria-label="Weight kg" type="number" min={0} step="0.01" placeholder="kg" className={inputClass} value={sup.weight} onChange={e => setSup({ ...sup, weight: e.target.value })} />
          </div>
          <input aria-label="Private notes" placeholder="Private notes" className={`${inputClass} col-span-2 sm:col-span-4`} value={sup.notes} onChange={e => setSup({ ...sup, notes: e.target.value })} />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">Changing the price doesn&apos;t change options already sent. After saving, open Edit on the option and save it to re-price.</p>
      </details>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">What the customer sees for this find</p>
      <div className="grid sm:grid-cols-[160px_1fr] gap-4">
        <div className="space-y-2">
          <div className="aspect-square rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
            {photoUrl ? <img src={photoUrl} alt="Product photo" className="w-full h-full object-contain" />
              : <span className="text-xs text-slate-400 text-center px-2">No photo yet</span>}
          </div>
          <label className={`${secondaryBtn} w-full cursor-pointer !px-2 !py-2 text-xs`}>
            {listing.has_photo ? 'Replace photo' : 'Upload photo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy}
              onChange={e => { const f = e.target.files?.[0]; if (f) run(() => api.uploadListingPhoto(listing.id, f)) }} />
          </label>
          <p className="text-[11px] text-slate-500">A screenshot from the app works. Crop out the seller name and any prices.</p>
        </div>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor={`pt-${listing.id}`}>Name in the full report</label>
              <input id={`pt-${listing.id}`} className={inputClass} placeholder="e.g. FJWX FX6040C X-ray scanner" maxLength={120}
                value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor={`pv-${listing.id}`}>Name in the preview (no model name)</label>
              <input id={`pv-${listing.id}`} className={inputClass} placeholder="e.g. Scanner A" maxLength={120}
                value={previewTitle} onChange={e => setPreviewTitle(e.target.value)} />
            </div>
          </div>
          <p className="-mt-1 text-[11px] text-slate-500">Until the report fee is paid, the customer sees the preview name, what they asked for and the price. What you found, the match, notes and photo stay hidden.</p>
          <div>
            <p className={labelClass}>Comparison</p>
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-[1fr_1.4fr_1.4fr_110px_28px] gap-2 text-[11px] font-semibold text-slate-500 px-1">
                <span>Detail</span><span>They asked for</span><span>We found</span><span>Match</span><span />
              </div>
              {specs.map((r, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_1.4fr_1.4fr_110px_28px] gap-2">
                  <input aria-label="Detail" className={inputClass} placeholder="Detail" value={r.label} maxLength={60}
                    onChange={e => setRow(i, { label: e.target.value })} />
                  <input aria-label="They asked for" className={inputClass} placeholder="They asked for" value={r.requested} maxLength={200}
                    onChange={e => setRow(i, { requested: e.target.value })} />
                  <input aria-label="We found" className={inputClass} placeholder="We found" value={r.found} maxLength={200}
                    onChange={e => setRow(i, { found: e.target.value })} />
                  <select aria-label="Match" className={inputClass} value={r.match} onChange={e => setRow(i, { match: e.target.value as MatchLevel })}>
                    {(Object.keys(MATCH_LABELS) as MatchLevel[]).map(m => <option key={m} value={m}>{MATCH_LABELS[m]}</option>)}
                  </select>
                  <button type="button" aria-label="Remove row" className="text-slate-400 hover:text-red-600 text-lg"
                    onClick={() => setSpecs(rows => rows.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              {specs.length < 12 && (
                <button type="button" className="text-xs font-semibold text-[#c40000]"
                  onClick={() => setSpecs(rows => [...rows, { label: '', requested: '', found: '', match: 'match' }])}>+ Add row</button>
              )}
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor={`pn-${listing.id}`}>Notes for the customer (optional)</label>
            <textarea id={`pn-${listing.id}`} rows={2} className={inputClass} maxLength={600}
              placeholder="e.g. Fully lined with an inside zip pocket. Very close to your photo."
              value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <ErrorNote message={error} />
          <div className="flex items-center gap-3">
            <button type="button" disabled={busy} className={primaryBtn} onClick={save}>Save</button>
            {saved && <span className="text-xs font-semibold text-emerald-700">Saved</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
