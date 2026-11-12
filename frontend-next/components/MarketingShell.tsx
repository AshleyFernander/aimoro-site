'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from './AuthProvider'
import { CONTACT_EMAIL, CONTACT_WHATSAPP, CONTACT_WHATSAPP_2, whatsappLink } from '@/lib/agent'

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="AIMORO home">
      <Image src="/favicon.png" alt="" width={36} height={36} className="object-contain" />
      <span className={`font-extrabold tracking-[0.18em] text-lg ${dark ? 'text-white' : 'text-[#0f172a]'}`}>AIMORO</span>
    </Link>
  )
}

/** embedded: shown inside the admin sidebar layout (no full-height wrapper; the top menu only on desktop,
 *  since phones already have the admin top bar and bottom menu). */
export function MarketingShell({ children, embedded = false }: { children: React.ReactNode; embedded?: boolean }) {
  const { user, logout } = useAuth()
  const accountHref = user?.role === 'admin' ? '/admin' : '/my-requests'
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  useEffect(() => { setMenuOpen(false) }, [pathname])
  const mobileLinks: [string, string][] = [
    ['How it works', '/#how'], ['Why AIMORO', '/#why'], ['Branding', '/branding'], ['FAQ', '/#faq'],
  ]

  return (
    <div className={`${embedded ? 'min-h-full' : 'min-h-screen'} flex flex-col bg-white text-[#0f172a]`}>
      <header className={`${embedded ? 'hidden lg:block' : ''} sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-100`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Logo />
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600" aria-label="Main">
            <Link href="/#how" className="hover:text-[#0f172a]">How it works</Link>
            <Link href="/#why" className="hover:text-[#0f172a]">Why AIMORO</Link>
            <Link href="/branding" className="hover:text-[#0f172a]">Branding</Link>
            <Link href="/#faq" className="hover:text-[#0f172a]">FAQ</Link>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <button type="button" onClick={logout}
                  className="hidden sm:inline-flex items-center rounded-xl text-sm font-semibold px-4 py-2.5 text-slate-700 hover:bg-slate-100 transition-colors">
                  Log out
                </button>
                <Link href={accountHref} className="inline-flex items-center whitespace-nowrap rounded-xl bg-[#c40000] hover:bg-[#950000] text-white text-sm font-semibold px-4 py-2.5 transition-colors">
                  {user.role === 'admin' ? 'Request queue' : 'My requests'}
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="hidden sm:inline-flex items-center rounded-xl text-sm font-semibold px-4 py-2.5 text-slate-700 hover:bg-slate-100 transition-colors">Log in</Link>
                <Link href="/signup" className="hidden lg:inline-flex items-center rounded-xl border border-slate-200 text-sm font-semibold px-4 py-2.5 text-slate-700 hover:bg-slate-50 transition-colors">Sign up</Link>
                <Link href="/signup" className="inline-flex items-center whitespace-nowrap rounded-xl bg-[#c40000] hover:bg-[#950000] text-white text-sm font-semibold px-4 py-2.5 transition-colors"><span className="sm:hidden">Get a quote</span><span className="hidden sm:inline">Start a request</span></Link>
              </>
            )}
            <button type="button" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen} aria-label="Menu"
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl text-slate-700 hover:bg-slate-100">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d={menuOpen ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} />
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="md:hidden border-t border-slate-100 bg-white px-4 pb-4 pt-2" aria-label="Mobile">
            <ul className="divide-y divide-slate-100">
              {mobileLinks.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} onClick={() => setMenuOpen(false)} className="flex items-center justify-between py-3 text-base font-semibold text-slate-800">
                    {label}
                  </Link>
                </li>
              ))}
              <li><a href={`mailto:${CONTACT_EMAIL}`} className="block py-3 text-base font-semibold text-slate-800">Contact</a></li>
              {!user && <li><Link href="/login" onClick={() => setMenuOpen(false)} className="block py-3 text-base font-semibold text-slate-800">Log in</Link></li>}
              {!user && <li><Link href="/signup" onClick={() => setMenuOpen(false)} className="block py-3 text-base font-semibold text-slate-800">Sign up</Link></li>}
              {user && <li><button type="button" onClick={() => { logout(); setMenuOpen(false) }} className="block w-full text-left py-3 text-base font-semibold text-slate-800">Log out</button></li>}
            </ul>
          </nav>
        )}
      </header>

      <main className="flex-1">{children}</main>

      {!embedded && (
        <a href={whatsappLink(CONTACT_WHATSAPP, 'Hi AIMORO, I’d like a quote.')} target="_blank" rel="noopener noreferrer"
          aria-label="Chat with AIMORO on WhatsApp"
          className="fixed z-40 right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:right-6 sm:bottom-6 inline-flex items-center gap-2 rounded-full bg-[#25D366] hover:bg-[#1ebe5b] text-white font-semibold text-sm p-3.5 sm:pl-3.5 sm:pr-4 sm:py-3 shadow-[0_10px_28px_rgba(0,0,0,0.22)] transition-colors">
          <svg className="w-6 h-6 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12Z" /></svg>
          <span className="hidden sm:inline">WhatsApp</span>
        </a>
      )}

      <footer className="bg-[#0f172a] text-slate-300">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3 lg:col-span-1">
            <Logo dark />
            <p className="text-sm leading-relaxed text-slate-400">Your sourcing agent in China. Tell us what you want and we deliver it to your door in The Bahamas.</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">AIMORO</p>
            <ul className="space-y-2 text-sm">
              <li><Link href="/#how" className="hover:text-white">How it works</Link></li>
              <li><Link href="/#why" className="hover:text-white">Why AIMORO</Link></li>
              <li><Link href="/branding" className="hover:text-white">Branding</Link></li>
              <li><Link href="/#faq" className="hover:text-white">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Account</p>
            <ul className="space-y-2 text-sm">
              <li><Link href="/signup" className="hover:text-white">Create an account</Link></li>
              <li><Link href="/login" className="hover:text-white">Log in</Link></li>
              <li><Link href="/my-requests" className="hover:text-white">My requests</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-3">Contact & legal</p>
            <ul className="space-y-2 text-sm">
              <li><a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white break-all">{CONTACT_EMAIL}</a></li>
              {[CONTACT_WHATSAPP, CONTACT_WHATSAPP_2].map(n => (
                <li key={n}><a href={whatsappLink(n)} target="_blank" rel="noopener noreferrer" className="hover:text-white">WhatsApp {n}</a></li>
              ))}
              <li><Link href="/terms" className="hover:text-white">Terms of Service</Link></li>
              <li><Link href="/privacy" className="hover:text-white">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 text-xs text-slate-500 flex flex-wrap justify-between gap-2">
            <span>© {new Date().getFullYear()} AIMORO. All rights reserved.</span>
            <span>Sourced from China · Delivered to your door</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
