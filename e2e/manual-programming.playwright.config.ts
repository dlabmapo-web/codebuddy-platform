import {defineConfig, devices} from '@playwright/test';
import dlab from './dlab.playwright.config';
export default defineConfig({...dlab, testMatch:'manual-programming.spec.ts', timeout:480000,
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}},{name:'webkit',use:{...devices['Desktop Safari']}}],
  use:{...dlab.use,actionTimeout:30000,navigationTimeout:90000,screenshot:'only-on-failure',viewport:{width:1440,height:1000}},
});
