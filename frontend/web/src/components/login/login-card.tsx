// ============================================================
// frontend/web/src/components/login/login-card.tsx
// ============================================================
//
// Purpose:
//   Glass-morphism card shell for the login page. Handles the
//   3D perspective tilt on mouse move, cursor shimmer effect,
//   top gradient glow line, and entrance animation.
//
// Design:
//   This component owns the card's visual behaviour only.
//   It does NOT contain form logic, input fields, or submit
//   handlers — those live in the login page itself.
//
//   Interaction effects:
//     - 3D tilt following cursor (2.5 degrees max)
//     - Radial purple shimmer tracks cursor position
//     - Box shadow shifts with tilt for depth
//     - Gradient glow line at top edge
//     - Entrance: slides up from below with rotation + scale
//
//   Children are rendered inside the card — the page passes
//   the form, logo, and success overlay as children.
//
// Consumed by:
//   - app/(auth)/login/page.tsx
// ============================================================

'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

// ==================================================
// LOGIN CARD COMPONENT
// ==================================================

interface LoginCardProps {
  children: ReactNode
  disabled?: boolean // Disables tilt + shimmer (used during success animation)
}

export function LoginCard({ children, disabled = false }: LoginCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const shimmerRef = useRef<HTMLDivElement>(null)

  // ------------------------------ Entrance Animation -------------------------
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 100)
    return () => clearTimeout(timer)
  }, [])

  // ------------------------------ Reset On Disable ----------------------------
  // When success animation starts, snap the card back to neutral
  // and hide the shimmer so the overlay renders cleanly.

  useEffect(() => {
    if (!disabled) return
    const card = cardRef.current
    const shimmer = shimmerRef.current

    if (card) {
      card.style.transition = 'transform 0.4s ease-out, box-shadow 0.4s ease-out'
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)'
      card.style.boxShadow = '0 20px 60px rgba(0,0,0,0.3)'
    }
    if (shimmer) {
      shimmer.style.opacity = '0'
    }
  }, [disabled])

  // ------------------------------ 3D Tilt Handlers --------------------------

  function handleMouseMove(e: React.MouseEvent) {
    if (disabled) return
    const card = cardRef.current
    const shimmer = shimmerRef.current
    if (!card) return

    const rect = card.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const dx = (x - rect.width / 2) / (rect.width / 2)
    const dy = (y - rect.height / 2) / (rect.height / 2)

    // ~~~~~~~~~ Apply Tilt + Shadow ~~~~~~~~~
    card.style.transform = `perspective(1000px) rotateX(${-dy * 2.5}deg) rotateY(${dx * 2.5}deg)`
    card.style.boxShadow = `0 ${Math.round(20 + dy * 8)}px ${Math.round(60 + dy * 15)}px rgba(0,0,0,0.35), 0 0 ${Math.round(30 + Math.abs(dx) * 15)}px rgba(108,99,255,${(0.06 + Math.abs(dx) * 0.06).toFixed(2)})`

    // ~~~~~~~~~ Track Shimmer to Cursor ~~~~~~~~~
    if (shimmer) {
      shimmer.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(108,99,255,0.06) 0%, transparent 50%)`
      shimmer.style.opacity = '1'
    }
  }

  function handleMouseLeave() {
    if (disabled) return
    const card = cardRef.current
    const shimmer = shimmerRef.current
    if (!card) return

    // ~~~~~~~~~ Reset to Neutral ~~~~~~~~~
    card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)'
    card.style.boxShadow = '0 20px 60px rgba(0,0,0,0.3), 0 0 30px rgba(108,99,255,0.06)'
    card.style.transition = 'transform 0.6s cubic-bezier(0.4,0,0.2,1), box-shadow 0.6s'

    if (shimmer) shimmer.style.opacity = '0'

    // Re-enable instant tracking after spring-back completes
    setTimeout(() => {
      if (card) card.style.transition = ''
    }, 600)
  }

  function handleMouseEnter() {
    if (disabled) return
    const card = cardRef.current
    if (card) card.style.transition = 'none'
  }

  // ------------------------------ Render ------------------------------------

  return (
    <div
      ref={cardRef}
      className="login-card-root"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseEnter={handleMouseEnter}
      style={{
        position: 'relative',
        zIndex: 2,
        width: 420,
        borderRadius: 20,
        padding: '36px 40px',
        background: 'rgba(10,10,18,0.85)',
        border: '0.5px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
        transformStyle: 'preserve-3d' as const,
        // Entrance animation
        opacity: mounted ? 1 : 0,
        transform: mounted
          ? 'perspective(1000px) translateY(0) rotateX(0) scale(1)'
          : 'perspective(1000px) translateY(30px) rotateX(4deg) scale(0.96)',
        transition:
          'opacity 0.8s cubic-bezier(0.16,1,0.3,1), transform 0.8s cubic-bezier(0.16,1,0.3,1)',
      }}
    >
      {/* ~~~~~~~~~ Gradient glow line (top edge) ~~~~~~~~~ */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -1,
          left: 0,
          right: 0,
          height: 1,
          background:
            'linear-gradient(90deg, transparent, rgba(108,99,255,0.5), rgba(0,212,255,0.3), transparent)',
          borderRadius: '20px 20px 0 0',
          opacity: mounted ? 1 : 0,
          transition: 'opacity 0.5s ease-out 0.9s',
        }}
      />

      {/* ~~~~~~~~~ Cursor shimmer overlay ~~~~~~~~~ */}
      <div
        ref={shimmerRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 20,
          pointerEvents: 'none',
          opacity: 0,
          transition: 'opacity 0.3s',
        }}
      />

      {/* ~~~~~~~~~ Card content ~~~~~~~~~ */}
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>

      {/* ~~~~~~~~~ Responsive breakpoints ~~~~~~~~~ */}
      <style>{`
        .login-card-root {
          width: 420px !important;
          padding: 36px 40px !important;
        }
        @media (max-width: 1023px) {
          .login-card-root {
            width: 400px !important;
            padding: 32px 36px !important;
          }
        }
        @media (max-width: 767px) {
          .login-card-root {
            width: calc(100vw - 48px) !important;
            padding: 28px 28px !important;
            border-radius: 16px !important;
          }
        }
        @media (max-width: 479px) {
          .login-card-root {
            width: calc(100vw - 32px) !important;
            padding: 24px 20px !important;
            border-radius: 14px !important;
          }
        }
      `}</style>
    </div>
  )
}
