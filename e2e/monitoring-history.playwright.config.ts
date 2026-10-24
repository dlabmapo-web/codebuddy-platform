import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './specs', testMatch: 'monitoring-history.spec.ts', workers: 1, fullyParallel: false,
  timeout: 180000, expect: { timeout: 30000 }, reporter: [['list']],
  outputDir: '../test-results/monitoring-history',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure', screenshot: 'only-on-failure', navigationTimeout: 90000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } } },
  ],
});
