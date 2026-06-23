// ============================================================
// frontend/web/app/(auth)/forgot/page.tsx
// ============================================================
//
// Purpose:
//   "Can't get in?" entry point for passwordless sign-in.
//   Sends a fresh six-digit code to the email address. Returns
//   a generic acknowledgment whether or not the address is
//   registered — prevents user enumeration.
//
// Design:
//   Mirrors the QR forgot page layout exactly: AuthCard with
//   email field, keystroke pulse ring, and a confirmation state.
//   The backend endpoint called is POST /api/v1/auth/request-code
//   (same as login) because passwordless login and account
//   recovery are the same operation — request a fresh code.
//
// Consumed by:
//   - Next.js App Router (renders at /forgot)

'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'

import { AuthCard } from '@/src/components/auth/auth-card'
import { Button } from '@/src/components/ui/button'
import { LOGIN_KEYFRAMES } from '@/src/components/login/login-keyframes'

// ==================================================
// CONSTANTS
// ==================================================

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const PULSE_COLOURS = ['#6c63ff', '#7b73ff', '#5548e0', '#00d4ff']

// ==================================================
// PAGE
// ==================================================

export default function ForgotPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [focused, setFocused] = useState(false)
  const pulseRingRef = useRef<HTMLDivElement>(null)

  function fireKeystrokePulse() {
    const ring = pulseRingRef.current
    if (!ring) return
    const dot = document.createElement('div')
    const colour = PULSE_COLOURS[Math.floor(Math.random() * PULSE_COLOURS.length)] ?? '#6c63ff'
    dot.style.cssText = `position:absolute;height:100%;width:20px;border-radius:1px;background:${colour};left:${Math.random() * 80 + 10}%;animation:keystrokePulse 0.5s ease-out forwards`
    ring.appendChild(dot)
    setTimeout(() => dot.remove(), 500)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    try {
      // Generic response whether or not the email is registered.
      await fetch(`${API}/api/v1/auth/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'include',
      })
      setSent(true)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <>
        <AuthCard
          title="Check your email"
          subline="If the address is on an account, a sign-in code is on its way. The code expires after 10 minutes."
          foot={<Link href="/login">Back to sign in</Link>}
        >
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--colour-text-muted)' }}>
            Check your spam folder if the email does not arrive within a few minutes. Return to the sign-in page and enter your code when it arrives.
          </p>
        </AuthCard>
        <style>{LOGIN_KEYFRAMES}</style>
      </>
    )
  }

  return (
    <>
      <AuthCard
        title="Can't get in?"
        subline="Enter your email and we will send a fresh sign-in code. No password required."
        foot={<Link href="/login">Back to sign in</Link>}
      >
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <label style={{
              display: 'block',
              fontSize: 11,
              letterSpacing: '0.5px',
              textTransform: 'uppercase' as const,
              color: focused ? '#6c63ff' : 'var(--colour-text-muted)',
              marginBottom: 6,
              transition: 'color 0.3s',
            }}>
              Email address
            </label>
            <div className="sov-input-wrap">
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => { setEmail(e.target.value); fireKeystrokePulse() }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `0.5px solid ${focused ? 'rgba(108,99,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  background: focused ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                  color: 'var(--colour-text)',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box' as const,
                  boxShadow: focused ? '0 0 0 3px rgba(108,99,255,0.1)' : 'none',
                  transition: 'border-color 0.3s, box-shadow 0.3s, background 0.3s',
                }}
              />
              <div ref={pulseRingRef} aria-hidden="true" style={{ position: 'absolute', bottom: -2, left: 12, right: 12, height: 2, borderRadius: 1, overflow: 'hidden' }} />
            </div>
          </div>
          <Button type="submit" disabled={busy} size="lg">
            {busy ? 'Sending...' : 'Send sign-in code'}
          </Button>
        </form>
      </AuthCard>
      <style>{LOGIN_KEYFRAMES}</style>
    </>
  )
}
