import type { NestExpressApplication } from "@nestjs/platform-express";
import { implement } from "@orpc/server";
import { RPCHandler } from "@orpc/server/node";
import type { NextFunction, Request, Response } from "express";
import { appContract } from "@cove/shared";

import { AcademyDiscoveryService } from "../academies/academy-discovery.service.js";
import { AcademyInvitationService } from "../academies/academy-invitation.service.js";
import { AcademyJoinRequestService } from "../academies/academy-join-request.service.js";
import { AcademyMembershipService } from "../academies/academy-membership.service.js";
import { AcademyOnboardingService } from "../academies/academy-onboarding.service.js";
import { createAcademiesRouters } from "../academies/academies.router.js";
import { RateLimitService } from "../academies/rate-limit.service.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AuthService } from "../auth/auth.service.js";
import { OAuthOnboardingIntentService } from "../auth/oauth-onboarding-intent.service.js";
import { PasswordRecoveryService } from "../auth/password-recovery.service.js";
import { TurnstileService } from "../auth/turnstile.service.js";
import { StudentCredentialService } from "../academies/student-credential.service.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { StudentSessionService } from "../auth/student-session.service.js";
import { createStudentSessionRouter } from "../auth/student-session.router.js";
import { createAuthRouter } from "../auth/auth.router.js";
import { ClassesService } from "../classes/classes.service.js";
import { createClassesRouters } from "../classes/classes.router.js";
import { CourseService } from "../content/course.service.js";
import { createContentRouters } from "../content/content.router.js";
import { ContentImportService } from "../content/import/content-import.service.js";
import { AnswerRecordsService } from "../learn/answer-records.service.js";
import { LearnClassService } from "../learn/learn-class.service.js";
import { LearnService } from "../learn/learn.service.js";
import { StudentOverviewService } from "../learn/student-overview.service.js";
import { SubmissionService } from "../learn/submission.service.js";
import { createLearnRouter } from "../learn/learn.router.js";
import { AcademyFeaturesService } from "../manage/academy-features.service.js";
import { createAcademyFeaturesRouter } from "../manage/academy-features.router.js";
import { AcademyOperationsProfileService } from "../manage/academy-profile.service.js";
import { InvitationDeliveryService } from "../manage/invitation-delivery.service.js";
import { PeopleBulkService } from "../manage/people-bulk.service.js";
import { PeopleImportService } from "../manage/people-import.service.js";
import { ManagerOverviewService } from "../manage/manager-overview.service.js";
import { PeopleDirectoryService } from "../manage/people-directory.service.js";
import { createManageRouters } from "../manage/manage.router.js";
import { MonitoringService } from "../monitoring/monitoring.service.js";
import { createMonitoringRouter } from "../monitoring/monitoring.router.js";
import { PlatformAcademyService } from "../platform/platform-academy.service.js";
import { PlatformLifecycleService } from "../platform/platform-lifecycle.service.js";
import { PlatformUsersService } from "../platform/platform-users.service.js";
import { PlatformAuditService } from "../platform/platform-audit.service.js";
import { createPlatformAuditRouters } from "../platform/platform-audit.router.js";
import { PlatformApplicationsService } from "../platform/platform-applications.service.js";
import { PlatformContentService } from "../platform/platform-content.service.js";
import { PlatformLibraryService } from "../platform/platform-library.service.js";
import { AcademyLibraryService } from "../content/library/academy-library.service.js";
import { createPlatformApplicationsRouters } from "../platform/platform-applications.router.js";
import { createPlatformContentRouters } from "../platform/platform-content.router.js";
import { PlatformInvitationsService } from "../platform/platform-invitations.service.js";
import { PlatformRankingService } from "../platform/platform-ranking.service.js";
import { createPlatformInvitationsRouters } from "../platform/platform-invitations.router.js";
import { createPlatformRankingRouters } from "../platform/platform-ranking.router.js";
import { createPlatformUsersRouters } from "../platform/platform-users.router.js";
import { PlatformSupportService } from "../platform/platform-support.service.js";
import { createPlatformSupportRouters } from "../platform/platform-support.router.js";
import { createPlatformRouters } from "../platform/platform.router.js";
import { createPlatformLibraryRouters } from "../platform/platform-library.router.js";
import { createAcademyLibraryRouters } from "../content/library/academy-library.router.js";
import { PointsService } from "../points/points.service.js";
import { createPointsRouter } from "../points/points.router.js";
import { AcademyProfileService } from "../profile/academy-profile.service.js";
import { ProfileService } from "../profile/profile.service.js";
import { createProfileRouters } from "../profile/profile.router.js";
import { TeamLeadOverviewService } from "../lead/team-lead-overview.service.js";
import { createAcademyCurriculumOverviewRouter } from "../lead/lead.router.js";
import { TeacherOverviewService } from "../teach/teacher-overview.service.js";
import { createAcademyTeacherOverviewRouter } from "../teach/teacher-overview.router.js";
import { TeacherStudentsService } from "../teach/teacher-students.service.js";
import { createAcademyTeacherStudentsRouter } from "../teach/teacher-students.router.js";
import { TeacherProgressService } from "../teach/teacher-progress.service.js";
import { createTeacherProgressRouter } from "../teach/teacher-progress.router.js";
import type { ORPCContext, ORPCDeps } from "./context.js";
import { toORPCError } from "./error-mapping.js";

