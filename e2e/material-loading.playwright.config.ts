import { defineConfig, devices } from '@playwright/test';
import base from './web-courses.playwright.config';
export default defineConfig({
  ...base,
  testMatch:'material-loading.spec.ts',
  outputDir:'../test-results/material-loading',
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}},{name:'webkit',use:{...devices['Desktop Safari']}}],
  webServer:(Array.isArray(base.webServer)?base.webServer:[]).map((server,index)=>index===1 ? {
    ...server,env:{...server.env,INTERNAL_API_RPC_URL:'http://127.0.0.1:4320/testing-api/rpc',NEXT_PUBLIC_GUI_ENABLED:'true',NEXT_PUBLIC_VIDEO_LESSONS_ENABLED:'true',NEXT_PUBLIC_SHORT_ANSWER_ENABLED:'true',NEXT_PUBLIC_MULTIPLE_CHOICE_ENABLED:'true'},
  }:server),
});
