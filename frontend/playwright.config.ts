import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the mock LLM.
 *
 * The real provider burns Gemini free-tier quota on every run, and the daily
 * budget is 3 executions per session. A test suite that depends on that cannot
 * be re-run. MOCK_LLM=true makes the harness deterministic and free, which is
 * the same reason the backend unit tests use MockProvider.
 */
const PORT = 3000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // The run budget is global in-memory, so parallel tests would race for the
  // same 3 executions.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: [
    {
      // The backend must be up with the mock provider.
      command:
        'cd ../backend && .\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --port 8000',
      url: "http://127.0.0.1:8000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { MOCK_LLM: "true" },
    },
    {
      // Production build, not `next dev`.
      //
      // `next dev` under Turbopack did not hydrate in this environment: the
      // page rendered its SSR HTML but React never attached, so no effect ran
      // and the dashboard was inert. That is a dev-server problem, not an app
      // one, but it makes dev servers unusable as a test target anyway.
      command: "npm run build && npm run start",
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
