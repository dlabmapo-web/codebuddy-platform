import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
const webPort = Number(process.env.COVE_DLAB_TEST_WEB_PORT ?? 3309);
const studio = `http://127.0.0.1:${webPort}`;
const api = `http://127.0.0.1:${Number(process.env.COVE_DLAB_TEST_API_PORT ?? 4319)}`;
const provider = `http://127.0.0.1:${Number(process.env.COVE_DLAB_TEST_PROVIDER_PORT ?? 4320)}`;
export default defineConfig({
  testDir: './specs', testMatch: 'dlab-sso.spec.ts', workers: 1, fullyParallel: false,
  maxFailures: 1, timeout: 90_000, expect: { timeout: 25_000 }, reporter: [['list']],
  use: { ...devices['Desktop Chrome'], baseURL: studio, trace: 'retain-on-failure' },
  webServer: [
    { cwd: resolve(__dirname, '..'), command: 'node packages/api/scripts/dlab-e2e-server.mjs', url: api + '/api/health', timeout: 120_000, reuseExistingServer: false, stdout: 'ignore' },
    { cwd: resolve(__dirname, '..'), command: `pnpm --filter @cove/web dev --hostname 127.0.0.1 --port ${webPort}`, url: studio + '/login', timeout: 180_000, reuseExistingServer: false, stdout: 'ignore', env: {
      COVE_DLAB_E2E: '1',
      DLAB_SSO_ENABLED: 'true', BFF_SHARED_SECRET: 'local-e2e-bff-secret-only-never-production',
      NEXT_PUBLIC_SITE_URL: studio, NEXT_PUBLIC_API_URL: api + '/api/rpc',
      NEXT_PUBLIC_SUPABASE_URL: provider, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-e2e-publishable-key', NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
    } },
  ],
});
