// ============================================================
// frontend/web/app/(auth)/login/page.tsx
// ============================================================
//
// Purpose:
//   Passwordless sign-in screen. Email entry, then a six-digit
//   code entry. On success the success overlay plays, then the
//   user is redirected to /dashboard (or ?next= path).
//
// Design:
//   Staged reveal flow — premium single-focus experience:
//
//   Stage 1 (email):
//     Only the email field is visible. When a valid email is
//     typed, a pulsing purple arrow appears on the right. Click
//     it or press Enter to call POST /api/v1/auth/request-code
//     and advance to stage 2.
//
//   Stage 2 (code):
//     Email shrinks to a purple pill at top. Six code input boxes
//     appear. Each digit field auto-advances to the next. Paste
//     a six-digit string into the first field and all boxes fill.
//     When all six digits are present the form auto-submits to
//     POST /api/v1/auth/verify-code. If requires_2fa=true, stage 3
//     fires; otherwise the success overlay plays.
//
//   Stage 3 (TOTP — only when 2FA is enabled):
//     A single six-digit TOTP field appears. On submit, calls
//     POST /api/v1/auth/2fa/verify with the partial token.
//
//   Microsoft SSO:
//     One button that redirects to /api/v1/auth/sso/microsoft/start.
//     No Google or Yahoo — Auto only supports Microsoft in Phase 1.
//
//   Auth: custom backend API, not NextAuth. Access token is
//   stored in sessionStorage only (cleared on tab close). The
//   HTTP-only refresh cookie persists across tab reopens.
//
//   Components composed:
//     - LoginBackground      — ambient orbs, particles, gradient lines
//     - LoginCard            — glass card with 3D tilt and entrance
//     - LoginSuccessOverlay  — ring burst + "Access granted"
//     - BrandLockup          — shared logo + name + subtitle (lg size)
//
// Consumed by:
//   - Next.js App Router (renders at /login)
// ============================================================

'use client'

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { LoginBackground } from '@/src/components/login/login-background'
import { LoginCard } from '@/src/components/login/login-card'
import { LOGIN_KEYFRAMES } from '@/src/components/login/login-keyframes'
import { LoginSuccessOverlay, SUCCESS_ANIMATION_MS } from '@/src/components/login/login-success-overlay'
import { BrandLockup } from '@/src/components/ui/brand-lockup'
import { safeNextPath } from '@/src/lib/safe-redirect'

// ==================================================
// CONSTANTS
// ==================================================

const API = ""

// ==================================================
// EMAIL VALIDATION
// ==================================================

function isValidEmail(value: string): boolean {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)
}

// ==================================================
// MICROSOFT ICON
// ==================================================

function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="0"   y="0"   width="7.3" height="7.3" fill="#F25022"/>
      <rect x="8.7" y="0"   width="7.3" height="7.3" fill="#7FBA00"/>
      <rect x="0"   y="8.7" width="7.3" height="7.3" fill="#00A4EF"/>
      <rect x="8.7" y="8.7" width="7.3" height="7.3" fill="#FFB900"/>
    </svg>
  )
}

// ==================================================
// LOGIN PAGE
// ==================================================

