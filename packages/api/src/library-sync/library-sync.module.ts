import { LegacyLibraryLinkService } from "./legacy-link.service.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { LibraryReviewPreviews } from "./review-previews.service.js";
import { Module } from "@nestjs/common";

import { AcademiesModule } from "../academies/academies.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { MonitoringRevocationModule } from "../monitoring/monitoring-revocation.module.js";
import { AcademyLibrarySyncService } from "./academy-sync.service.js";
import { LibraryReleaseService } from "./library-release.service.js";
import { LibrarySyncJobService } from "./sync-job.service.js";

/**
 * Library course sync: releases, the durable sync drain, and conflict review
 * (docs/superpowers/specs/2026-11-18-library-course-sync-design.md).
 */
@Module({
  imports: [AcademiesModule, AuthorizationModule, MonitoringRevocationModule, NotificationsModule],
  providers: [
    LibraryReviewPreviews,
    LibrarySyncJobService,
    LibraryReleaseService,
    AcademyLibrarySyncService,
    LegacyLibraryLinkService,
  ],
  exports: [
    LibrarySyncJobService,
    LibraryReleaseService,
    AcademyLibrarySyncService,
    LegacyLibraryLinkService,
  ],
})
export class LibrarySyncModule {}
