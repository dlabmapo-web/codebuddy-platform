import { Module } from '@nestjs/common';
import { MonitoringRevocationModule } from '../../monitoring/monitoring-revocation.module.js';
import { DlabStateService } from './dlab-state.service.js';
import { DlabPolicyService } from './dlab-policy.service.js';
@Module({ imports: [MonitoringRevocationModule], providers: [DlabStateService, DlabPolicyService], exports: [DlabStateService, DlabPolicyService] })
export class DlabPolicyModule {}
