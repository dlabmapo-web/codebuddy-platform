import { MonitoringRevocationModule } from '../../monitoring/monitoring-revocation.module.js';
import { Module } from '@nestjs/common';
import { SupabaseAuthModule } from '../../auth/supabase-auth.module.js';
import { DlabPolicyModule } from './dlab-policy.module.js';
import { DlabSourceService } from './dlab-source.service.js';
import { DlabCampusProvisioner } from './dlab-campus-provisioner.js';
import { DlabDirectoryService } from './dlab-directory.service.js';
import { DlabSsoService } from './dlab-sso.service.js';
import { DlabInternalController, DlabInboundController } from './dlab.controller.js';
@Module({ imports: [SupabaseAuthModule, DlabPolicyModule, MonitoringRevocationModule], providers: [DlabCampusProvisioner, DlabSourceService, DlabDirectoryService, DlabSsoService], controllers: [DlabInternalController, DlabInboundController] })
export class DlabModule {}
