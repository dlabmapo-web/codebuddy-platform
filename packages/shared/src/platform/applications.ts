import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";
import { joinRequestStatusSchema } from "../memberships/status.js";
import { memberAvatarUrlsShape } from "../profile/avatar.js";

/**
 * Everyone waiting to be let into an academy, across every academy.
 *
 * A read, and only a read. Approving one calls `academyJoinRequests.review` —
 * the same procedure a manager's own Applications page calls, with the same
 * role ceiling and the same audit record — because a second implementation of
 * seating a member would run under different authorization and its bugs would
 * never show on the academy's own screens.
 *
 * ## Why the console needs this at all
 *
 * An application is reviewed behind `academy.applications.review`, which
 * `MANAGER` and `TEAM_LEAD` hold and nobody else does. An academy created with
 * nobody in it has neither role, so its applicants wait in a queue no human on
 * the platform is permitted to open — including the operator who made the
 * academy. This surface is that queue, and `academyHasManager` is the field
 * that says which rows are in it for that reason.
 */

export const platformApplicationSchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  academyName: z.string().min(1),
  academySlug: z.string().min(1),
  user: z.object({
    id: z.uuid(),
    email: z.email().nullable(),
    displayName: z.string().nullable(),
    ...memberAvatarUrlsShape,
  }),
  message: z.string().nullable(),
  status: joinRequestStatusSchema,
  approvedRole: academyRoleSchema.nullable(),
  reviewReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
  /**
   * False when this academy has no active manager.
   *
   * Computed on the server from the same predicate every other console surface
   * uses to call an academy leaderless, and carried on the row rather than
   * derived in the browser: it decides how the row is ordered and how it is
   * coloured, and a client that recomputed it would be a second definition of
   * the word.
   */
  academyHasManager: z.boolean(),
});
export type PlatformApplication = z.infer<typeof platformApplicationSchema>;

export const PLATFORM_APPLICATIONS_PAGE_SIZE = 25;

export const platformApplicationSortKeys = ["waiting", "academy"] as const;
export const platformApplicationSortKeySchema = z.enum(
  platformApplicationSortKeys,
);
export type PlatformApplicationSortKey =
  (typeof platformApplicationSortKeys)[number];

export const listPlatformApplicationsInputSchema = z.object({
  /** Matches the applicant's display name or email. */
  query: z.string().trim().max(120).optional(),
  academyIds: z.array(z.uuid()).max(50).optional(),
  /**
   * Defaulted to pending rather than left empty.
   *
   * The queue's job is what is still waiting. A reviewed application stays one
   * facet chip away, because an operator asked "what happened to my
   * application" has to be able to find a rejection.
   */
  statuses: z.array(joinRequestStatusSchema).max(4).optional(),
  /** Only academies with no active manager — the rows nobody else can clear. */
  leaderlessOnly: z.boolean().optional(),
  sort: platformApplicationSortKeySchema.default("waiting"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  page: z.number().int().min(1).default(1),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(PLATFORM_APPLICATIONS_PAGE_SIZE),
});
export type ListPlatformApplicationsInput = z.input<
  typeof listPlatformApplicationsInputSchema
>;
export type ResolvedListPlatformApplicationsInput = z.infer<
  typeof listPlatformApplicationsInputSchema
>;

/**
 * What the queue is, before a single row is read.
 *
 * `waiting` is the size of it. `leaderless` is the part that will still be
 * there tomorrow if the operator closes the tab — the applications with no
 * manager to review them. The second number is the reason this page exists,
 * and when it reaches zero the page is saying something true and pleasant:
 * every waiting applicant has somebody who can seat them.
 *
 * Both counts ignore paging and the search box, and follow the academy facet,
 * for the reason the content browser's summary does: an operator narrowed to
 * one academy is being shown that academy's queue.
 */
export const platformApplicationsSummarySchema = z.object({
  waiting: z.number().int().nonnegative(),
  leaderless: z.number().int().nonnegative(),
  /** Academies with at least one waiting applicant. The denominator. */
  academies: z.number().int().nonnegative(),
});
export type PlatformApplicationsSummary = z.infer<
  typeof platformApplicationsSummarySchema
>;

export const listPlatformApplicationsResultSchema = z.object({
  rows: z.array(platformApplicationSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  summary: platformApplicationsSummarySchema,
  /** Every academy with something in the queue, for the facet. */
  academyOptions: z.array(
    z.object({
      id: z.uuid(),
      name: z.string().min(1),
      slug: z.string().min(1),
    }),
  ),
});
export type ListPlatformApplicationsResult = z.infer<
  typeof listPlatformApplicationsResultSchema
>;
