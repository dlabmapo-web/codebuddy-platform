import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import dlab from './dlab.playwright.config';
export default defineConfig({ ...dlab,
  testMatch: 'all-material-monitoring.spec.ts', timeout: 900000,
  outputDir: '../test-results/all-material-monitoring',
  use: { ...dlab.use, screenshot: 'only-on-failure', actionTimeout: 30000, navigationTimeout: 90000 },
  webServer: [...(Array.isArray(dlab.webServer) ? dlab.webServer : []), {
    cwd: resolve(__dirname, '..'), command: 'node packages/api/scripts/dlab-e2e-server.mjs',
    url: 'http://127.0.0.1:4339/api/health', timeout: 120000, reuseExistingServer: false,
    stdout: 'ignore', env: { COVE_OBSERVATION_PEER: '1' },
  }],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } } },
  ],
});
