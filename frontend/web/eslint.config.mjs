// ============================================================
// frontend/web/eslint.config.mjs
// ============================================================
//
// Purpose:
//   ESLint configuration for the SovCorE Auto frontend.
//   Uses next/core-web-vitals (the Next.js recommended preset)
//   extended with typescript-eslint strict rules.
//
// ============================================================

import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
