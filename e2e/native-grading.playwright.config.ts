import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
if (
  !process.env.COVE_NATIVE_FIXTURE_ID ||
  process.env.DOTENV_CONFIG_PATH !== '/dev/null'
)
  throw new Error('Run test-native-grading-isolated.sh --browser');
export default defineConfig({
  testDir: './specs',
  testMatch: 'native-grading.spec.ts',
  workers: 1,
  fullyParallel: false,
  maxFailures: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 60_000 },
  outputDir: process.env.COVE_NATIVE_EVIDENCE_DIR + '/browser',
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile:
          process.env.COVE_NATIVE_EVIDENCE_DIR + '/browser-results.json',
      },
    ],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3409',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Intentionally no general E2E globalSetup or development auth-state reuse.
  webServer: [
    {
      cwd: resolve(__dirname, '..'),
      command: 'node packages/api/scripts/native-grading-e2e-server.mjs',
      url: 'http://127.0.0.1:4419/api/health',
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: 'ignore',
    },
    {
      cwd: resolve(__dirname, '..'),
      command: 'node packages/api/scripts/native-grading-e2e-worker.mjs',
      url: 'http://127.0.0.1:4421/health',
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: 'pipe',
    },
    {
      cwd: resolve(__dirname, '..'),
      command:
        process.env.COVE_NATIVE_WEB_PRODUCTION === '1'
          ? 'node packages/web/.next/standalone/packages/web/server.js'
          : 'pnpm --filter @cove/web dev --hostname 127.0.0.1 --port 3409',
      url: 'http://127.0.0.1:3409/login',
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: 'ignore',
      env: {
        PORT: '3409', HOSTNAME: '127.0.0.1',
        DOTENV_CONFIG_PATH: '/dev/null',
        DLAB_SSO_ENABLED: 'false',
        BFF_SHARED_SECRET: 'local-native-bff-secret-only-never-production',
        NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3409',
        NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4419/api/rpc',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4420',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-native-public-key',
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
      },
    },
  ],
});
