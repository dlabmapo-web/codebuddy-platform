import { randomUUID, timingSafeEqual } from "node:crypto";

import type { implement } from "@orpc/server";
import type { Request } from "express";
import type { appContract } from "@cove/shared";

import type { AuthService } from "../auth/auth.service.js";
import type { OAuthOnboardingIntentService } from "../auth/oauth-onboarding-intent.service.js";
import type { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import type { AcademyDiscoveryService } from "../academies/academy-discovery.service.js";
import type { AcademyInvitationService } from "../academies/academy-invitation.service.js";
import type { AcademyJoinRequestService } from "../academies/academy-join-request.service.js";
import type { AcademyMembershipService } from "../academies/academy-membership.service.js";
import type { AcademyOnboardingService } from "../academies/academy-onboarding.service.js";
import type { RateLimitService } from "../academies/rate-limit.service.js";
import type { ClassesService } from "../classes/classes.service.js";
import type { CourseService } from "../content/course.service.js";
import type { LearnService } from "../learn/learn.service.js";
import type { SubmissionService } from "../learn/submission.service.js";
import type { MonitoringService } from "../monitoring/monitoring.service.js";

export type ORPCContext = { req: Request };
export type ORPCImplementer = ReturnType<
  typeof implement<typeof appContract, ORPCContext>
>;

export type ORPCDeps = {
  authService: AuthService;
  oauthOnboardingIntentService: OAuthOnboardingIntentService;
  supabaseAuthService: SupabaseAuthService;
  academyDiscoveryService: AcademyDiscoveryService;
  academyInvitationService: AcademyInvitationService;
  academyJoinRequestService: AcademyJoinRequestService;
  academyMembershipService: AcademyMembershipService;
  academyOnboardingService: AcademyOnboardingService;
  rateLimitService: RateLimitService;
  courseService: CourseService;
  classesService: ClassesService;
  learnService: LearnService;
  submissionService: SubmissionService;
  monitoringService: MonitoringService;
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
