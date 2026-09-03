import { Module } from "@nestjs/common";

import { AcademiesModule } from "../academies/academies.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { AcademyLibraryService } from "./library/academy-library.service.js";
import { CourseService } from "./course.service.js";
import { ContentImportController } from "./import/content-import.controller.js";
import { ContentImportService } from "./import/content-import.service.js";
import { MonitoringRevocationModule } from "../monitoring/monitoring-revocation.module.js";

/**
 * Curriculum authoring, by hand and by workbook.
 *
 * `AuthModule` joins the imports for the upload controller alone: a raw-body
 * post arrives outside the oRPC pipeline and has to verify its own bearer
 * token, exactly as the member import and media controllers do.
 *
 * `AcademiesModule` brings the audit writer and the rate limiter, both of which
 * must be one instance per process — the limiter holds its windows in memory,
 * and a second copy would silently double every quota the moment two modules
 * chose the same key prefix.
 */
@Module({
  imports: [
    AcademiesModule,
    AuthModule,
    AuthorizationModule,
    MonitoringRevocationModule,
  ],
  controllers: [ContentImportController],
  providers: [AcademyLibraryService, CourseService, ContentImportService],
  exports: [AcademyLibraryService, CourseService, ContentImportService],
})
export class ContentModule {}