export function registerORPCRoutes(app: NestExpressApplication): void {
  const router = createORPCRouter({
    academyAccessService: app.get(AcademyAccessService, { strict: false }),
    authService: app.get(AuthService, { strict: false }),
    oauthOnboardingIntentService: app.get(OAuthOnboardingIntentService, {
      strict: false,
    }),
    passwordRecoveryService: app.get(PasswordRecoveryService, {
      strict: false,
    }),
    supabaseAuthService: app.get(SupabaseAuthService, { strict: false }),
    turnstileService: app.get(TurnstileService, { strict: false }),
    studentSessionService: app.get(StudentSessionService, { strict: false }),
    academyDiscoveryService: app.get(AcademyDiscoveryService, { strict: false }),
    academyInvitationService: app.get(AcademyInvitationService, {
      strict: false,
    }),
    academyJoinRequestService: app.get(AcademyJoinRequestService, {
      strict: false,
    }),
    academyMembershipService: app.get(AcademyMembershipService, {
      strict: false,
    }),
    studentCredentialService: app.get(StudentCredentialService, {
      strict: false,
    }),
    academyOnboardingService: app.get(AcademyOnboardingService, {
      strict: false,
    }),
    rateLimitService: app.get(RateLimitService, { strict: false }),
    courseService: app.get(CourseService, { strict: false }),
    contentImportService: app.get(ContentImportService, { strict: false }),
    classesService: app.get(ClassesService, { strict: false }),
    answerRecordsService: app.get(AnswerRecordsService, { strict: false }),
    learnClassService: app.get(LearnClassService, { strict: false }),
    learnService: app.get(LearnService, { strict: false }),
    studentOverviewService: app.get(StudentOverviewService, { strict: false }),
    submissionService: app.get(SubmissionService, { strict: false }),
    monitoringService: app.get(MonitoringService, { strict: false }),
    profileService: app.get(ProfileService, { strict: false }),
    academyProfileService: app.get(AcademyProfileService, { strict: false }),
    teacherProgressService: app.get(TeacherProgressService, { strict: false }),
    teacherOverviewService: app.get(TeacherOverviewService, { strict: false }),
    teamLeadOverviewService: app.get(TeamLeadOverviewService, { strict: false }),
    teacherStudentsService: app.get(TeacherStudentsService, { strict: false }),
    managerOverviewService: app.get(ManagerOverviewService, { strict: false }),
    academyFeaturesService: app.get(AcademyFeaturesService, { strict: false }),
    academyOperationsProfileService: app.get(AcademyOperationsProfileService, {
      strict: false,
    }),
    peopleDirectoryService: app.get(PeopleDirectoryService, { strict: false }),
    peopleImportService: app.get(PeopleImportService, { strict: false }),
    peopleBulkService: app.get(PeopleBulkService, { strict: false }),
    invitationDeliveryService: app.get(InvitationDeliveryService, {
      strict: false,
    }),
    platformAcademyService: app.get(PlatformAcademyService, { strict: false }),
    platformAuditService: app.get(PlatformAuditService, { strict: false }),
    platformApplicationsService: app.get(PlatformApplicationsService, {
      strict: false,
    }),
    platformLibraryService: app.get(PlatformLibraryService, { strict: false }),
    academyLibraryService: app.get(AcademyLibraryService, { strict: false }),
    platformContentService: app.get(PlatformContentService, {
      strict: false,
    }),
    platformInvitationsService: app.get(PlatformInvitationsService, {
      strict: false,
    }),
    platformRankingService: app.get(PlatformRankingService, {
      strict: false,
    }),
    platformUsersService: app.get(PlatformUsersService, { strict: false }),
    platformSupportService: app.get(PlatformSupportService, {
      strict: false,
    }),
    pointsService: app.get(PointsService, { strict: false }),
    platformLifecycleService: app.get(PlatformLifecycleService, {
      strict: false,
    }),
  });
  const handler = new RPCHandler(router, {
    interceptors: [
      async (options) => {
        try {
          return await options.next();
        } catch (error) {
          throw toORPCError(error);
        }
      },
    ],
  });

  app.use(
    "/api/rpc{/*path}",
    async (req: Request, res: Response, next: NextFunction) => {
      const { matched } = await handler.handle(req, res, {
        prefix: "/api/rpc",
        context: { req },
      });
      if (!matched) next();
    },
  );
}

