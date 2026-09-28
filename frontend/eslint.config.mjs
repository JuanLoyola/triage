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
    // Test tooling. jest.config.js is CommonJS and needs require(); the
    // Playwright config is TypeScript and is covered by tsc instead.
    "jest.config.js",
    "playwright.config.ts",
    // Playwright artifacts.
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
