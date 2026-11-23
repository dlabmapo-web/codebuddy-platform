import { Module } from "@nestjs/common";

import { AcademiesModule } from "../academies/academies.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { LearnModule } from "../learn/learn.module.js";
import { ManualModule } from "../manual/manual.module.js";
import { ExamStaffService } from "./exam-staff.service.js";
import { ExamService } from "./exam.service.js";

/** Exams (테스트). Submissions go through the existing submit paths. */
@Module({
  imports: [AcademiesModule, AuthorizationModule, LearnModule, ManualModule],
  providers: [ExamService, ExamStaffService],
  exports: [ExamService, ExamStaffService],
})
export class ExamModule {}
