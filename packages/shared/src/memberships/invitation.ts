import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";
import { invitationStatusSchema } from "./status.js";

export const createAcademyInvitationSchema = z.object({
  academyId: z.uuid(),
  email: z.email().transform((email) => email.trim().toLowerCase()),
  role: academyRoleSchema,
});
export type CreateAcademyInvitation = z.infer<
  typeof createAcademyInvitationSchema
>;

export const academyInvitationSchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  email: z.email(),
  role: academyRoleSchema,
  status: invitationStatusSchema,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export const acceptAcademyInvitationSchema = z.object({
  token: z.string().min(32).max(512),
});

export const previewAcademyInvitationSchema = acceptAcademyInvitationSchema;

/**
 * What an invitation says about itself before anybody has signed in.
 *
 * Read by whoever holds the token, so it names the academy, the role, and —
 * the part that matters — the address the invitation was sent to. Without it
 * the recipient has to guess which of their addresses to use, and a guess that
 * misses is only discovered after an account has already been created under
 * the wrong one.
 *
 * It carries no ids beyond the academy's and nothing about the inviter: the
 * token proves possession of a link, not membership of anything.
 */
export const academyInvitationPreviewSchema = z.object({
  academyId: z.uuid(),
  academyName: z.string(),
  email: z.email(),
  role: academyRoleSchema,
  expiresAt: z.iso.datetime(),
});
export type AcademyInvitationPreview = z.infer<
  typeof academyInvitationPreviewSchema
>;

export const revokeAcademyInvitationSchema = z.object({
  academyId: z.uuid(),
  invitationId: z.uuid(),
});
