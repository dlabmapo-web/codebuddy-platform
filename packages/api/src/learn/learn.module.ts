import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AcademiesModule } from "../academies/academies.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { PointsModule } from "../points/points.module.js";
import { TeachModule } from "../teach/teach.module.js";
import { JudgeQueue } from "../judge/judge.queue.js";
import { AnswerRecordsService } from "./answer-records.service.js";
import { CurriculumOutlineService } from "./curriculum-outline.service.js";
import { LearnClassService } from "./learn-class.service.js";
import { LearnService } from "./learn.service.js";
import { StudentOverviewAccessService } from "./student-overview-access.service.js";
import { StudentOverviewRepository } from "./student-overview.repository.js";
import { StudentOverviewService } from "./student-overview.service.js";
import { SubmissionController } from "./submission.controller.js";
import { SubmissionService } from "./submission.service.js";

/**
 * `JudgeQueue` is provided as a producer only — the API enqueues and never
 * constructs a `Worker`. It resolves to null without `REDIS_URL`, so the API
 * boots and every read keeps working when grading is unavailable.
 */
@Module({
  // `TeachModule` is imported for `TeacherProgressRepository` alone. The
  // student overview suggests the same exercises a teacher is told to check,
  // and §7.8 requires one rule for both — the repository holds no
  // authorization of its own, which is what makes the seam safe to cross.
  // `PointsModule` is imported for the overview's points card alone. §6.1 —
  // the card is computed by the points service rather than reimplemented, so
  // it can never disagree with the board it links to.
  imports: [
    AcademiesModule,
    AuthModule,
    AuthorizationModule,
    PointsModule,
    TeachModule,
  ],
  controllers: [SubmissionController],
  providers: [
    AnswerRecordsService,
    CurriculumOutlineService,
    LearnClassService,
    LearnService,
    StudentOverviewAccessService,
    StudentOverviewRepository,
    StudentOverviewService,
    SubmissionService,
    {
      provide: JudgeQueue,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>("REDIS_URL");
        return url ? new JudgeQueue(url) : null;
      },
    },
  ],
  // The outline builder is exported because monitoring reads a student's
  // curriculum through it. Two implementations of "what a course looks like"
  // is exactly what the teacher's navigator must not introduce.
  exports: [
    AnswerRecordsService,
    CurriculumOutlineService,
    LearnClassService,
    LearnService,
    StudentOverviewService,
    SubmissionService,
    JudgeQueue,
  ],
})
export class LearnModule {}
