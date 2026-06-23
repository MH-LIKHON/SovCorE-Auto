// ============================================================
// frontend/web/src/components/login/login-success-overlay.tsx
// ============================================================
//
// Purpose:
//   Success animation shown after successful authentication.
//   Replaces the login form with a ring burst effect, the
//   SovCorE logo bouncing into the centre, "Access granted"
//   text, and a progress bar filling before redirect.
//
// Design:
//   Ring burst sequence (all CSS keyframes, no JS timers):
//     0.0s — Two gradient rings start expanding (purple, cyan)
//     0.4s — Logo bounces into centre with spring easing
//     0.7s — "Access granted" fades up
//     0.9s — "Signing you in" fades up
//     1.0s — Progress bar track appears
//     1.1s — Progress bar fills over 2 seconds
//     3.1s — Animation complete
//
//   The total animation duration is exported as SUCCESS_ANIMATION_MS
//   so the login page can use the same value for its redirect delay.
//   This prevents the magic number problem where the animation and
//   redirect timings could drift out of sync.
//
// Consumed by:
//   - app/(auth)/login/page.tsx

import { Logo } from '@/src/components/ui/logo'

// ==================================================
// ANIMATION TIMING
// ==================================================

// ------------------------------ Total Duration -------------------------------
// Exported so the login page can delay its redirect by exactly
// this amount. The bar starts at 1.1s and fills over 2s = 3.1s total.
// We round to 3200ms for a clean pause after the bar completes.

export const SUCCESS_ANIMATION_MS = 3200

// ==================================================
// SUCCESS OVERLAY
// ==================================================

export function LoginSuccessOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        background: 'rgba(10,10,18,0.92)',
        borderRadius: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
      }}
    >
      {/* ── Ring Burst Container ──────────────────────────────── */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          border: '2px solid rgba(108,99,255,0.15)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
        }}
      >
        {/* Outer ring hints — static decorative rings */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: -8,
            borderRadius: '50%',
            border: '1px solid rgba(108,99,255,0.08)',
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: -16,
            borderRadius: '50%',
            border: '1px solid rgba(0,212,255,0.05)',
          }}
        />

        {/* Expanding ring — purple */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: '#6c63ff',
            animation: 'successRing 1.4s cubic-bezier(0.4,0,0.2,1) forwards',
          }}
        />

        {/* Expanding ring — cyan (staggered 200ms) */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: '#00d4ff',
            animation: 'successRing 1.4s cubic-bezier(0.4,0,0.2,1) 0.2s forwards',
          }}
        />

        {/* Logo at centre — bounces in after rings start */}
        <div
          style={{
            opacity: 0,
            animation: 'successLogoIn 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.4s forwards',
          }}
        >
          <Logo size={44} />
        </div>
      </div>

      {/* ── Title ─────────────────────────────────────────────── */}
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: '-0.3px',
          opacity: 0,
          animation: 'successTextUp 0.5s ease-out 0.7s forwards',
        }}
      >
        Access granted
      </div>

      {/* ── Subtitle ──────────────────────────────────────────── */}
      <div
        style={{
          fontSize: 12,
          color: 'var(--colour-text-muted)',
          marginTop: 6,
          opacity: 0,
          animation: 'successTextUp 0.5s ease-out 0.9s forwards',
        }}
      >
        Signing you in
      </div>

      {/* ── Progress Bar ──────────────────────────────────────── */}
      <div
        style={{
          width: 140,
          height: 2,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.06)',
          marginTop: 24,
          overflow: 'hidden',
          opacity: 0,
          animation: 'successTextUp 0.3s ease-out 1s forwards',
        }}
      >
        {/* Fill — purple to cyan gradient, grows left to right */}
        <div
          style={{
            height: '100%',
            background: 'linear-gradient(90deg, #6c63ff, #00d4ff)',
            transformOrigin: 'left',
            transform: 'scaleX(0)',
            animation: 'successBarGrow 2s ease-out 1.1s forwards',
          }}
        />
      </div>

      {/* ── Keyframe Animations ───────────────────────────────── */}
      <style>{`
        @keyframes successRing {
          0% { transform: scale(0); opacity: 1; }
          50% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        @keyframes successLogoIn {
          0% { transform: scale(0.3) rotate(-20deg); opacity: 0; }
          50% { transform: scale(1.1) rotate(3deg); }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes successTextUp {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes successBarGrow {
          0% { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
      `}</style>
    </div>
  )
}
