import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './production',
  globalSetup: './production.global-setup.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: '../playwright-report/production' }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.PRODUCTION_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'production-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
