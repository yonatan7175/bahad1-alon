import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // sw.js runs in a service worker
    files: ["public/sw.js"],
    languageOptions: { globals: { self: "readonly", caches: "readonly", clients: "readonly" } },
  },
  globalIgnores([
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    "public/apps/**",
    "public/app-icons/**",
    "public/bahad.js",
    "public/bahad.d.ts",
    "tests/tmp/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
