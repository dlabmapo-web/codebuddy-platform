import { defineConfig } from '@playwright/test';
import feedback from './class-feedback.playwright.config';

export default defineConfig({
  ...feedback,
  testMatch: 'cross-material-presence.spec.ts',
  outputDir: '../test-results/cross-material-presence',
});
