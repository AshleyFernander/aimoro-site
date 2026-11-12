'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { COUNTRIES, Country, REGIONS, formatPhone } from '@/lib/agent'
import { Card, ErrorNote, inputClass, labelClass, primaryBtn } from '@/components/agent/ui'

function SignupForm() {
  const { signup } = useAuth()
  const router = useRouter()
  const next = useSearchParams().get('next')
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', country: 'Bahamas' as Country, island: 'New Providence', address: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password.length < 8) { setError('Password must be at least 8 characters'); return }
    const phone = formatPhone(form.phone)
    if (!phone) { setError('Enter your phone / WhatsApp number with the area code, e.g. 242 555 0100'); return }
    if (!form.island) { setError(`Please choose your ${REGIONS[form.country].label.toLowerCase()}`); return }
    setBusy(true); setError(null)
    try {
      const user = await signup({ ...form, phone })
      router.replace(next || (user.role === 'admin' ? '/admin' : '/my-requests/new'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <h1 className="text-2xl font-extrabold text-slate-900 mb-1">Create your account</h1>
      <p className="text-sm text-slate-500 mb-6">Tell us what you want from China. We find it, send you one clear quote, and deliver it to your door in The Bahamas, the US or Canada.</p>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="name">Full name</label>
            <input id="name" required autoComplete="name" className={inputClass} value={form.name} onChange={set('name')} />
          </div>
          <div>
            <label className={labelClass} htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" className={inputClass} value={form.email} onChange={set('email')} />
          </div>
          <div>
            <label className={labelClass} htmlFor="password">Password (8+ characters)</label>
            <input id="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} value={form.password} onChange={set('password')} />
          </div>
          <div>
            <label className={labelClass} htmlFor="phone">Phone / WhatsApp (with area code)</label>
            <div className="flex">
              <span className="inline-flex items-center rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-600">+1</span>
              <input id="phone" type="tel" required autoComplete="tel-national" inputMode="tel" placeholder="242 555 0100"
                className={`${inputClass} rounded-l-none`} value={form.phone} onChange={set('phone')} />
            </div>
            <p className="text-xs text-slate-500 mt-1">Area code + number. We use it to send you updates on WhatsApp.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="country">Country</label>
              <select id="country" className={inputClass} value={form.country}
                onChange={e => { const c = e.target.value as Country; setForm(f => ({ ...f, country: c, island: c === 'Bahamas' ? 'New Providence' : '' })) }}>
                {COUNTRIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="island">{REGIONS[form.country].label}</label>
              <select id="island" required className={inputClass} value={form.island} onChange={set('island')}>
                {form.country !== 'Bahamas' && <option value="">Choose…</option>}
                {REGIONS[form.country].options.map(i => <option key={i}>{i}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="address">Delivery address</label>
            <textarea id="address" rows={2} autoComplete="street-address" className={inputClass} value={form.address} onChange={set('address')} />
          </div>
          <ErrorNote message={error} />
          <button type="submit" disabled={busy} className={`${primaryBtn} w-full`}>{busy ? 'Creating account…' : 'Create account'}</button>
          <p className="text-xs text-slate-500 text-center">
            By creating an account you agree to our <Link href="/terms" className="underline">Terms of Service</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
          </p>
        </form>
      </Card>
      <p className="text-sm text-slate-500 mt-4 text-center">
        Already have an account? <Link href="/login" className="font-semibold text-[#c40000]">Log in</Link>
      </p>
    </div>
  )
}

export default function SignupPage() {
  return <Suspense><SignupForm /></Suspense>
}
