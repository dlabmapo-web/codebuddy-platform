import { defineConfig } from '@playwright/test';
import dlab from './dlab.playwright.config';

// Run packages/api/scripts/test-ai-assistant.sh: real application and grader,
// isolated local PostgreSQL and Redis, and a local stand-in for the model.
if (process.env.COVE_AI_ASSISTANT_E2E !== '1') throw Error('Run packages/api/scripts/test-ai-assistant.sh');
export default defineConfig({
  ...dlab,
  webServer: Array.isArray(dlab.webServer)
    ? dlab.webServer.map((server) => ({ ...server, timeout: 360_000 }))
    : dlab.webServer,
  testMatch: process.env.COVE_AI_ASSISTANT_REAL_MODEL === '1' ? 'ai-assistant-real-model.spec.ts' : 'ai-assistant.spec.ts',
  timeout: 600_000,
  expect: { ...dlab.expect, timeout: 90_000 },
  outputDir: '../test-results/ai-assistant',
  use: { ...dlab.use, screenshot: 'only-on-failure', actionTimeout: 30_000, navigationTimeout: 120_000, viewport: { width: 1440, height: 1000 } },
});
