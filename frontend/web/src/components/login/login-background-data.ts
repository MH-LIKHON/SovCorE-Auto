// ============================================================
// frontend/web/src/components/login/login-background-data.ts
// ============================================================
//
// Purpose:
//   Static data arrays for the login page background elements.
//   Defines floating particle positions, sizes, colours, and
//   animation timings. Also defines the fading gradient lines.
//
// Design:
//   Separated from the page component to keep the JSX clean.
//   These arrays are static — no runtime computation needed.
//   Each particle has a unique combination of size, colour,
//   position, animation, and speed to create organic movement.
//
//   8 particles and 4 lines create enough atmosphere without
//   being distracting. The login page is a focused form — the
//   background adds depth, not noise.
//
// Consumed by:
//   - src/components/login/login-background.tsx

// ==================================================
// PARTICLE DATA
// ==================================================

export interface Particle {
  size: number
  color: string
  top?: string
  left?: string
  right?: string
  bottom?: string
  animation: string
  duration: number
  reverse: boolean
}

export const PARTICLES: readonly Particle[] = [
  {
    size: 6,
    color: 'rgba(108,99,255,0.3)',
    top: '18%',
    left: '12%',
    animation: 'loginFloat1',
    duration: 6,
    reverse: false,
  },
  {
    size: 4,
    color: 'rgba(0,212,255,0.25)',
    top: '72%',
    left: '22%',
    animation: 'loginFloat2',
    duration: 8,
    reverse: false,
  },
  {
    size: 5,
    color: 'rgba(108,99,255,0.2)',
    top: '28%',
    right: '18%',
    animation: 'loginFloat3',
    duration: 7,
    reverse: false,
  },
  {
    size: 3,
    color: 'rgba(0,212,255,0.3)',
    top: '62%',
    right: '12%',
    animation: 'loginFloat1',
    duration: 9,
    reverse: true,
  },
  {
    size: 5,
    color: 'rgba(108,99,255,0.15)',
    left: '38%',
    bottom: '22%',
    animation: 'loginFloat2',
    duration: 7,
    reverse: true,
  },
  {
    size: 4,
    color: 'rgba(0,212,255,0.2)',
    top: '12%',
    right: '32%',
    animation: 'loginFloat3',
    duration: 6,
    reverse: false,
  },
  {
    size: 3,
    color: 'rgba(108,99,255,0.25)',
    top: '45%',
    left: '8%',
    animation: 'loginDotDrift',
    duration: 5,
    reverse: false,
  },
  {
    size: 4,
    color: 'rgba(0,212,255,0.15)',
    right: '25%',
    bottom: '15%',
    animation: 'loginDotDrift',
    duration: 7,
    reverse: false,
  },
] as const

// ==================================================
// GRADIENT LINE DATA
// ==================================================

export interface GradientLine {
  top?: string
  left?: string
  right?: string
  bottom?: string
  width: number
  background: string
  duration: number
  delay: number
}

export const LINES: readonly GradientLine[] = [
  {
    top: '25%',
    left: '5%',
    width: 80,
    background: 'linear-gradient(90deg, transparent, rgba(108,99,255,0.4), transparent)',
    duration: 4,
    delay: 0,
  },
  {
    right: '8%',
    bottom: '30%',
    width: 60,
    background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.3), transparent)',
    duration: 5,
    delay: 1,
  },
  {
    top: '65%',
    left: '10%',
    width: 50,
    background: 'linear-gradient(90deg, transparent, rgba(108,99,255,0.3), transparent)',
    duration: 6,
    delay: 2,
  },
  {
    top: '40%',
    right: '15%',
    width: 70,
    background: 'linear-gradient(90deg, transparent, rgba(0,212,255,0.25), transparent)',
    duration: 5.5,
    delay: 0.5,
  },
] as const