type Stage = 'email' | 'code' | 'totp'

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNextPath(params.get('next'), '/dashboard')

  // ------------------------------ Form State --------------------------------
  const [email, setEmail] = useState('')
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ssoLoading, setSsoLoading] = useState(false)

  // ------------------------------ Stage State --------------------------------
  const [stage, setStage] = useState<Stage>('email')
  const [emailAttempted, setEmailAttempted] = useState(false)
  const emailValid = isValidEmail(email)

  // TOTP — partial token issued when requires_2fa=true
  const partialTokenRef = useRef<string | null>(null)

  // ------------------------------ Entrance Animation Timing ------------------
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 100)
    return () => clearTimeout(timer)
  }, [])

  // ------------------------------ Body scroll lock ---------------------------
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // ------------------------------ SSO error from redirect -------------------
  useEffect(() => {
    const ssoError = params.get('sso_error')
    if (!ssoError) return
    const messages: Record<string, string> = {
      access_denied:   'Microsoft sign-in was cancelled or access was denied.',
      state_mismatch:  'Sign-in session expired. Please start again.',
      missing_code:    'Microsoft did not return an authorisation code. Please try again.',
      sso_failed:      'Could not complete Microsoft sign-in. Contact support if this keeps happening.',
    }
    setError(messages[ssoError] ?? 'Microsoft sign-in failed. Please try again.')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------ Stage 1: Request Code ----------------------

  async function requestCode() {
    if (!emailValid) {
      setEmailAttempted(true)
      return
    }
    setEmailAttempted(false)
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/v1/auth/request-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { detail?: string }).detail ?? 'Something went wrong. Try again.')
        return
      }
      setStage('code')
    } catch {
      setError('Could not reach the server. Check your connection.')
    } finally {
      setIsLoading(false)
    }
  }

  // ------------------------------ Stage 2: Verify Code -----------------------

  const verifyCode = useCallback(async function verifyCode(code: string) {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/v1/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({})) as {
        access_token?: string
        account_id?: string
        requires_2fa?: boolean
        detail?: string
      }

      if (!res.ok) {
        setError(data.detail ?? 'Invalid code. Please try again.')
        return
      }

      if (data.requires_2fa) {
        // Partial token — gated to 2FA challenge endpoint only.
        partialTokenRef.current = data.access_token ?? null
        setStage('totp')
        return
      }

      if (data.access_token) {
        sessionStorage.setItem('sva_access', data.access_token)
        if (data.account_id) sessionStorage.setItem('sva_account_id', data.account_id)
      }
      setSuccess(true)
      setTimeout(() => router.push(next), SUCCESS_ANIMATION_MS)
    } catch {
      setError('Could not reach the server. Check your connection.')
    } finally {
      setIsLoading(false)
    }
  }, [email, next, router])

  // ------------------------------ Stage 3: TOTP Verify ----------------------

  const verifyTotp = useCallback(async function verifyTotp(totpCode: string) {
    const partial = partialTokenRef.current
    if (!partial) {
      setError('Session expired. Please sign in again.')
      setStage('email')
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/v1/auth/2fa/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${partial}`,
        },
        body: JSON.stringify({ totp_code: totpCode }),
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({})) as {
        access_token?: string
        account_id?: string
        detail?: string
      }

      if (!res.ok) {
        setError(data.detail ?? 'Incorrect code. Try again.')
        return
      }

      if (data.access_token) {
        sessionStorage.setItem('sva_access', data.access_token)
        if (data.account_id) sessionStorage.setItem('sva_account_id', data.account_id)
      }
      setSuccess(true)
      setTimeout(() => router.push(next), SUCCESS_ANIMATION_MS)
    } catch {
      setError('Could not reach the server. Check your connection.')
    } finally {
      setIsLoading(false)
    }
  }, [next, router])

  // ------------------------------ Microsoft SSO ------------------------------

  function handleMicrosoftSSO() {
    setSsoLoading(true)
    window.location.href = `${API}/api/v1/auth/sso/microsoft/start`
  }

  // ------------------------------ Render ------------------------------------

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--colour-bg)',
        overflow: 'hidden',
      }}
    >
      {/* ── Ambient Background ──────────────────────────────── */}
      <LoginBackground />

      {/* ── Login Card Shell ────────────────────────────────── */}
      <LoginCard disabled={success}>
        {/* ── Success Overlay ──────────────────────────────── */}
        {success && <LoginSuccessOverlay />}

        {/* ── Form Content ─────────────────────────────────── */}
        <div style={{ opacity: success ? 0 : 1, transition: 'opacity 0.3s' }}>
          {/* ~~~~~~~~~ Back to home ~~~~~~~~~ */}
          <div style={{ marginBottom: 20 }}>
            <Link
              href="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                color: 'rgba(255,255,255,0.4)',
                textDecoration: 'none',
                transition: 'color 0.25s, transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                transformOrigin: 'left center',
                padding: '6px 8px',
                margin: '-6px -8px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#00d4ff'
                e.currentTarget.style.transform = 'scale(1.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
                e.currentTarget.style.transform = 'scale(1)'
              }}
            >
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M8 6H4M4 6L6.5 3.5M4 6L6.5 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Home
            </Link>
          </div>

          {/* ~~~~~~~~~ Logo + Branding ~~~~~~~~~ */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: 24,
              opacity: mounted ? 1 : 0,
              transform: mounted ? 'scale(1) translateY(0)' : 'scale(0.9) translateY(16px)',
              transition:
                'opacity 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.3s, transform 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.3s',
            }}
          >
            <BrandLockup subtitle="Auto" size="lg" />
          </div>

          {/* ~~~~~~~~~ Microsoft SSO ~~~~~~~~~ */}
          {stage === 'email' && (
            <>
              <div style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={handleMicrosoftSSO}
                  disabled={ssoLoading}
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    borderRadius: 10,
                    border: '0.5px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    color: 'var(--colour-text)',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    cursor: ssoLoading ? 'default' : 'pointer',
                    opacity: ssoLoading ? 0.6 : 1,
                    transition: 'border-color 0.2s, background 0.2s, transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                  }}
                  onMouseEnter={(e) => {
                    if (!ssoLoading) {
                      e.currentTarget.style.borderColor = 'rgba(108,99,255,0.35)'
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                    e.currentTarget.style.transform = ''
                  }}
                >
                  <MicrosoftIcon />
                  <span>{ssoLoading ? 'Redirecting...' : 'Sign in with Microsoft'}</span>
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 12px' }}>
                <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>or</span>
                <div style={{ flex: 1, height: '0.5px', background: 'rgba(255,255,255,0.06)' }} />
              </div>
            </>
          )}

          {/* ~~~~~~~~~ Stage 1: Email ~~~~~~~~~ */}
          {stage === 'email' && (
            <EmailStage
              email={email}
              emailValid={emailValid}
              emailAttempted={emailAttempted}
              mounted={mounted}
              isLoading={isLoading}
              error={error}
              onChange={(val) => { setEmail(val); setEmailAttempted(false) }}
              onAdvance={requestCode}
            />
          )}

          {/* ~~~~~~~~~ Stage 2: Code ~~~~~~~~~ */}
          {stage === 'code' && (
            <CodeStage
              email={email}
              isLoading={isLoading}
              error={error}
              onVerify={verifyCode}
              onGoBack={() => { setStage('email'); setError(null) }}
            />
          )}

          {/* ~~~~~~~~~ Stage 3: TOTP ~~~~~~~~~ */}
          {stage === 'totp' && (
            <TotpStage
              isLoading={isLoading}
              error={error}
              onVerify={verifyTotp}
            />
          )}

          {/* ── Footer link ─────────────────────────────────── */}
          {stage === 'email' && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginTop: 20,
                paddingTop: 16,
                borderTop: '0.5px solid rgba(255,255,255,0.06)',
              }}
            >
              <a
                href="/register"
                style={{
                  fontSize: 12,
                  color: 'rgba(255,255,255,0.3)',
                  textDecoration: 'none',
                  display: 'inline-block',
                  transition: 'color 0.25s, transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                  padding: '8px 12px',
                  margin: '-8px -12px',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#00d4ff'; e.currentTarget.style.transform = 'scale(1.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.transform = 'scale(1)' }}
              >
                No account? Create one
              </a>
            </div>
          )}
        </div>
      </LoginCard>

      {/* ── Keyframe Animations ─────────────────────────────── */}
      <style>{LOGIN_KEYFRAMES}</style>
      <style>{`html, body { overflow: hidden !important; }`}</style>
    </div>
  )
}

// ==================================================
// EMAIL STAGE (INTERNAL)
// ==================================================

interface EmailStageProps {
  email: string
  emailValid: boolean
  emailAttempted: boolean
  mounted: boolean
  isLoading: boolean
  error: string | null
  onChange: (value: string) => void
  onAdvance: () => void
}

function EmailStage({
  email,
  emailValid,
  emailAttempted,
  mounted,
  isLoading,
  error,
  onChange,
  onAdvance,
}: EmailStageProps) {
  const [focused, setFocused] = useState(false)
  const [arrowHovered, setArrowHovered] = useState(false)
  const pulseRingRef = useRef<HTMLDivElement>(null)

  function fireKeystrokePulse() {
    const ring = pulseRingRef.current
    if (!ring) return
    const dot = document.createElement('div')
    const colors = ['#6c63ff', '#7b73ff', '#5548e0', '#00d4ff']
    const color = colors[Math.floor(Math.random() * colors.length)] ?? '#6c63ff'
    dot.style.cssText = `position:absolute;height:100%;width:20px;border-radius:1px;background:${color};left:${Math.random() * 80 + 10}%;animation:keystrokePulse 0.5s ease-out forwards`
    ring.appendChild(dot)
    setTimeout(() => dot.remove(), 500)
  }

  return (
    <div
      style={{
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity 0.5s ease-out 0.7s, transform 0.5s ease-out 0.7s',
      }}
    >
      <label
        style={{
          display: 'block',
          fontSize: 11,
          letterSpacing: '0.5px',
          textTransform: 'uppercase' as const,
          textAlign: 'center',
          color: focused ? '#6c63ff' : 'var(--colour-text-muted)',
          marginBottom: 8,
          transition: 'color 0.3s',
        }}
      >
        Email address
      </label>

      <div className="sov-input-wrap">
        <input
          type="email"
          value={email}
          onChange={(e) => { onChange(e.target.value); fireKeystrokePulse() }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && emailValid) {
              e.preventDefault()
              onAdvance()
            }
          }}
          placeholder="name@example.com"
          autoComplete="email"
          autoFocus
          disabled={isLoading}
          style={{
            width: '100%',
            padding: '14px 48px 14px 16px',
            borderRadius: 12,
            border: `0.5px solid ${focused ? 'rgba(108,99,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
            background: focused ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
            color: 'var(--colour-text)',
            fontSize: 15,
            fontFamily: 'inherit',
            outline: 'none',
            boxSizing: 'border-box' as const,
            boxShadow: focused
              ? '0 0 0 3px rgba(108,99,255,0.1), 0 0 20px rgba(108,99,255,0.06)'
              : 'none',
            transition: 'border-color 0.3s, box-shadow 0.3s, background 0.3s',
          }}
        />

        <div ref={pulseRingRef} aria-hidden="true" style={{ position: 'absolute', bottom: -2, left: 12, right: 12, height: 2, borderRadius: 1, overflow: 'hidden' }} />

        <div
          onClick={isLoading ? undefined : onAdvance}
          role={emailValid ? 'button' : undefined}
          tabIndex={emailValid ? 0 : -1}
          onKeyDown={(e) => { if (e.key === 'Enter') onAdvance() }}
          onMouseEnter={() => setArrowHovered(true)}
          onMouseLeave={() => setArrowHovered(false)}
          style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: emailValid
              ? arrowHovered ? 'translateY(-50%) scale(1.25)' : 'translateY(-50%) scale(1)'
              : 'translateY(-50%) scale(0)',
            opacity: emailValid ? (isLoading ? 0.4 : 1) : 0,
            cursor: emailValid && !isLoading ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: emailValid && !arrowHovered && !isLoading ? 'arrowPulse 2s ease-in-out infinite' : 'none',
            transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s',
          }}
        >
          {isLoading ? (
            <div style={{ width: 14, height: 14, border: '2px solid rgba(108,99,255,0.3)', borderTopColor: '#6c63ff', borderRadius: '50%', animation: 'loginSpin 0.6s linear infinite' }} />
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke={arrowHovered ? '#00d4ff' : '#6c63ff'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" style={{ fontSize: 12, color: 'var(--colour-error, #ff6b6b)', textAlign: 'center', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,107,107,0.08)', marginTop: 10 }}>
          {error}
        </div>
      )}

      <div style={{ fontSize: 11, color: emailAttempted && !emailValid ? 'var(--colour-error, #ff6b6b)' : 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 12, transition: 'color 0.3s' }}>
        {emailAttempted && !emailValid ? 'Enter a valid email address' : 'Press Enter or the arrow to continue'}
      </div>

      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center', lineHeight: 1.6, marginTop: 12, marginBottom: 0 }}>
        By signing in you agree to the{' '}
        <a href="/legal/terms" style={{ color: 'rgba(108,99,255,0.7)', textDecoration: 'none', transition: 'color 0.2s', display: 'inline-block', padding: '4px 3px', margin: '-4px -3px' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#00d4ff' }} onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(108,99,255,0.7)' }}>Terms of Service</a>{' '}
        and acknowledge the{' '}
        <a href="/legal/privacy" style={{ color: 'rgba(108,99,255,0.7)', textDecoration: 'none', transition: 'color 0.2s', display: 'inline-block', padding: '4px 3px', margin: '-4px -3px' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#00d4ff' }} onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(108,99,255,0.7)' }}>Privacy Policy</a>.
      </p>
    </div>
  )
}

// ==================================================
// CODE STAGE (INTERNAL)
// ==================================================

interface CodeStageProps {
  email: string
  isLoading: boolean
  error: string | null
  onVerify: (code: string) => void
  onGoBack: () => void
}

function CodeStage({ email, isLoading, error, onVerify, onGoBack }: CodeStageProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null, null, null])

  useEffect(() => {
    inputRefs.current[0]?.focus()
  }, [])

  // Auto-submit when all six digits are present.
  useEffect(() => {
    const full = digits.join('')
    if (full.length === 6 && digits.every(d => /^\d$/.test(d))) {
      onVerify(full)
    }
  }, [digits, onVerify])

  function handleDigitInput(index: number, value: string) {
    const sanitised = value.replace(/\D/g, '')

    // Handle paste of a full code into the first box.
    if (sanitised.length > 1) {
      const chars = sanitised.slice(0, 6).split('')
      const next = [...digits]
      chars.forEach((c, i) => { next[i] = c })
      setDigits(next)
      inputRefs.current[Math.min(chars.length - 1, 5)]?.focus()
      return
    }

    const next = [...digits]
    next[index] = sanitised.slice(-1)
    setDigits(next)

    if (sanitised && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits]
      next[index - 1] = ''
      setDigits(next)
      inputRefs.current[index - 1]?.focus()
    }
  }

  const digitBoxStyle = (i: number): React.CSSProperties => {
    const isFocused = focusedIndex === i
    const hasFill = Boolean(digits[i])
    return {
      width: 44,
      height: 54,
      borderRadius: 10,
      border: `1px solid ${isFocused ? 'rgba(108,99,255,0.9)' : hasFill ? 'rgba(108,99,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
      background: isFocused ? 'rgba(108,99,255,0.14)' : hasFill ? 'rgba(108,99,255,0.08)' : 'rgba(255,255,255,0.04)',
      boxShadow: isFocused ? '0 0 0 3px rgba(108,99,255,0.18)' : 'none',
      color: '#ffffff',
      fontSize: 22,
      fontWeight: 500,
      textAlign: 'center',
      outline: 'none',
      fontFamily: 'inherit',
      transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
      caretColor: isFocused ? '#6c63ff' : 'transparent',
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ padding: '6px 14px', borderRadius: 20, background: 'rgba(108,99,255,0.12)', color: '#6c63ff', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 8, animation: 'pillIn 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
          <span>{email}</span>
          <span
            onClick={onGoBack}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') onGoBack() }}
            aria-label="Change email"
            style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 10, transition: 'color 0.2s, transform 0.2s' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ff6b6b'; e.currentTarget.style.transform = 'scale(1.2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; e.currentTarget.style.transform = 'scale(1)' }}
          >
            ✕
          </span>
        </div>
      </div>

      <p style={{ fontSize: 13, color: 'var(--colour-text-muted)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
        We sent a six-digit code to your email. Enter it below.
      </p>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={el => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={digit}
            onChange={(e) => handleDigitInput(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onFocus={() => setFocusedIndex(i)}
            onBlur={() => setFocusedIndex(null)}
            disabled={isLoading}
            style={digitBoxStyle(i)}
          />
        ))}
      </div>

      {error && (
        <div role="alert" style={{ fontSize: 12, color: 'var(--colour-error, #ff6b6b)', textAlign: 'center', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,107,107,0.08)' }}>
          {error}
        </div>
      )}

      {isLoading && (
        <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Verifying...</div>
      )}

      <div style={{ textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => { onGoBack() }}
          style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'color 0.25s' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#00d4ff' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
        >
          Resend code
        </button>
      </div>
    </div>
  )
}

// ==================================================
// TOTP STAGE (INTERNAL)
// ==================================================

interface TotpStageProps {
  isLoading: boolean
  error: string | null
  onVerify: (code: string) => void
}

function TotpStage({ isLoading, error, onVerify }: TotpStageProps) {
  const [code, setCode] = useState('')
  const [focused, setFocused] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (code.length === 6) onVerify(code)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 13, color: 'var(--colour-text-muted)', textAlign: 'center', margin: 0 }}>
        Enter the six-digit code from your authenticator app.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="sov-input-wrap">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoFocus
            placeholder="000000"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: 12,
              border: `0.5px solid ${focused ? 'rgba(108,99,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
              background: focused ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
              color: 'var(--colour-text)',
              fontSize: 22,
              letterSpacing: 6,
              fontFamily: 'inherit',
              outline: 'none',
              textAlign: 'center',
              boxSizing: 'border-box' as const,
              transition: 'border-color 0.3s, background 0.3s',
            }}
          />
        </div>
        {error && (
          <div role="alert" style={{ fontSize: 12, color: 'var(--colour-error, #ff6b6b)', textAlign: 'center', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,107,107,0.08)' }}>
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={isLoading || code.length < 6}
          style={{
            width: '100%',
            padding: 14,
            borderRadius: 12,
            border: 'none',
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
            fontFamily: 'inherit',
            cursor: code.length === 6 && !isLoading ? 'pointer' : 'default',
            opacity: code.length < 6 ? 0.4 : 1,
            animation: code.length === 6 ? 'loginGradShift 3s ease-in-out infinite' : 'none',
            background: 'linear-gradient(135deg, #6c63ff, #5548e0)',
            transition: 'opacity 0.3s',
          }}
        >
          {isLoading ? 'Verifying...' : 'Verify'}
        </button>
      </form>
    </div>
  )
}
