import { defineConfig } from '@playwright/test';
import dlab from './dlab.playwright.config';

// Real application and authorization, isolated local PostgreSQL/provider doubles.
export default defineConfig({
  ...dlab,
  testMatch: 'class-feedback.spec.ts',
  timeout: 240_000,
  outputDir: '../test-results/class-feedback',
  use: { ...dlab.use, screenshot: 'only-on-failure', actionTimeout: 25_000, navigationTimeout: 90_000, viewport: { width: 1440, height: 1000 } },
});
