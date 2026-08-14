import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { LearnModule } from "../learn/learn.module.js";
import { CollaborationDocumentService } from "./collaboration-document.service.js";
import { MonitoringAccessService } from "./monitoring-access.service.js";
import { MonitoringFeedbackBroadcaster } from "./monitoring-feedback-broadcaster.js";
import { MonitoringFeedbackService } from "./monitoring-feedback.service.js";
import { MonitoringGateway } from "./monitoring.gateway.js";
import { MonitoringRevocationModule } from "./monitoring-revocation.module.js";
import { MonitoringService } from "./monitoring.service.js";
import { PresenceRegistry } from "./presence.registry.js";
import { TeachModule } from "../teach/teach.module.js";

/**
 * Live teacher monitoring: composition only.
 *
 * `MONITORING_REDIS` resolves to null without a configured Redis, exactly as
 * the grading queue does. The durable oRPC reads keep working; only realtime
 * reports itself degraded, which is the honest failure and never an empty
 * roster presented as an absent class.
 *
 * The access service and the revocation service are exported because the
 * gateway and the services that change access both authorize through them.
 * Two gates for one boundary is how a socket ends up trusting something HTTP
 * would have refused.
 */
@Module({
  imports: [
    AuthModule,
    AuthorizationModule,
    // For the outline builder only: a teacher's copy of a student's curriculum
    // is the student's own outline, read through a teacher's claim.
    LearnModule,
    MonitoringRevocationModule,
    // For the activity accumulator alone. The gateway produces heartbeats; the
    // teaching module owns what they durably become.
    TeachModule,
  ],
  providers: [
    MonitoringAccessService,
    MonitoringService,
    PresenceRegistry,
    CollaborationDocumentService,
    MonitoringFeedbackService,
    MonitoringFeedbackBroadcaster,
    MonitoringGateway,
  ],
  exports: [MonitoringAccessService, MonitoringService, MonitoringRevocationModule],
})
export class MonitoringModule {}
