import { defineConfig } from "@playwright/test";
import dlab from "./dlab.playwright.config";
export default defineConfig({
  ...dlab,
  testMatch: "web-courses.spec.ts",
  timeout: 900_000,
  webServer: (Array.isArray(dlab.webServer) ? dlab.webServer : []).map(
    (server, index) =>
      index === 1 && process.env.COVE_WEB_COURSES_PRODUCTION === "1"
        ? {
            ...server,
            command:
              "pnpm --filter @cove/web start --hostname 127.0.0.1 --port 3309",
          }
        : server,
  ),
  outputDir: "../test-results/web-courses",
  use: {
    ...dlab.use,
    actionTimeout: 30_000,
    navigationTimeout: 180_000,
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1000 },
  },
});
