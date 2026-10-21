import { Module } from '@nestjs/common';
import { MonitoringRevocationModule } from '../../monitoring/monitoring-revocation.module.js';
import { DlabReconcilerService } from './dlab-reconciler.service.js';
import { DlabStateService } from './dlab-state.service.js';
import { DlabPolicyService } from './dlab-policy.service.js';
@Module({ imports: [MonitoringRevocationModule], providers: [DlabStateService, DlabPolicyService, DlabReconcilerService], exports: [DlabStateService, DlabPolicyService, DlabReconcilerService] })
export class DlabPolicyModule {}
