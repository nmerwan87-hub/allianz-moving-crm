import { defineConfig, devices } from "@playwright/test"

const isCI = Boolean(process.env["CI"])

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  ...(isCI ? { workers: 1 } : {}),
  reporter: "html",
  use: {
    baseURL: process.env["PLAYWRIGHT_BASE_URL"] ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(isCI
    ? {
        webServer: {
          command: "pnpm start",
          url: "http://localhost:3000",
          reuseExistingServer: false,
        },
      }
    : {}),
})
