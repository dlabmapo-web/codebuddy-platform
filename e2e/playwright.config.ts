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
  globalSetup: './global-setup.ts',
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
    {
      // The curriculum dock changes the containing block for a percentage-
      // sized split pane. Safari has historically resolved flex percentages
      // differently here, so the reported student layout stays covered by
      // the engine that exposed it.
      name: 'webkit-navigator',
      testMatch: /curriculum-navigator\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      // The live-monitoring pointer crosses a sandboxed iframe boundary. Keep
      // that path covered by WebKit because Safari's document/event behavior
      // is the browser-specific failure a teacher reported in production use.
      name: 'webkit-monitoring',
      grepInvert:
        /teacher runs|submitting stays|feedback is stored|temporary disconnect|indicator clears/,
      testMatch: /teacher-live-monitoring\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      // The reveal row wraps inside a percentage-sized split pane, which is
      // where a control that fits at desktop stops fitting. Narrow enough to
      // wrap, wide enough to stay in the two-pane layout the design assumes.
      name: 'chromium-hints-narrow',
      testMatch: /student-hints\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 900, height: 800 } },
    },
    {
      name: 'webkit-hints',
      testMatch: /student-hints\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
    {
      // Safari does not implement COEP `credentialless`; this project guards
      // the `require-corp` isolation contract needed by SharedArrayBuffer and
      // exercises real stdin wake-up through the Pyodide worker.
      name: 'webkit-python',
      testMatch: /interactive-python\.spec\.ts/,
      use: { ...devices['Desktop Safari'] },
    },
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
          command: 'JUDGE_HEALTH_PORT=4101 pnpm --filter @cove/judge-worker dev',
          url: 'http://127.0.0.1:4101/health',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          stdout: 'ignore',
        },
        {
          command: `pnpm --filter @cove/web exec next dev -p ${webPort}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          stdout: 'ignore',
        },
      ],
});
