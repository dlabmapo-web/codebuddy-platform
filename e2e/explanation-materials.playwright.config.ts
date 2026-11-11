import { defineConfig } from '@playwright/test';
import dlab from './dlab.playwright.config';
export default defineConfig({ ...dlab, testMatch: 'explanation-materials.spec.ts', timeout: 480_000,
  use: { ...dlab.use, actionTimeout: 30_000, navigationTimeout: 90_000, screenshot: 'only-on-failure', viewport: { width: 1440, height: 1000 } },
  webServer: (Array.isArray(dlab.webServer) ? dlab.webServer : []).map(server => ({ ...server, reuseExistingServer: true })),
});
