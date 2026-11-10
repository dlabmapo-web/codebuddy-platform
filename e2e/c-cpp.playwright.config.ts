import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

if (!process.env.COVE_CPP_FIXTURE_DIR) throw Error('Run packages/api/scripts/test-c-cpp-local.sh');
export default defineConfig({
  testDir: './specs', testMatch: 'c-cpp-execution.spec.ts', workers: 1, fullyParallel: false,
  timeout: 120_000, maxFailures: 1, expect: { timeout: 30_000 }, reporter: [['list']],
  outputDir: '../test-results/c-cpp-browser',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3317', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { cwd: resolve(__dirname, '..'), command: 'node packages/api/scripts/c-cpp-e2e-server.mjs > "$COVE_CPP_FIXTURE_DIR/api.log" 2>&1', url: 'http://127.0.0.1:4317/api/health', timeout: 90_000, reuseExistingServer: false, stdout: 'ignore' },
    { cwd: resolve(__dirname, '..'), command: 'pnpm --filter @cove/web dev --hostname 127.0.0.1 --port 3317', url: 'http://127.0.0.1:3317/login', timeout: 180_000, reuseExistingServer: false, stdout: 'ignore', env: {
      COVE_DLAB_E2E: '1', DLAB_SSO_ENABLED: 'false', BFF_SHARED_SECRET: 'local-cpp-bff-secret-only-never-production',
      NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3317', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4317/api/rpc', INTERNAL_API_RPC_URL: 'http://127.0.0.1:4317/api/rpc',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4327', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-cpp-fixture-public-key', NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
    } },
  ],
});
