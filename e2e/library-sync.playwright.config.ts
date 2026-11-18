import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
  testDir: "./specs",
  testMatch:
    process.env.COVE_LIBRARY_SYNC_SCENARIO === "ten-problems"
      ? "library-sync-ten-problems.spec.ts"
      : "library-sync.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout:
    process.env.COVE_LIBRARY_SYNC_SCENARIO === "ten-problems"
      ? 600_000
      : 180_000,
  expect: { timeout: 30_000 },
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:3342",
    viewport:
      process.env.COVE_LIBRARY_SYNC_SCENARIO === "ten-problems"
        ? { width: 1600, height: 1000 }
        : devices["Desktop Chrome"].viewport,
    trace: "retain-on-failure",
  },
  outputDir:
    process.env.COVE_LIBRARY_SYNC_SCENARIO === "ten-problems"
      ? "../test-results/library-sync-ten-problems/run"
      : "../test-results/library-sync",
  webServer: [
    {
      cwd: resolve(__dirname, ".."),
      command: "node packages/api/scripts/library-sync-e2e-server.mjs",
      url: "http://127.0.0.1:4342/api/health",
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      cwd: resolve(__dirname, ".."),
      command: "pnpm --filter @cove/web dev --hostname 127.0.0.1 --port 3342",
      url: "http://127.0.0.1:3342/login",
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: "ignore",
      env: {
        COVE_LIBRARY_SYNC_E2E: "1",
        BFF_SHARED_SECRET: "local-library-sync-browser-only-never-production",
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3342",
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:4342/api/rpc",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:4343",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-sync-browser-key",
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      },
    },
  ],
});
