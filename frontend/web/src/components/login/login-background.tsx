// ============================================================
// frontend/web/src/components/login/login-background.tsx
// ============================================================
//
// Purpose:
//   Ambient background layer for the login page. Renders the
//   purple and cyan gradient orbs, floating particle dots, and
//   fading gradient lines that create depth behind the card.
//
// Design:
//   Pure presentational component — no state, no logic.
//   Reads particle and line data from login-background-data.ts.
//   All elements use CSS animations defined in login-keyframes.ts.
//
//   Positioned absolutely behind the login card (z-index: 0).
//   The card sits at z-index: 2 so it renders above this layer.
//
//   8 particles and 4 lines create enough atmosphere without
//   being distracting. The login is a focused form — the
//   background adds depth, not noise.
//
// Consumed by:
//   - app/(auth)/login/page.tsx
// ============================================================

import { LINES, PARTICLES } from '@/src/components/login/login-background-data'

// ==================================================
// LOGIN BACKGROUND COMPONENT
// ==================================================

export function LoginBackground() {
  return (
    <>
      {/* ~~~~~~~~~ Gradient orbs ~~~~~~~~~ */}

      {/* Top-left purple orb */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 500,
          height: 500,
          borderRadius: '50%',
          top: -150,
          left: -100,
          background: 'radial-gradient(circle, rgba(108,99,255,0.08) 0%, transparent 70%)',
          animation: 'loginGlow1 8s ease-in-out infinite alternate',
        }}
      />

      {/* Bottom-right cyan orb */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          width: 400,
          height: 400,
          borderRadius: '50%',
          bottom: -100,
          right: -80,
          background: 'radial-gradient(circle, rgba(0,212,255,0.06) 0%, transparent 70%)',
          animation: 'loginGlow2 10s ease-in-out infinite alternate',
        }}
      />

      {/* ~~~~~~~~~ Floating particles ~~~~~~~~~ */}
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            position: 'absolute',
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: p.color,
            top: p.top,
            left: p.left,
            right: p.right,
            bottom: p.bottom,
            animation: `${p.animation} ${p.duration}s ease-in-out infinite${p.reverse ? ' reverse' : ''}`,
          }}
        />
      ))}

      {/* ~~~~~~~~~ Fading gradient lines ~~~~~~~~~ */}
      {LINES.map((l, i) => (
        <div
          key={`line-${i}`}
          aria-hidden="true"
          style={{
            position: 'absolute',
            height: '0.5px',
            background: l.background,
            top: l.top,
            left: l.left,
            right: l.right,
            bottom: l.bottom,
            width: l.width,
            animation: `loginLineFade ${l.duration}s ease-in-out infinite ${l.delay}s`,
          }}
        />
      ))}
    </>
  )
}
