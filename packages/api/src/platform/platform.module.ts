import { Module } from "@nestjs/common";

import { AcademiesModule } from "../academies/academies.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { ManageModule } from "../manage/manage.module.js";
import { MediaModule } from "../profile/media.module.js";
import { MonitoringRevocationModule } from "../monitoring/monitoring-revocation.module.js";
import { PlatformAcademyService } from "./platform-academy.service.js";
import { PlatformApplicationsService } from "./platform-applications.service.js";
import { PlatformAuditService } from "./platform-audit.service.js";
import { PlatformContentService } from "./platform-content.service.js";
import { PlatformInvitationsService } from "./platform-invitations.service.js";
import { PlatformLibraryService } from "./platform-library.service.js";
import { PlatformParticipationRepository } from "./platform-participation.repository.js";
import { PlatformRankingService } from "./platform-ranking.service.js";
import { PlatformUsersController } from "./platform-users.controller.js";
import { PlatformUsersService } from "./platform-users.service.js";
import { PlatformSupportService } from "./platform-support.service.js";
import { PlatformLifecycleService } from "./platform-lifecycle.service.js";

/**
 * Cove's own operators, and the academies they bring onto the platform.
 *
 * `ManageModule` is imported for the invitation delivery seam only — the first
 * manager is invited through exactly the machinery every other invitation
 * uses, so token hashing, expiry, single use, and delivery tracking are
 * inherited rather than rebuilt. Nothing else in the manager's surface is
 * reachable from here, which is the point: a platform admin creates academies
 * and never reads inside one.
 *
 * `AuthModule` joins the imports for the export controller alone, as it does
 * for the content importer's: a route that streams bytes arrives outside the
 * oRPC pipeline and has to verify its own bearer token. `AcademiesModule`
 * already brings the rate limiter, which must stay one instance per process —
 * it holds its windows in memory, and a second copy would silently double
 * every quota.
 */
@Module({
  imports: [
    AcademiesModule,
    AuthModule,
    AuthorizationModule,
    ManageModule,
    // `ProfileMediaService`, for the applications queue: it shows an
    // applicant's own photo, and signing one URL per row is what every other
    // people surface already does through this module.
    MediaModule,
    MonitoringRevocationModule,
  ],
  controllers: [PlatformUsersController],
  providers: [
    PlatformAcademyService,
    PlatformApplicationsService,
    PlatformLifecycleService,
    PlatformUsersService,
    PlatformParticipationRepository,
    PlatformSupportService,
    PlatformAuditService,
    PlatformContentService,
    PlatformInvitationsService,
    PlatformLibraryService,
    PlatformRankingService,
  ],
  exports: [
    PlatformAcademyService,
    PlatformApplicationsService,
    PlatformLifecycleService,
    PlatformUsersService,
    PlatformSupportService,
    PlatformAuditService,
    PlatformContentService,
    PlatformInvitationsService,
    PlatformLibraryService,
    PlatformRankingService,
  ],
})
export class PlatformModule {}
