import { defineConfig } from '@playwright/test';
import feedback from './class-feedback.playwright.config';

export default defineConfig({
  ...feedback,
  testMatch: ['pointer-flicker.spec.ts', 'cross-material-presence.spec.ts'],
  outputDir: '../test-results/pointer-flicker',
});
