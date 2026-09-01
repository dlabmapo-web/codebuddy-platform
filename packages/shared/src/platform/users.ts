import { z } from "zod";

import {
  academyRoles,
  academyRoleSchema,
  platformRoles,
  platformRoleSchema,
} from "../auth/roles.js";
import { userStatuses, userStatusSchema } from "../auth/session.js";
import { invitationDeliveryStateSchema } from "../memberships/invitation-delivery.js";
import {
  invitationStatusSchema,
  joinRequestStatusSchema,
  membershipStatuses,
  membershipStatusSchema,
} from "../memberships/status.js";

/**
 * The platform's view of a person, across every academy.
 *
 * The row is the **account**, not the membership — which is the whole
 * difference from the per-academy directory. Somebody who teaches at two
 * campuses is one row here with two academy chips, and two rows there. That is
 * why this is a sibling of `PeopleDirectoryService` rather than a flag on it:
 * the two answer different questions and neither's query can produce the
 * other's row.
 *
 * Nothing in this file describes learning. No submission, no grade, no point
 * balance, and no field of `StudentAcademyProfile` — guardian names, phone
 * numbers, dates of birth belong to children and stay behind a support grant.
 * §3.6 of the platform admin console design: the difference between a
 * directory and a data leak is that the directory stops at identity.
 */

/* --------------------------------------------------------------- reading */

/** One academy this person belongs to, as the directory prints it. */
export const platformUserMembershipSchema = z.object({
  academyId: z.uuid(),
  academySlug: z.string().min(1),
  academyName: z.string().min(1),
  role: academyRoleSchema,
  status: membershipStatusSchema,
  joinedAt: z.iso.datetime().nullable(),
});
export type PlatformUserMembership = z.infer<
  typeof platformUserMembershipSchema
>;

export const platformUserSummarySchema = z.object({
  userId: z.uuid(),
  displayName: z.string().nullable(),
  username: z.string().nullable(),
  email: z.email().nullable(),
  avatarUrl: z.string().nullable(),
  status: userStatusSchema,
  platformRole: platformRoleSchema,
  createdAt: z.iso.datetime(),
  /**
   * Every academy, ordered by name. Capped in the service rather than here:
   * a person in forty academies is a real answer, and truncating it in the
   * schema would make the count on the row disagree with the chips beside it.
   */
  memberships: z.array(platformUserMembershipSchema),
});
export type PlatformUserSummary = z.infer<typeof platformUserSummarySchema>;

/* -------------------------------------------------------------- filtering */

export const PLATFORM_USERS_PAGE_SIZE = 25;
export const PLATFORM_USERS_MAX_PAGE_SIZE = 100;

/**
 * Which people the directory is being asked for.
 *
 * Every facet is a list rather than a single value, because an operator asks
 * "teachers and team leads" far more often than they ask for exactly one role,
 * and a single-value facet forces two searches to answer one question. An
 * absent or empty list means "do not narrow by this", never "narrow to
 * nothing" — the safe reading, and the one a cleared filter chip produces.
 */
export const listPlatformUsersInputSchema = z.object({
  /** Matched against email, username, display name, and the academy-local
   * student and employee numbers. */
  query: z.string().trim().max(120).optional(),
  academyIds: z.array(z.uuid()).max(50).optional(),
  roles: z.array(academyRoleSchema).optional(),
  membershipStatuses: z.array(membershipStatusSchema).optional(),
  accountStatuses: z.array(userStatusSchema).optional(),
  platformRoles: z.array(platformRoleSchema).optional(),
  /**
   * Only accounts belonging to no academy at all.
   *
   * Its own flag rather than a value inside `academyIds`, because it is not a
   * narrowing of which academies — it is the absence of one, and a sentinel
   * uuid would be a lie the database had to be taught to read.
   */
  unaffiliatedOnly: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(PLATFORM_USERS_MAX_PAGE_SIZE)
    .default(PLATFORM_USERS_PAGE_SIZE),
});
export type ListPlatformUsersInput = z.input<
  typeof listPlatformUsersInputSchema
