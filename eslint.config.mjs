import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python virtualenv (Streamlit ships huge bundled JS that exhausts ESLint's memory)
    ".venv/**",
    // The color-belt-lingo front-end, kept as-is while it's merged into this app
    "color-belt-lingo/**",
  ]),
]);

export default eslintConfig;
