// ============================================================
// frontend/web/app/(auth)/reset/page.tsx
// ============================================================
//
// Purpose:
//   Informational page for users who clicked a link expecting
//   a password-reset flow. SovCorE Auto is passwordless — there
//   is no password to reset. This page explains the sign-in
//   process and provides a direct link to /login.
//
// Design:
//   Static AuthCard — no form. Mirrors the QR reset layout
//   (AuthCard with subline and foot). No client-side logic
//   required so no 'use client' directive.
//
// Consumed by:
//   - Next.js App Router (renders at /reset)

import Link from 'next/link'

import { AuthCard } from '@/src/components/auth/auth-card'
import { Button } from '@/src/components/ui/button'

// ==================================================
// PAGE
// ==================================================

export default function ResetPage() {
  return (
    <AuthCard
      title="No password needed"
      subline="SovCorE Auto uses passwordless sign-in. Instead of a password, we send a six-digit code to your email each time you sign in."
      foot={<Link href="/forgot">Can't get in?</Link>}
    >
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--colour-text-muted)', lineHeight: 'var(--leading-normal)' }}>
        To sign in, enter your email on the sign-in page and we will send you a fresh code. The code is valid for 10 minutes.
      </p>
      <Link href="/login" style={{ textDecoration: 'none' }}>
        <Button size="lg">Go to sign in</Button>
      </Link>
    </AuthCard>
  )
}
