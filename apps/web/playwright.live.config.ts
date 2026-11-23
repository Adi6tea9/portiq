// Live end-to-end check against the real API and Supabase sign-in.
// Needs the API on :8000 and the web app on :3000 in live mode (NEXT_PUBLIC_USE_MOCKS=false),
// plus PORTIQ_LIVE_EMAIL / PORTIQ_LIVE_PASSWORD for an importer account. Skipped without them.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/live",
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results-live",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.PORTIQ_LIVE_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
});
