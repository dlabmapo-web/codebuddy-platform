import { randomUUID, timingSafeEqual } from "node:crypto";

import type { implement } from "@orpc/server";
import type { Request } from "express";
import type { appContract } from "@cove/shared";

import type { AuthService } from "../auth/auth.service.js";
import type { OAuthOnboardingIntentService } from "../auth/oauth-onboarding-intent.service.js";
import type { PasswordRecoveryService } from "../auth/password-recovery.service.js";
import type { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import type { StudentSessionService } from "../auth/student-session.service.js";
import type { AcademyDiscoveryService } from "../academies/academy-discovery.service.js";
import type { AcademyInvitationService } from "../academies/academy-invitation.service.js";
import type { AcademyJoinRequestService } from "../academies/academy-join-request.service.js";
import type { AcademyMembershipService } from "../academies/academy-membership.service.js";
import type { AcademyOnboardingService } from "../academies/academy-onboarding.service.js";
import type { RateLimitService } from "../academies/rate-limit.service.js";
import type { ClassesService } from "../classes/classes.service.js";
import type { ContentImportService } from "../content/import/content-import.service.js";
import type { CourseService } from "../content/course.service.js";
import type { AnswerRecordsService } from "../learn/answer-records.service.js";
import type { LearnClassService } from "../learn/learn-class.service.js";
import type { LearnService } from "../learn/learn.service.js";
import type { StudentOverviewService } from "../learn/student-overview.service.js";
import type { SubmissionService } from "../learn/submission.service.js";
import type { AcademyOperationsProfileService } from "../manage/academy-profile.service.js";
import type { InvitationDeliveryService } from "../manage/invitation-delivery.service.js";
import type { PeopleBulkService } from "../manage/people-bulk.service.js";
import type { PeopleImportService } from "../manage/people-import.service.js";
import type { ManagerOverviewService } from "../manage/manager-overview.service.js";
import type { PeopleDirectoryService } from "../manage/people-directory.service.js";
import type { MonitoringService } from "../monitoring/monitoring.service.js";
import type { PlatformAcademyService } from "../platform/platform-academy.service.js";
import type { PointsService } from "../points/points.service.js";
import type { PlatformLifecycleService } from "../platform/platform-lifecycle.service.js";
import type { AcademyProfileService } from "../profile/academy-profile.service.js";
import type { ProfileService } from "../profile/profile.service.js";
import type { TeamLeadOverviewService } from "../lead/team-lead-overview.service.js";
import type { TeacherOverviewService } from "../teach/teacher-overview.service.js";
import type { TeacherStudentsService } from "../teach/teacher-students.service.js";
import type { TeacherProgressService } from "../teach/teacher-progress.service.js";

export type ORPCContext = { req: Request };
export type ORPCImplementer = ReturnType<
  typeof implement<typeof appContract, ORPCContext>
>;

export type ORPCDeps = {
  authService: AuthService;
  oauthOnboardingIntentService: OAuthOnboardingIntentService;
  passwordRecoveryService: PasswordRecoveryService;
  supabaseAuthService: SupabaseAuthService;
  studentSessionService: StudentSessionService;
  academyDiscoveryService: AcademyDiscoveryService;
  academyInvitationService: AcademyInvitationService;
  academyJoinRequestService: AcademyJoinRequestService;
  academyMembershipService: AcademyMembershipService;
  academyOnboardingService: AcademyOnboardingService;
  rateLimitService: RateLimitService;
  courseService: CourseService;
  contentImportService: ContentImportService;
  classesService: ClassesService;
  answerRecordsService: AnswerRecordsService;
  learnClassService: LearnClassService;
  learnService: LearnService;
  studentOverviewService: StudentOverviewService;
  submissionService: SubmissionService;
  monitoringService: MonitoringService;
  profileService: ProfileService;
  academyProfileService: AcademyProfileService;
  teacherProgressService: TeacherProgressService;
  teacherOverviewService: TeacherOverviewService;
  teamLeadOverviewService: TeamLeadOverviewService;
  teacherStudentsService: TeacherStudentsService;
  managerOverviewService: ManagerOverviewService;
  academyOperationsProfileService: AcademyOperationsProfileService;
  peopleDirectoryService: PeopleDirectoryService;
  peopleImportService: PeopleImportService;
  peopleBulkService: PeopleBulkService;
  invitationDeliveryService: InvitationDeliveryService;
  platformAcademyService: PlatformAcademyService;
  platformLifecycleService: PlatformLifecycleService;
  pointsService: PointsService;
};

export function requestAddress(req: Request): string {
  const sharedSecret = process.env.BFF_SHARED_SECRET;
  const suppliedSecret = singleHeader(req.headers["x-cove-bff-secret"]);
  const forwardedAddress = singleHeader(req.headers["x-cove-client-ip"]);
  if (
    sharedSecret &&
    suppliedSecret &&
    forwardedAddress &&
    safeEqual(sharedSecret, suppliedSecret)
  ) {
    return forwardedAddress.slice(0, 128);
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function requestId(req: Request): string {
  return singleHeader(req.headers["x-request-id"])?.slice(0, 128) ??
    randomUUID();
}

function singleHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function safeEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer);
}

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

/** A mutation that may only originate from Cove's server-side auth flow. */
export function isTrustedBffRequest(req: Request): boolean {
  const expected = process.env.BFF_SHARED_SECRET;
  const supplied = singleHeader(req.headers["x-cove-bff-secret"]);
  if (expected) return Boolean(supplied && safeEqual(expected, supplied));

  // Production configuration requires the secret. Local development keeps the
  // same boundary by accepting only the loopback call from the Next server.
  if (process.env.NODE_ENV === "production") return false;
  const address = req.ip || req.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" ||
    address === "::ffff:127.0.0.1";
}