>;
export type ResolvedListPlatformUsersInput = z.infer<
  typeof listPlatformUsersInputSchema
>;

export const listPlatformUsersResultSchema = z.object({
  people: z.array(platformUserSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  /** Every academy an operator may filter by, so the facet needs no second
   * call and cannot offer an academy the list can never contain. */
  academyOptions: z.array(
    z.object({
      id: z.uuid(),
      name: z.string().min(1),
      slug: z.string().min(1),
    }),
  ),
});
export type ListPlatformUsersResult = z.infer<
  typeof listPlatformUsersResultSchema
>;

/* ----------------------------------------------------------------- detail */

export const platformUserInvitationSchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  academyName: z.string().min(1),
  academySlug: z.string().min(1),
  email: z.email(),
  role: academyRoleSchema,
  status: invitationStatusSchema,
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  /**
   * What happened to the email. The answer to "the customer says they never
   * got it", which is the single most common reason this page is opened.
   */
  lastDelivery: z
    .object({
      state: invitationDeliveryStateSchema,
      /** The provider's own failure code, when it gave one. */
      failureCode: z.string().nullable(),
      occurredAt: z.iso.datetime(),
    })
    .nullable(),
});

export const platformUserJoinRequestSchema = z.object({
  id: z.uuid(),
  academyId: z.uuid(),
  academyName: z.string().min(1),
  academySlug: z.string().min(1),
  /** Null until somebody approves it and chooses the role. */
  approvedRole: academyRoleSchema.nullable(),
  status: joinRequestStatusSchema,
  createdAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
});

/**
 * One account in full.
 *
 * Four sections and deliberately no fifth. Linked sign-in providers are absent
 * because they live in Supabase Auth rather than in this database, and reading
 * them would mean an admin API call on a page that must stay cheap; when the
 * operator needs that, the Supabase dashboard already answers it.
 */
export const platformUserDetailSchema = platformUserSummarySchema.extend({
  invitations: z.array(platformUserInvitationSchema),
  joinRequests: z.array(platformUserJoinRequestSchema),
  lastSignInAt: z.iso.datetime().nullable(),
});
export type PlatformUserDetail = z.infer<typeof platformUserDetailSchema>;

/* --------------------------------------------------------------- mutation */

/**
 * The statuses an operator may set by hand.
 *
 * `PENDING_PROFILE` is absent: it is where an account starts and is cleared by
 * the person completing their profile, so offering it would let an operator
 * push somebody back into onboarding they have already finished. `DELETED` is
 * absent because deletion is not a status change — §1.2 of the console design
 * keeps it out of scope entirely.
 */
export const settablePlatformUserStatuses = ["ACTIVE", "SUSPENDED"] as const;
export const settablePlatformUserStatusSchema = z.enum(
  settablePlatformUserStatuses,
);
export type SettablePlatformUserStatus = z.infer<
  typeof settablePlatformUserStatusSchema
>;

export const setPlatformUserStatusInputSchema = z.object({
  userId: z.uuid(),
  status: settablePlatformUserStatusSchema,
  /**
   * Required, and length-checked. A suspension with no stated reason is a
   * decision nobody can review later, including the person who made it.
   */
  reason: z.string().trim().min(8).max(500),
});
export type SetPlatformUserStatusInput = z.infer<
  typeof setPlatformUserStatusInputSchema
>;

export type PlatformUserInvitation = z.infer<
  typeof platformUserInvitationSchema
>;
export type PlatformUserJoinRequest = z.infer<
  typeof platformUserJoinRequestSchema
>;

/* ------------------------------------------------------------ url state */

/**
 * The lenses the directory is read through.
 *
 * Three named entrances onto one table, rather than three tables. An operator
 * asked for "the teachers page" and what they want is this table with the role
 * facet already set — so the lens *is* a role selection, and every other facet
 * keeps working inside it.
 *
 * `staff` covers both roles that run an academy. They are one group to an
 * operator taking a support call ("who can I talk to at this academy") and two
 * roles only once you are inside one.
 */
