import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { MonitoringRevocationModule } from "../monitoring/monitoring-revocation.module.js";
import { MediaModule } from "../profile/media.module.js";
import { AcademyDiscoveryService } from "./academy-discovery.service.js";
import { AcademyInvitationService } from "./academy-invitation.service.js";
import { AcademyJoinRequestService } from "./academy-join-request.service.js";
import { AcademyMembershipService } from "./academy-membership.service.js";
import { AcademyOnboardingService } from "./academy-onboarding.service.js";
import { AuditService } from "./audit.service.js";
import { RateLimitService } from "./rate-limit.service.js";

@Module({
  // `MediaModule` for the applications list, which renders applicants.
  imports: [AuthorizationModule, MediaModule, MonitoringRevocationModule],
  providers: [
    AcademyDiscoveryService,
    AcademyInvitationService,
    AcademyJoinRequestService,
    AcademyMembershipService,
    AcademyOnboardingService,
    AuditService,
    RateLimitService,
  ],
  exports: [
    AcademyDiscoveryService,
    AcademyInvitationService,
    AcademyJoinRequestService,
    AcademyMembershipService,
    AcademyOnboardingService,
    AuditService,
    RateLimitService,
  ],
})
export class AcademiesModule {}