function createORPCRouter(deps: ORPCDeps) {
  const os = implement<typeof appContract, ORPCContext>(appContract);
  const academyRouters = createAcademiesRouters(os, deps);
  const contentRouters = createContentRouters(os, deps);
  const classesRouters = createClassesRouters(os, deps);
  const profileRouters = createProfileRouters(os, deps);
  const manageRouters = createManageRouters(os, deps);
  const platformRouters = createPlatformRouters(os, deps);
  const platformUsersRouters = createPlatformUsersRouters(os, deps);
  const platformAuditRouters = createPlatformAuditRouters(os, deps);
  const platformApplicationsRouters = createPlatformApplicationsRouters(os, deps);
  const platformContentRouters = createPlatformContentRouters(os, deps);
  const platformLibraryRouters = createPlatformLibraryRouters(os, deps);
  const academyLibraryRouters = createAcademyLibraryRouters(os, deps);
  const platformInvitationsRouters = createPlatformInvitationsRouters(os, deps);
  const platformRankingRouters = createPlatformRankingRouters(os, deps);
  const platformSupportRouters = createPlatformSupportRouters(os, deps);
  return os.router({
    auth: createAuthRouter(os, deps),
    studentSession: createStudentSessionRouter(os, deps),
    academyFeatures: createAcademyFeaturesRouter(os, deps),
    ...academyRouters,
    ...contentRouters,
    ...classesRouters,
    ...profileRouters,
    ...manageRouters,
    ...platformRouters,
    ...platformUsersRouters,
    ...platformAuditRouters,
    ...platformApplicationsRouters,
    ...platformContentRouters,
    ...platformLibraryRouters,
    ...academyLibraryRouters,
    ...platformInvitationsRouters,
    ...platformRankingRouters,
    ...platformSupportRouters,
    learn: createLearnRouter(os, deps),
    points: createPointsRouter(os, deps),
    monitoring: createMonitoringRouter(os, deps),
    teacherProgress: createTeacherProgressRouter(os, deps),
    academyCurriculumOverview: createAcademyCurriculumOverviewRouter(os, deps),
    academyTeacherOverview: createAcademyTeacherOverviewRouter(os, deps),
    academyTeacherStudents: createAcademyTeacherStudentsRouter(os, deps),
  });
}