export const userLenses = [
  "everyone",
  "students",
  "teachers",
  "staff",
] as const;
export const userLensSchema = z.enum(userLenses);
export type UserLens = (typeof userLenses)[number];

export const userLensRoles = {
  everyone: [],
  students: ["STUDENT"],
  teachers: ["TEACHER"],
  staff: ["TEAM_LEAD", "MANAGER"],
} as const satisfies Record<UserLens, readonly ("STUDENT" | "TEACHER" | "TEAM_LEAD" | "MANAGER")[]>;

/**
 * The directory's state, read out of the address.
 *
 * The same contract the academy people directory keeps, and for the same
 * reason: an operator can send "suspended managers at Gangnam" to a colleague
 * as a link, and Back from an account returns to the list they were reading
 * rather than to a reset table.
 *
 * Anything unparseable falls back to a default. A query string is user-editable
 * text arriving from bookmarks and chat messages, and an invalid address must
 * be a page rather than an error.
 */
export function parsePlatformUsersQuery(
  params: Record<string, string | string[] | undefined>,
): ResolvedListPlatformUsersInput {
  const asList = (value: string | string[] | undefined): string[] =>
    Array.isArray(value) ? value : value === undefined ? [] : [value];
  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const within = <T extends string>(
    value: string | string[] | undefined,
    allowed: readonly T[],
  ): T[] => asList(value).filter((entry): entry is T =>
    (allowed as readonly string[]).includes(entry),
  );

  const page = Number.parseInt(first(params.page) ?? "", 10);
  const size = Number.parseInt(first(params.size) ?? "", 10);

  return {
    query: (first(params.q) ?? "").trim().slice(0, 120) || undefined,
    academyIds: asList(params.academy)
      .filter((value) => /^[0-9a-f-]{36}$/i.test(value))
      .slice(0, 50),
    roles: within(params.role, academyRoles),
    membershipStatuses: within(params.mstatus, membershipStatuses),
    accountStatuses: within(params.status, userStatuses),
    platformRoles: within(params.prole, platformRoles),
    unaffiliatedOnly: first(params.unaffiliated) === "1",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize:
      Number.isFinite(size) && size > 0 && size <= PLATFORM_USERS_MAX_PAGE_SIZE
        ? size
        : PLATFORM_USERS_PAGE_SIZE,
  };
}

/**
 * The same state as a query string, with every default omitted.
 *
 * Omitting defaults is what makes the link shareable: the unfiltered directory
 * is the bare path, so pasting one into chat is not also pasting the reader's
 * own page number.
 */
export function serializePlatformUsersQuery(
  query: ResolvedListPlatformUsersInput,
): string {
  const params = new URLSearchParams();
  if (query.query) params.set("q", query.query);
  for (const id of [...(query.academyIds ?? [])].sort()) {
    params.append("academy", id);
  }
  for (const role of [...(query.roles ?? [])].sort()) params.append("role", role);
  for (const status of [...(query.membershipStatuses ?? [])].sort()) {
    params.append("mstatus", status);
  }
  for (const status of [...(query.accountStatuses ?? [])].sort()) {
    params.append("status", status);
  }
  for (const role of [...(query.platformRoles ?? [])].sort()) {
    params.append("prole", role);
  }
  if (query.unaffiliatedOnly) params.set("unaffiliated", "1");
  if (query.page > 1) params.set("page", String(query.page));
  if (query.pageSize !== PLATFORM_USERS_PAGE_SIZE) {
    params.set("size", String(query.pageSize));
  }
  return params.toString();
}

/**
 * Which changes send the reader back to page one.
 *
 * Narrowing the list while staying on page 9 shows an empty table and reads as
 * "no results" — the single most common way a filtered directory lies to the
 * person using it.
 */
export function platformUsersResetsToFirstPage(
  before: ResolvedListPlatformUsersInput,
  after: ResolvedListPlatformUsersInput,
): boolean {
  return (
    serializePlatformUsersQuery({ ...before, page: 1 }) !==
    serializePlatformUsersQuery({ ...after, page: 1 })
  );
}
