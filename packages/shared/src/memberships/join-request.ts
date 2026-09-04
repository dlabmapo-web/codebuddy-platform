import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";
import { signupKindSchema, type SignupKind } from "../auth/session.js";

/**
 * What an application says it is asking to be.
 *
 * The same two answers `signupKindSchema` collects at signup, because it is
 * the same question asked at the same moment — the choice travels from the
 * form onto the request so the lobby can show the right empty navigation while
 * the applicant waits.
 *
 * Aliased rather than redeclared so the two can never drift apart. It stays a
 * hint: no permission, role or review decision reads it.
 */
export const joinRequestKindSchema = signupKindSchema;
export type JoinRequestKind = SignupKind;

export const createAcademyJoinRequestSchema = z.object({
  academyId: z.uuid(),
  message: z.string().trim().max(1_000).optional(),
  /**
   * Absent when an existing applicant reapplies from the pending screen, where
   * the kind of the request being replaced is what carries over.
   */
  kind: joinRequestKindSchema.optional(),
});
export type CreateAcademyJoinRequest = z.infer<
  typeof createAcademyJoinRequestSchema
>;

export const cancelAcademyJoinRequestSchema = z.object({
  requestId: z.uuid(),
});

export const reviewAcademyJoinRequestSchema = z.discriminatedUnion("decision", [
  z.object({
    academyId: z.uuid(),
    requestId: z.uuid(),
    decision: z.literal("APPROVE"),
    role: academyRoleSchema,
    reason: z.string().trim().max(1_000).optional(),
  }),
  z.object({
    academyId: z.uuid(),
    requestId: z.uuid(),
    decision: z.literal("REJECT"),
    reason: z.string().trim().min(1).max(1_000),
  }),
]);
export type ReviewAcademyJoinRequest = z.infer<
  typeof reviewAcademyJoinRequestSchema
>;
