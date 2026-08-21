import { Module } from "@nestjs/common";

import { AuthorizationModule } from "../authorization/authorization.module.js";
import { TeachModule } from "../teach/teach.module.js";
import { LeadScopeService } from "./lead-scope.service.js";
import { TeamLeadOverviewRepository } from "./team-lead-overview.repository.js";
import { TeamLeadOverviewService } from "./team-lead-overview.service.js";

/**
 * The Team Lead's read surface, completing the set: `learn` for a student,
 * `teach` for a teacher, `manage` for a manager, and this for the fourth role.
 *
 * `TeachModule` is imported for its analytics repository and nothing else — the
 * same seam the manager module uses, for the same reason. The measurement code
 * is *used* here rather than reimplemented, so a problem reported as hardest on
 * a teacher's page, a manager's, and this one is hardest by one definition.
 * `TeacherOverviewAccessService` is deliberately not among the imports: this
 * module cannot reach a teacher-scoped read even by accident.
 *
 * No controller and no mutation. Everything a Team Lead does from this page —
 * editing a course, showing a lecture, assigning a teacher — already has an
 * endpoint with its own authorization.
 */
@Module({
  imports: [AuthorizationModule, TeachModule],
  providers: [
    LeadScopeService,
    TeamLeadOverviewRepository,
    TeamLeadOverviewService,
  ],
  exports: [TeamLeadOverviewService],
})
export class LeadModule {}
