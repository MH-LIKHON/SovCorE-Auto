// ============================================================
// frontend/web/src/components/login/login-keyframes.ts
// ============================================================
//
// Purpose:
//   CSS keyframe animation strings used by the login page.
//   Extracted into a standalone file so the page component
//   stays focused on form logic, not animation definitions.
//
// Design:
//   Each constant is a raw CSS string injected via <style> tag.
//   Grouped by concern:
//     - Background: orb drift, particle float, line fade
//     - Card: shimmer sweep, spinner rotation
//     - Staged flow: arrow pulse, pill entrance, gradient shift,
//       password keystroke pulse, button materialise
//
//   Keyframes are defined once and referenced by animation name
//   in the components that use them. No duplication.
//
// Consumed by:
//   - src/components/login/login-background.tsx  (orb, float, drift, line)
//   - app/(auth)/login/page.tsx                  (injects all via <style>)

// ==================================================
// LOGIN KEYFRAME DEFINITIONS
// ==================================================

// ------------------------------ Background Keyframes ------------------------
// Ambient orbs, floating particles, and fading gradient lines.

const backgroundKeyframes = `
  @keyframes loginGlow1 {
    0% { transform: translate(0,0) scale(1); opacity: 0.6; }
    100% { transform: translate(40px,30px) scale(1.15); opacity: 1; }
  }

  @keyframes loginGlow2 {
    0% { transform: translate(0,0) scale(1); opacity: 0.5; }
    100% { transform: translate(-30px,-20px) scale(1.1); opacity: 0.9; }
  }

  @keyframes loginFloat1 {
    0%, 100% { transform: translateY(0) translateX(0); }
    50% { transform: translateY(-20px) translateX(10px); }
  }

  @keyframes loginFloat2 {
    0%, 100% { transform: translateY(0) translateX(0); }
    50% { transform: translateY(15px) translateX(-12px); }
  }

  @keyframes loginFloat3 {
    0%, 100% { transform: translateY(0) translateX(0); }
    50% { transform: translateY(-12px) translateX(-8px); }
  }

  @keyframes loginDotDrift {
    0%, 100% { opacity: 0.15; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(1.3); }
  }

  @keyframes loginLineFade {
    0%, 100% { opacity: 0.03; }
    50% { opacity: 0.12; }
  }
`

// ------------------------------ Card Keyframes ------------------------------
// Button shimmer sweep, loading spinner, and gradient shift.

const cardKeyframes = `
  @keyframes loginShimmer {
    0% { left: -100%; }
    100% { left: 100%; }
  }

  @keyframes loginSpin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes loginGradShift {
    0%, 100% { background: linear-gradient(135deg, #6c63ff, #5548e0); }
    50% { background: linear-gradient(135deg, #5548e0, #3d8bff); }
  }
`

// ------------------------------ Staged Flow Keyframes -----------------------
// Arrow pulse, email pill entrance, password keystroke pulse,
// and stage transition animations.

const stagedKeyframes = `
  @keyframes arrowPulse {
    0%, 100% {
      filter: drop-shadow(0 0 4px rgba(108,99,255,0.3));
      opacity: 0.7;
    }
    50% {
      filter: drop-shadow(0 0 12px rgba(108,99,255,0.7)) drop-shadow(0 0 20px rgba(0,212,255,0.3));
      opacity: 1;
    }
  }

  @keyframes pillIn {
    0% { transform: scale(0.5); opacity: 0; }
    100% { transform: scale(1); opacity: 1; }
  }

  @keyframes keystrokePulse {
    0% { opacity: 0; transform: scale(0.5); }
    50% { opacity: 1; }
    100% { opacity: 0; transform: scale(1); }
  }
`

// ==================================================
// COMBINED EXPORT
// ==================================================

// ------------------------------ All Keyframes -------------------------------
// Single string injected once via <style> in the page shell.

export const LOGIN_KEYFRAMES = backgroundKeyframes + cardKeyframes + stagedKeyframes
