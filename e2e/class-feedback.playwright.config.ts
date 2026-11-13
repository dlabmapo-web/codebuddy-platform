import { defineConfig } from '@playwright/test';
import dlab from './dlab.playwright.config';

// Real application and authorization, isolated local PostgreSQL/provider doubles.
export default defineConfig({
  ...dlab,
  // The mixed lesson route compiles the editor and media readers on a cold dev server.
  webServer: Array.isArray(dlab.webServer)
    ? dlab.webServer.map(server => ({ ...server, timeout: 360_000, stdout: 'pipe' as const }))
    : dlab.webServer,
  testMatch: ['class-feedback.spec.ts', 'classroom-live.spec.ts'],
  timeout: 420_000,
  expect: { ...dlab.expect, timeout: 90_000 },
  outputDir: '../test-results/class-feedback',
  use: { ...dlab.use, screenshot: 'only-on-failure', actionTimeout: 25_000, navigationTimeout: 90_000, viewport: { width: 1440, height: 1000 } },
});
