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
import { AuthService } from "../auth/auth.service.js";
import { OAuthOnboardingIntentService } from "../auth/oauth-onboarding-intent.service.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { StudentSessionService } from "../auth/student-session.service.js";
import { createStudentSessionRouter } from "../auth/student-session.router.js";
import { createAuthRouter } from "../auth/auth.router.js";
import { ClassesService } from "../classes/classes.service.js";
import { createClassesRouters } from "../classes/classes.router.js";
import { CourseService } from "../content/course.service.js";
import { createContentRouters } from "../content/content.router.js";
import { AnswerRecordsService } from "../learn/answer-records.service.js";
import { LearnClassService } from "../learn/learn-class.service.js";
import { LearnService } from "../learn/learn.service.js";
import { SubmissionService } from "../learn/submission.service.js";
import { createLearnRouter } from "../learn/learn.router.js";
import { MonitoringService } from "../monitoring/monitoring.service.js";
import { createMonitoringRouter } from "../monitoring/monitoring.router.js";
import { AcademyProfileService } from "../profile/academy-profile.service.js";
import { ProfileService } from "../profile/profile.service.js";
import { createProfileRouters } from "../profile/profile.router.js";
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
    authService: app.get(AuthService, { strict: false }),
    oauthOnboardingIntentService: app.get(OAuthOnboardingIntentService, {
      strict: false,
    }),
    supabaseAuthService: app.get(SupabaseAuthService, { strict: false }),
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
    academyOnboardingService: app.get(AcademyOnboardingService, {
      strict: false,
    }),
    rateLimitService: app.get(RateLimitService, { strict: false }),
    courseService: app.get(CourseService, { strict: false }),
    classesService: app.get(ClassesService, { strict: false }),
    answerRecordsService: app.get(AnswerRecordsService, { strict: false }),
    learnClassService: app.get(LearnClassService, { strict: false }),
    learnService: app.get(LearnService, { strict: false }),
    submissionService: app.get(SubmissionService, { strict: false }),
    monitoringService: app.get(MonitoringService, { strict: false }),
    profileService: app.get(ProfileService, { strict: false }),
    academyProfileService: app.get(AcademyProfileService, { strict: false }),
    teacherProgressService: app.get(TeacherProgressService, { strict: false }),
    teacherOverviewService: app.get(TeacherOverviewService, { strict: false }),
    teacherStudentsService: app.get(TeacherStudentsService, { strict: false }),
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
  return os.router({
    auth: createAuthRouter(os, deps),
    studentSession: createStudentSessionRouter(os, deps),
    ...academyRouters,
    ...contentRouters,
    ...classesRouters,
    ...profileRouters,
    learn: createLearnRouter(os, deps),
    monitoring: createMonitoringRouter(os, deps),
    teacherProgress: createTeacherProgressRouter(os, deps),
    academyTeacherOverview: createAcademyTeacherOverviewRouter(os, deps),
    academyTeacherStudents: createAcademyTeacherStudentsRouter(os, deps),
  });
}
