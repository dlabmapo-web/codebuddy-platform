import { defineConfig, devices } from '@playwright/test';

const webPort = Number(process.env.E2E_WEB_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${webPort}`;

/**
 * Runs against the development Supabase project and the users created by
 * `pnpm --filter @cove/api db:seed`, plus the course fixture from
 * `db:seed:e2e`. Both are idempotent, so reruns are safe.
 *
 * The API and web servers are started here rather than assumed, so a single
 * `pnpm e2e` is enough from a cold checkout.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'pnpm --filter @cove/api dev',
          url: 'http://localhost:4000/api/health',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: 'ignore',
        },
        {
          command: 'pnpm --filter @cove/web dev',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          stdout: 'ignore',
        },
      ],
});
