import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AcademiesModule } from "../academies/academies.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { MonitoringRevocationModule } from "../monitoring/monitoring-revocation.module.js";
import { MediaModule } from "../profile/media.module.js";
import { TeachModule } from "../teach/teach.module.js";
import { AcademyFeaturesService } from "./academy-features.service.js";
import { AcademyOperationsProfileService } from "./academy-profile.service.js";
import { AcademyMediaController } from "./academy-media.controller.js";
import { AcademyMediaService } from "./academy-media.service.js";
import { DeliveryWebhookController } from "./delivery-webhook.controller.js";
import { EMAIL_SENDER, createEmailSender } from "./email-sender.js";
import { InvitationDeliveryService } from "./invitation-delivery.service.js";
import { ManagerOverviewRepository } from "./manager-overview.repository.js";
import { ManagerOverviewService } from "./manager-overview.service.js";
import { ManagerScopeService } from "./manager-scope.service.js";
import { PeopleBulkService } from "./people-bulk.service.js";
import { PeopleDirectoryService } from "./people-directory.service.js";
import { PeopleImportController } from "./people-import.controller.js";
import { PeopleImportService } from "./people-import.service.js";

/**
 * The manager's operations surfaces: the control tower, the academy profile,
 * the people directory, import, bulk mutations, and invitation delivery.
 *
 * `TeachModule` is imported for its two analytics repositories and nothing
 * else. §7.4 — the manager is a second adapter at the analytics seam, so the
 * measurement code is *used* here rather than reimplemented, and the teacher's
 * own authorization service is deliberately not among the imports: this module
 * cannot reach a teacher-scoped read even by accident.
 *
 * The email sender is a factory rather than a class, because which adapter this
 * deployment gets is a configuration question — §7.6's delivery seam. Nothing
 * downstream of the token knows which one it holds.
 */
@Module({
  imports: [
    // `AcademiesModule` for the audit writer and the rate limiter, both of
    // which must be one instance per process: the limiter holds its windows in
    // memory, and a second copy would silently double every quota the moment
    // two modules chose the same key prefix.
    AcademiesModule,
    AuthModule,
    AuthorizationModule,
    MonitoringRevocationModule,
    MediaModule,
    TeachModule,
  ],
  controllers: [AcademyMediaController, PeopleImportController, DeliveryWebhookController],
  providers: [
    ManagerScopeService,
    ManagerOverviewRepository,
    ManagerOverviewService,
    AcademyFeaturesService,
    AcademyOperationsProfileService,
    AcademyMediaService,
    PeopleDirectoryService,
    PeopleImportService,
    PeopleBulkService,
    InvitationDeliveryService,
    {
      provide: EMAIL_SENDER,
      inject: [ConfigService],
      useFactory: createEmailSender,
    },
  ],
  exports: [
    ManagerOverviewService,
    AcademyFeaturesService,
    AcademyOperationsProfileService,
    PeopleDirectoryService,
    PeopleImportService,
    PeopleBulkService,
    InvitationDeliveryService,
  ],
})
export class ManageModule {}
