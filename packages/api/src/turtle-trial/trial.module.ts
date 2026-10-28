import { Module } from '@nestjs/common';
import { TrialController } from './trial.controller.js';
import { TrialService } from './trial.service.js';
import { TrialStore } from './trial-store.js';
import { TrialRuntime } from './trial-runtime.js';
import { TrialPins } from './trial-pins.js';
import { TrialBrowserPolicy } from './browser-policy.js';
import { TrialBrowserRuns } from './browser-runs.js';
import { TrialBrowserService } from './browser.service.js';

@Module({ controllers: [TrialController], providers: [TrialService, TrialStore, TrialRuntime, TrialPins, TrialBrowserPolicy, TrialBrowserRuns, TrialBrowserService], exports: [TrialStore, TrialPins] })
export class TurtleTrialModule {}
