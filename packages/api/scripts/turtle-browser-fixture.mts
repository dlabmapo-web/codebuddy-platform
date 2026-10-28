/** Loopback-only integration fixture. No application env files, DB or broker. */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { TrialStore } from '../src/turtle-trial/trial-store.js';
import { TrialService } from '../src/turtle-trial/trial.service.js';
import { TrialRuntime } from '../src/turtle-trial/trial-runtime.js';
import { TrialController } from '../src/turtle-trial/trial.controller.js';
import { TrialBrowserPolicy } from '../src/turtle-trial/browser-policy.js';
import { TrialBrowserRuns } from '../src/turtle-trial/browser-runs.js';
import { TrialBrowserService } from '../src/turtle-trial/browser.service.js';
import { trialDigest } from '../src/turtle-trial/trial-security.js';

if (process.env.COVE_TURTLE_BROWSER_FIXTURE !== '1' || !/^brython-3\.15\.0-[a-f0-9]{20}$/.test(process.env.FIXTURE_RUNTIME_ID ?? '')) throw new Error('Explicit local fixture opt-in and runtime build required');
const config = new ConfigService({ NODE_ENV: 'test', TURTLE_TRIAL_ENABLED: true, REDIS_URL: 'redis://127.0.0.1:6398/2',
  TURTLE_TRIAL_LEGACY_PIN_ENABLED: true, BFF_SHARED_SECRET: 'synthetic-browser-fixture-bff-secret-20261028',
  TURTLE_TRIAL_PIN_PEPPER: 'synthetic-browser-fixture-pepper-20261028', TURTLE_TRIAL_PIN_VERSION: 'browser-ui-fixture-v1',
  TURTLE_TRIAL_PIN_DIGEST: trialDigest('012345', 'synthetic-browser-fixture-pepper-20261028'),
  TURTLE_TRIAL_BROWSER_ENABLED: true, TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED: true,
  TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN: 'http://127.0.0.1:4128', TURTLE_TRIAL_BROWSER_RUNTIME_ID: process.env.FIXTURE_RUNTIME_ID });
const noBroker = () => { throw new Error('Local browser fixture must not contact a broker'); };
@Module({ controllers: [TrialController], providers: [
  { provide: ConfigService, useValue: config }, { provide: TrialRuntime, useValue: { ready: noBroker, request: noBroker, lookup: noBroker } },
  TrialStore, TrialService, TrialBrowserPolicy, TrialBrowserRuns, TrialBrowserService,
] })
class FixtureModule {}
const app = await NestFactory.create(FixtureModule, { logger: false });
app.setGlobalPrefix('api'); app.enableShutdownHooks();
await app.listen(4028, '127.0.0.1');
console.log('Synthetic browser API fixture: http://127.0.0.1:4028 (PIN 012345; no DB/broker)');
