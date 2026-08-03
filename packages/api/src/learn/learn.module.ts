import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AcademiesModule } from "../academies/academies.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { JudgeQueue } from "../judge/judge.queue.js";
import { LearnService } from "./learn.service.js";
import { SubmissionController } from "./submission.controller.js";
import { SubmissionService } from "./submission.service.js";

/**
 * `JudgeQueue` is provided as a producer only — the API enqueues and never
 * constructs a `Worker`. It resolves to null without `REDIS_URL`, so the API
 * boots and every read keeps working when grading is unavailable.
 */
@Module({
  imports: [AcademiesModule, AuthModule, AuthorizationModule],
  controllers: [SubmissionController],
  providers: [
    LearnService,
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
  exports: [LearnService, SubmissionService, JudgeQueue],
})
export class LearnModule {}
