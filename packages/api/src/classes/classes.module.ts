import { Module } from "@nestjs/common";

import { AcademiesModule } from "../academies/academies.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { MonitoringRevocationModule } from "../monitoring/monitoring-revocation.module.js";
import { MediaModule } from "../profile/media.module.js";
import { ClassesService } from "./classes.service.js";

/**
 * Owns class structure, course assignment, and enrollment. Student learning
 * access reads the shared predicate in `assigned-course-access.ts` directly,
 * so the learn module does not depend on this one.
 */
@Module({
  imports: [
    AcademiesModule,
    AuthorizationModule,
    // The roster and the two pickers render people, and a person has a face.
    MediaModule,
    MonitoringRevocationModule,
  ],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
