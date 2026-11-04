import { defineConfig } from "@playwright/test";
import monitoring from "./all-material-monitoring.playwright.config";
export default defineConfig({
  ...monitoring,
  testMatch: "student-history.spec.ts",
  use: { ...monitoring.use, navigationTimeout: 180000 },
  webServer: (Array.isArray(monitoring.webServer) ? monitoring.webServer : [])
    .slice(0, 2)
    .map((s) => ({ ...s, stdout: "pipe" as const })),
  outputDir: "../test-results/student-history",
});
