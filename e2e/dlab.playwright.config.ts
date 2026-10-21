import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './specs', testMatch: 'dlab-sso.spec.ts', workers: 1, fullyParallel: false,
  maxFailures: 1, timeout: 90_000, expect: { timeout: 25_000 }, reporter: [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3309', trace: 'retain-on-failure' },
  webServer: [
    { cwd: resolve(__dirname, '..'), command: 'node packages/api/scripts/dlab-e2e-server.mjs', url: 'http://127.0.0.1:4319/api/health', timeout: 120_000, reuseExistingServer: false, stdout: 'ignore' },
    { cwd: resolve(__dirname, '..'), command: 'pnpm --filter @cove/web dev --hostname 127.0.0.1 --port 3309', url: 'http://127.0.0.1:3309/login', timeout: 180_000, reuseExistingServer: false, stdout: 'ignore', env: {
      COVE_DLAB_E2E: '1',
      DLAB_SSO_ENABLED: 'true', BFF_SHARED_SECRET: 'local-e2e-bff-secret-only-never-production',
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3309', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4319/api/rpc',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4320', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-e2e-publishable-key', NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
    } },
  ],
});
