// ============================================================
// frontend/web/postcss.config.mjs
// ============================================================
//
// Purpose:
//   PostCSS pipeline for SovCorE Auto frontend. Tailwind v4
//   ships its own PostCSS plugin (@tailwindcss/postcss) which
//   processes @theme blocks and CSS variables.
//
// ============================================================

export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
