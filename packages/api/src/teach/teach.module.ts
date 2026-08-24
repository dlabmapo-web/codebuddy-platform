import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { MonitoringRevocationModule } from "../monitoring/monitoring-revocation.module.js";
import { PointsModule } from "../points/points.module.js";
import { LearningActivityAccumulator } from "./learning-activity.accumulator.js";
import { TeacherOverviewAccessService } from "./teacher-overview-access.service.js";
import { TeacherOverviewRepository } from "./teacher-overview.repository.js";
import { TeacherOverviewService } from "./teacher-overview.service.js";
import { TeacherStudentsService } from "./teacher-students.service.js";
import { TeacherProgressAccessService } from "./teacher-progress-access.service.js";
import { TeacherProgressRepository } from "./teacher-progress.repository.js";
import { TeacherProgressService } from "./teacher-progress.service.js";

/**
 * The teacher's own read surfaces: one class's solution history, and the
 * academy-wide overview above it.
 *
 * Deliberately separate from `MonitoringModule`: live monitoring needs Redis,
 * sockets, and a rollout flag, and none of that may become a precondition for
 * reading progress. The two share the assigned-class predicate in
 * `classes/assigned-class-access.ts` and nothing else.
 *
 * `MonitoringRevocationModule` is imported for its Redis handle alone, which
 * the activity accumulator uses to hold one open interval per student. That
 * handle resolves to null without a configured Redis, so the accumulator keeps
 * counting in process memory and every durable read is unaffected.
 *
 * The accumulator is exported because the monitoring gateway is its only
 * producer: heartbeats arrive there, and counted time is written here.
 *
 * `PointsModule` is imported for `PointAwardService`, which the accumulator
 * calls from inside the flush transaction so a student's counted day and what
 * it earned are written together. The dependency runs one way only: nothing in
 * `PointsModule` imports anything from here, and the award service holds no
 * authorization of its own.
 */
@Module({
  imports: [AuthorizationModule, MonitoringRevocationModule, PointsModule],
  providers: [
    LearningActivityAccumulator,
    TeacherProgressAccessService,
    TeacherProgressRepository,
    TeacherProgressService,
    TeacherOverviewAccessService,
    TeacherOverviewRepository,
    TeacherOverviewService,
    TeacherStudentsService,
  ],
  exports: [
    TeacherProgressService,
    TeacherOverviewService,
    TeacherStudentsService,
    LearningActivityAccumulator,
    // §7.4 of the manager control tower design: the manager surfaces are a
    // second adapter at this seam and reuse the measurement rather than
    // reimplementing it. The repositories are scope-driven and hold no
    // authorization of their own, which is what makes exporting them safe —
    // `TeacherOverviewAccessService` deliberately stays unexported.
    TeacherOverviewRepository,
    TeacherProgressRepository,
  ],
})
export class TeachModule {}
