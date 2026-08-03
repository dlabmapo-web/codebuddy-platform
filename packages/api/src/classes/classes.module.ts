import { Module } from "@nestjs/common";

import { AcademiesModule } from "../academies/academies.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { ClassesService } from "./classes.service.js";

/**
 * Owns class structure, course assignment, and enrollment. Student learning
 * access reads the shared predicate in `assigned-course-access.ts` directly,
 * so the learn module does not depend on this one.
 */
@Module({
  imports: [AcademiesModule, AuthorizationModule],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
