import { defineConfig } from '@playwright/test';
import feedback from './class-feedback.playwright.config';
export default defineConfig({
  ...feedback,
  testMatch: 'student-classes-navigation.spec.ts',
  outputDir: '../test-results/student-classes-navigation',
});
