// ============================================================
// frontend/web/src/components/ui/background-canvas.tsx
// ============================================================
//
// Purpose:
//   Renders the animated particle-network canvas that sits
//   behind all page content as a fixed ambient visual layer.
//
// Origin:
//   Copied verbatim from SovCorE QR src/components/ui/background-canvas.tsx,
//   which mirrors the SovCorE platform web canvas exactly.
//
// Design:
//   - Deep dark base fill (#08080f).
//   - Two radial gradient glows: purple top-left, cyan bottom-right.
//   - 55 particles drifting slowly in random directions.
//   - Connecting lines between particles within 150 px, with
//     opacity scaling with distance.
//   - Pure decoration: pointer-events:none, z-index var(--z-background).
//
// Consumed by:
//   - app/layout.tsx (rendered once at the root)
// ============================================================

"use client";

import { useEffect, useRef } from "react";

// ==================================================
// CONSTANTS
// ==================================================

const PARTICLE_COUNT = 55;
const CONNECTION_DISTANCE = 150;
const MAX_SPEED = 0.25;
const PARTICLE_RADIUS_MIN = 0.4;
const PARTICLE_RADIUS_MAX = 1.6;
const PARTICLE_OPACITY_MIN = 0.08;
const PARTICLE_OPACITY_MAX = 0.38;
const LINE_OPACITY_MAX = 0.06;
const ACCENT_RGB = "108, 99, 255";
const CYAN_RGB = "0, 212, 255";

// ==================================================
// TYPES
// ==================================================

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  o: number;
}

// ==================================================
// HELPERS
// ==================================================

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createParticles(width: number, height: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * MAX_SPEED * 2,
    vy: (Math.random() - 0.5) * MAX_SPEED * 2,
    r: randomBetween(PARTICLE_RADIUS_MIN, PARTICLE_RADIUS_MAX),
    o: randomBetween(PARTICLE_OPACITY_MIN, PARTICLE_OPACITY_MAX),
  }));
}

// ==================================================
// COMPONENT
// ==================================================

export function BackgroundCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let rafId = 0;
    let particles: Particle[] = [];

    function resize() {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      // Re-seed particles so they spread evenly across the new dimensions.
      particles = createParticles(width, height);
    }

    function draw() {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);

      // ---- Base fill ----
      ctx.fillStyle = "#08080f";
      ctx.fillRect(0, 0, width, height);

      // ---- Purple glow, top-left area ----
      const glow1 = ctx.createRadialGradient(
        width * 0.3, height * 0.25, 0,
        width * 0.3, height * 0.25, width * 0.55,
      );
      glow1.addColorStop(0, `rgba(${ACCENT_RGB}, 0.07)`);
      glow1.addColorStop(1, "transparent");
      ctx.fillStyle = glow1;
      ctx.fillRect(0, 0, width, height);

      // ---- Cyan glow, bottom-right area ----
      const glow2 = ctx.createRadialGradient(
        width * 0.8, height * 0.65, 0,
        width * 0.8, height * 0.65, width * 0.4,
      );
      glow2.addColorStop(0, `rgba(${CYAN_RGB}, 0.04)`);
      glow2.addColorStop(1, "transparent");
      ctx.fillStyle = glow2;
      ctx.fillRect(0, 0, width, height);

      // ---- Connection lines ----
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          if (!a || !b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DISTANCE) {
            const opacity = LINE_OPACITY_MAX * (1 - dist / CONNECTION_DISTANCE);
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${ACCENT_RGB}, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // ---- Particles ----
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ACCENT_RGB}, ${p.o})`;
        ctx.fill();

        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
      }
    }

    function loop() {
      draw();
      rafId = requestAnimationFrame(loop);
    }

    resize();
    loop();
    window.addEventListener("resize", resize, { passive: true });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: "var(--z-background)" as unknown as number,
        pointerEvents: "none",
      }}
    />
  );
}
