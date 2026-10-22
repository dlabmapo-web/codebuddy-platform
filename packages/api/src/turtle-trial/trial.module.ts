import { Module } from '@nestjs/common';
import { TrialController } from './trial.controller.js';
import { TrialService } from './trial.service.js';
import { TrialStore } from './trial-store.js';
import { TrialRuntime } from './trial-runtime.js';

@Module({ controllers: [TrialController], providers: [TrialService, TrialStore, TrialRuntime] })
export class TurtleTrialModule {}
