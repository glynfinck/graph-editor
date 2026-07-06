import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// The demo route is server-rendered from Supabase (the official lessons), so
// these tests need a seeded local Supabase — same creds the app reads. Load
// them here too so the config/base URL line up with the spawned server.
loadEnv({ path: ".env.local" });

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // one demo workspace per worker; keep it simple and deterministic
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      // fixed viewport → deterministic canvas world coordinates
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    // Locally: dev server (reflects source; reuse one already running).
    // CI: serve the build produced by the prior `Build` step (see ci.yml).
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
