// ============================================================
// frontend/web/src/components/ui/logo.tsx
// ============================================================
//
// Purpose:
//   The SovCorE logo mark: a 3D isometric cube with a metallic
//   V shape and a chrome S on the top surface. Single source
//   of truth for the logo mark across this application.
//
// Origin:
//   Copied verbatim from SovCorE QR src/components/ui/logo.tsx,
//   which mirrors the upstream SovCorE platform packages/ui logo.
//   Do not edit without updating the platform source.
//
// Design:
//   Inline SVG scales cleanly at any size. The viewBox is fixed
//   at 160x180; the size prop controls rendered width. The
//   component auto-simplifies below 50px, dropping subtle
//   highlights and shadow layers that become invisible at
//   small sizes.
//
// Consumed by:
//   - src/components/ui/brand-lockup.tsx (36px in navbar)
//   - app/(public)/page.tsx (80px in hero)
// ============================================================

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 36, className }: LogoProps) {
  // At small sizes, drop subtle effects that become invisible.
  const detailed = size >= 50;

  // Height scales from the 160:180 viewBox ratio.
  const height = Math.round(size * (180 / 160));

  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 160 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="SovCorE logo"
      role="img"
    >
      <defs>
        <linearGradient id="logo-face-left" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#9b6cff" />
          <stop offset="25%" stopColor="#7b5cef" />
          <stop offset="55%" stopColor="#5a3cc8" />
          <stop offset="100%" stopColor="#2a1878" />
        </linearGradient>

        <linearGradient id="logo-face-right" x1="0.6" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#00c8f0" />
          <stop offset="25%" stopColor="#0098cc" />
          <stop offset="60%" stopColor="#0070a8" />
          <stop offset="100%" stopColor="#004068" />
        </linearGradient>

        <linearGradient id="logo-face-top" x1="0" y1="0" x2="1" y2="0.5">
          <stop offset="0%" stopColor="#8870ff" />
          <stop offset="30%" stopColor="#6060e8" />
          <stop offset="60%" stopColor="#3088cc" />
          <stop offset="100%" stopColor="#00b0e0" />
        </linearGradient>

        <linearGradient id="logo-hl-left" x1="0.3" y1="0" x2="0" y2="0.6">
          <stop offset="0%" stopColor="rgba(180,160,255,0.3)" />
          <stop offset="100%" stopColor="rgba(180,160,255,0)" />
        </linearGradient>

        <linearGradient id="logo-hl-right" x1="0.7" y1="0.2" x2="1" y2="0.8">
          <stop offset="0%" stopColor="rgba(100,220,255,0.25)" />
          <stop offset="100%" stopColor="rgba(100,220,255,0)" />
        </linearGradient>

        <linearGradient id="logo-v-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ddd6f4" />
          <stop offset="20%" stopColor="#ccc4e8" />
          <stop offset="45%" stopColor="#d6d0f0" />
          <stop offset="65%" stopColor="#c4d6ec" />
          <stop offset="85%" stopColor="#d0e4f4" />
          <stop offset="100%" stopColor="#daeef8" />
        </linearGradient>

        <linearGradient id="logo-v-highlight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.45)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.12)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.35)" />
        </linearGradient>

        <linearGradient id="logo-v-shadow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(50,30,100,0.15)" />
          <stop offset="100%" stopColor="rgba(0,40,70,0.1)" />
        </linearGradient>

        <linearGradient id="logo-s-fill" x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#f6f2ff" />
          <stop offset="18%" stopColor="#e4def2" />
          <stop offset="36%" stopColor="#cec6e4" />
          <stop offset="50%" stopColor="#ede8f6" />
          <stop offset="64%" stopColor="#d4ccea" />
          <stop offset="82%" stopColor="#e6e0f4" />
          <stop offset="100%" stopColor="#f4f0ff" />
        </linearGradient>

        <linearGradient id="logo-s-highlight" x1="0.3" y1="0" x2="0.7" y2="0.4">
          <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0.08)" />
        </linearGradient>

        {detailed && (
          <filter id="logo-shadow">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="rgba(0,0,0,0.3)" />
          </filter>
        )}

        {detailed && (
          <filter id="logo-s-glow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1" />
          </filter>
        )}

        {detailed && (
          <filter id="logo-s-glow2">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" />
          </filter>
        )}
      </defs>

      <g filter={detailed ? "url(#logo-shadow)" : undefined}>
        <polygon points="15,50 80,80 80,155 15,120" fill="url(#logo-face-left)" />
        <polygon points="15,50 80,80 80,155 15,120" fill="url(#logo-hl-left)" />
        <polygon points="145,50 80,80 80,155 145,120" fill="url(#logo-face-right)" />
        <polygon points="145,50 80,80 80,155 145,120" fill="url(#logo-hl-right)" />
        <polygon points="80,15 15,50 80,80 145,50" fill="url(#logo-face-top)" />
        <polygon points="80,15 15,50 80,80 145,50" fill="rgba(255,255,255,0.05)" />
      </g>

      {detailed && (
        <>
          <line x1="15" y1="50" x2="80" y2="80" stroke="rgba(180,160,255,0.1)" strokeWidth="0.5" />
          <line x1="145" y1="50" x2="80" y2="80" stroke="rgba(100,220,255,0.08)" strokeWidth="0.5" />
          <line x1="80" y1="80" x2="80" y2="155" stroke="rgba(160,140,255,0.05)" strokeWidth="0.5" />
          <line x1="80" y1="15" x2="15" y2="50" stroke="rgba(200,180,255,0.08)" strokeWidth="0.5" />
          <line x1="80" y1="15" x2="145" y2="50" stroke="rgba(140,220,255,0.06)" strokeWidth="0.5" />
        </>
      )}

      {detailed && (
        <polygon
          points="15,50 80,155 145,50 134,52.5 80,142 26,52.5"
          fill="rgba(0,0,0,0.1)"
          transform="translate(0.5,1.5)"
        />
      )}

      <polygon
        points="15,50 80,155 145,50 134,52.5 80,142 26,52.5"
        fill={detailed ? "url(#logo-v-fill)" : "rgba(228,222,248,0.85)"}
      />

      <path
        d="M15,50 L80,155 L145,50"
        fill="none"
        stroke={detailed ? "url(#logo-v-highlight)" : "rgba(255,255,255,0.25)"}
        strokeWidth={detailed ? 1 : 1.2}
        strokeLinejoin="miter"
      />

      {detailed && (
        <path
          d="M26,52.5 L80,142 L134,52.5"
          fill="none"
          stroke="url(#logo-v-shadow)"
          strokeWidth="0.6"
        />
      )}

      {detailed && (
        <polygon
          points="17,50 80,151 143,50 137,51.5 80,145 23,51.5"
          fill="rgba(255,255,255,0.03)"
        />
      )}

      <g transform="translate(80,0) scale(0.8,1) translate(-80,0)">
        {detailed && (
          <text
            x="80"
            y="62"
            fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI'"
            fontSize="54"
            fontWeight="800"
            fill="rgba(0,0,0,0.08)"
            textAnchor="middle"
            dy="1.5"
          >
            S
          </text>
        )}

        <text
          x="80"
          y="62"
          fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI'"
          fontSize={detailed ? 54 : 58}
          fontWeight="800"
          fill={detailed ? "url(#logo-s-fill)" : "#fff"}
          textAnchor="middle"
        >
          S
        </text>

        {detailed && (
          <text
            x="80"
            y="62"
            fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI'"
            fontSize="54"
            fontWeight="800"
            fill="none"
            textAnchor="middle"
            stroke="rgba(255,255,255,0.2)"
            strokeWidth="0.4"
            filter="url(#logo-s-glow)"
          >
            S
          </text>
        )}

        {detailed && (
          <text
            x="80"
            y="62"
            fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI'"
            fontSize="54"
            fontWeight="800"
            fill="none"
            textAnchor="middle"
            stroke="url(#logo-s-highlight)"
            strokeWidth="0.6"
            filter="url(#logo-s-glow2)"
          >
            S
          </text>
        )}
      </g>

      {detailed && (
        <>
          <ellipse cx="42" cy="85" rx="5" ry="9" fill="rgba(200,180,255,0.03)" />
          <ellipse cx="116" cy="92" rx="4" ry="7" fill="rgba(100,220,255,0.025)" />
        </>
      )}
    </svg>
  );
}
