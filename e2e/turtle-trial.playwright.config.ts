import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
const reuse = process.env.COVE_TURTLE_REUSE_FIXTURE === '1';

export default defineConfig({
  testDir: './specs', testMatch: 'public-turtle-trial.spec.ts', workers: 1,
  fullyParallel: false, maxFailures: 1, timeout: 90000, expect: { timeout: 20000 }, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3067', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }, { name: 'webkit', use: { ...devices['Desktop Safari'] } }],
  webServer: [
    { command: 'node packages/gui-runtime/scripts/trial-local.mjs', cwd: resolve(__dirname, '..'), port: 4017, timeout: 120000, reuseExistingServer: reuse, stdout: 'ignore' },
    { command: 'pnpm --filter @cove/api exec tsx scripts/turtle-trial-e2e-server.mjs', cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:4037/api/health', timeout: 120000, reuseExistingServer: reuse, stdout: 'ignore', env: { TURTLE_TRIAL_TEST_REDIS_URL: 'redis://127.0.0.1:6397' } },
    { command: 'pnpm --filter @cove/web dev --hostname 127.0.0.1 --port 3067', cwd: resolve(__dirname, '..'), url: 'http://127.0.0.1:3067/turtle', timeout: 240000, reuseExistingServer: reuse, stdout: 'ignore', env: {
      COVE_TURTLE_E2E: '1', NEXT_PUBLIC_TURTLE_TRIAL_ENABLED: 'true', TURTLE_TRIAL_ENABLED: 'true',
      BFF_SHARED_SECRET: 'local-trial-bff-secret-never-production', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3067',
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4037/api/rpc', NEXT_PUBLIC_SUPABASE_URL: 'https://unused.invalid',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'unused-local-key',
    } },
  ],
});
