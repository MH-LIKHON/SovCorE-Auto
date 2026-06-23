// ============================================================
// frontend/web/app/(auth)/register/page.tsx
// ============================================================
//
// Purpose:
//   Account creation screen. Functionally identical to /login
//   (email → six-digit code) because the backend auto-creates
//   a personal account and Owner membership on first code
//   verification. The page exists to give new users a distinct
//   starting point with appropriate copy.
//
// Design:
//   Same staged flow as the login page. Different heading,
//   different subline, footer link points back to /login.
//   Renders inside the auth shell (no navbar/footer).
//
// Consumed by:
//   - Next.js App Router (renders at /register)

'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { AuthCard } from '@/src/components/auth/auth-card'
import { Button } from '@/src/components/ui/button'
import { LOGIN_KEYFRAMES } from '@/src/components/login/login-keyframes'

// ==================================================
// CONSTANTS
// ==================================================

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const PULSE_COLOURS = ['#6c63ff', '#7b73ff', '#5548e0', '#00d4ff']

function isValidEmail(v: string) {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(v)
}

// ==================================================
// PAGE
// ==================================================

export default function RegisterPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidEmail(email)) { setError('Enter a valid email address.'); return }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/v1/auth/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { detail?: string }
        setError(data.detail ?? 'Something went wrong.')
        return
      }
      setSent(true)
    } catch {
      setError('Could not reach the server. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <>
        <AuthCard
          title="Check your email"
          subline="A six-digit sign-in code is on its way. Use it to finish setting up your account. The code expires after 10 minutes."
          foot={<Link href="/login">Back to sign in</Link>}
        >
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--colour-text-muted)' }}>
            Check your spam folder if it does not arrive within a few minutes. Your account is created automatically on first sign-in.
          </p>
          <Button
            onClick={() => router.push(`/login?next=/dashboard`)}
            size="lg"
          >
            Enter my code
          </Button>
        </AuthCard>
        <style>{LOGIN_KEYFRAMES}</style>
      </>
    )
  }

  return (
    <>
      <AuthCard
        title="Create your account"
        subline="Enter your email and we will send a sign-in code. No password required."
        foot={<Link href="/login">Already have an account? Sign in</Link>}
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
                onChange={(e) => { setEmail(e.target.value); fireKeystrokePulse(); setError(null) }}
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
          {error && (
            <div role="alert" style={{ fontSize: 12, color: 'var(--colour-error, #ff6b6b)', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,107,107,0.08)' }}>
              {error}
            </div>
          )}
          <Button type="submit" disabled={busy} size="lg">
            {busy ? 'Sending...' : 'Send sign-in code'}
          </Button>
        </form>
      </AuthCard>
      <style>{LOGIN_KEYFRAMES}</style>
    </>
  )
}
