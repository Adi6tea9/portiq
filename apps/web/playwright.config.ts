import { defineConfig, devices } from "@playwright/test";

// PLAYWRIGHT_PORT runs the suite on its own mock server when :3000 is already taken.
const port = process.env.PLAYWRIGHT_PORT ?? "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
  reporter: [["list"]],
  outputDir: "test-results",
  // The webServer runs `next dev`, which compiles each route on first visit.
  // Parallel workers hitting cold routes can take longer than the 5s expect
  // default, which is a dev-server cost rather than a product failure.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: port === "3000" ? "npm run dev" : `npx next dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "placeholder-key",
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:8000/api/v1",
      NEXT_PUBLIC_USE_MOCKS: "true",
      ...(port === "3000" ? {} : { NEXT_DIST_DIR: ".next-e2e" }),
    },
  },
});
