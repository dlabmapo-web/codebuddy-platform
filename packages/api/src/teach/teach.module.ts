import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { TeacherProgressAccessService } from "./teacher-progress-access.service.js";
import { TeacherProgressRepository } from "./teacher-progress.repository.js";
import { TeacherProgressService } from "./teacher-progress.service.js";

/**
 * The teacher's own read surface over a class they are assigned to.
 *
 * Deliberately separate from `MonitoringModule`: live monitoring needs Redis,
 * sockets, and a rollout flag, and none of that may become a precondition for
 * reading solution history. The two share only the assigned-class predicate in
 * `classes/assigned-class-access.ts`.
 */
@Module({
  imports: [AuthorizationModule],
  providers: [
    TeacherProgressAccessService,
    TeacherProgressRepository,
    TeacherProgressService,
  ],
  exports: [TeacherProgressService],
})
export class TeachModule {}
