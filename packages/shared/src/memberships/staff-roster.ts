import { z } from "zod";

import { academyRoleSchema } from "../auth/roles.js";
import { staffRoles } from "../profile/academy-profile.js";
import {
  DEFAULT_PEOPLE_PAGE_SIZE,
  peoplePageSizeSchema,
  peoplePageSizes,
  peopleSortDirectionSchema,
  type PeopleSortDirection,
} from "./people-directory.js";
import {
  parseEnumListParam,
  parseEnumParam,
  parsePageParam,
  parsePageSizeParam,
  sameSet,
  singleParam,
} from "./people-query.js";
import { membershipStatusSchema, membershipStatuses } from "./status.js";
import { rosterClassRefSchema } from "./student-roster.js";

/**
 * The manager's Staff page: every teacher, team lead, and manager.
 *
 * The one rule that shapes it is that a person can hold several of those roles
 * at once — the director who also teaches. The filter therefore asks "holds
 * this role", not "whose highest role is this", so that director appears under
 * Teacher as well as Manager; and the sort orders by the highest role held, so
 * they sit once, with the managers, rather than twice.
 */

/** The roles the Staff page filters by — `staffRoles`, as a schema. */
export const staffRoleSchema = z.enum(staffRoles);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const staffRosterSortFields = [
  "displayName",
  "username",
  "role",
  "employeeNumber",
  "status",
  "joinedAt",
  "updatedAt",
] as const;
export const staffRosterSortFieldSchema = z.enum(staffRosterSortFields);
export type StaffRosterSortField = z.infer<typeof staffRosterSortFieldSchema>;

/** Managers first, then team leads, then teachers — and by name inside each. */
export const DEFAULT_STAFF_ROSTER_SORT: StaffRosterSortField = "role";
export const DEFAULT_STAFF_ROSTER_DIRECTION: PeopleSortDirection = "desc";

export const listStaffRosterInputSchema = z
  .object({
    academyId: z.uuid(),
    page: z.number().int().min(1).max(100_000).default(1),
    pageSize: peoplePageSizeSchema.default(DEFAULT_PEOPLE_PAGE_SIZE),
    search: z.string().trim().max(120).default(""),
    roles: z.array(staffRoleSchema).max(staffRoles.length).default([]),
    statuses: z
      .array(membershipStatusSchema)
      .max(membershipStatuses.length)
      .default([]),
    sort: staffRosterSortFieldSchema.default(DEFAULT_STAFF_ROSTER_SORT),
    direction: peopleSortDirectionSchema.default(DEFAULT_STAFF_ROSTER_DIRECTION),
  })
  .strict();
export type ListStaffRosterInput = z.infer<typeof listStaffRosterInputSchema>;
export type StaffRosterQuery = Omit<ListStaffRosterInput, "academyId">;

export const staffRosterRowSchema = z
  .object({
    membershipId: z.uuid(),
    userId: z.uuid(),
    displayName: z.string().min(1).max(200),
    /** The sign-in name, shown under "ID" (아이디). */
    username: z.string().nullable(),
    email: z.email().nullable(),
    /** The highest role held — what the role sort orders by. */
    role: academyRoleSchema,
    /** Every role held, `role` included, in `academyRoles` order. */
    roles: z.array(academyRoleSchema).min(1),
    status: membershipStatusSchema,
    joinedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
    academyTitle: z.string().nullable(),
    employeeNumber: z.string().nullable(),
    /** Canonical international form; the browser formats it for the reader. */
    contactPhone: z.string().nullable(),
    /** Active classes this person is the homeroom teacher of, by name. */
    homeroomClasses: z.array(rosterClassRefSchema),
    /** Active classes this person assists in, by name. */
    assistantClasses: z.array(rosterClassRefSchema),
    academyImageUrl: z.string().nullable(),
    globalImageUrl: z.string().nullable(),
    externalAvatarUrl: z.string().nullable(),
  })
  .strict();
export type StaffRosterRow = z.infer<typeof staffRosterRowSchema>;

/**
 * Role counts are "holds this role" counts, so a Manager who also teaches is
 * counted under both and the three can add up to more than `total`. That is
 * the honest answer to "what would this filter give me"; a count that put them
 * under one role only would promise a filter result the filter does not return.
 */
export const staffRosterFacetsSchema = z
  .object({
    roles: z.array(
      z
        .object({
          value: staffRoleSchema,
          count: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    statuses: z.array(
      z
        .object({
          value: membershipStatusSchema,
          count: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
export type StaffRosterFacets = z.infer<typeof staffRosterFacetsSchema>;

export const staffRosterPageSchema = z
  .object({
    rows: z.array(staffRosterRowSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    pageSize: peoplePageSizeSchema,
    pageCount: z.number().int().nonnegative(),
    sort: staffRosterSortFieldSchema,
    direction: peopleSortDirectionSchema,
    facets: staffRosterFacetsSchema,
  })
  .strict();
export type StaffRosterPage = z.infer<typeof staffRosterPageSchema>;

/** Anything that changes which rows match, or their order, starts at page one. */
export function staffRosterResetsToFirstPage(
  previous: StaffRosterQuery,
  next: StaffRosterQuery,
): boolean {
  return (
    previous.search !== next.search ||
    !sameSet(previous.roles, next.roles) ||
    !sameSet(previous.statuses, next.statuses) ||
    previous.sort !== next.sort ||
    previous.direction !== next.direction
  );
}

export function parseStaffRosterQuery(
  params: Record<string, string | string[] | undefined>,
): StaffRosterQuery {
  return {
    page: parsePageParam(singleParam(params.page)),
    pageSize: parsePageSizeParam(
      singleParam(params.size),
      peoplePageSizes,
      DEFAULT_PEOPLE_PAGE_SIZE,
    ),
    search: (singleParam(params.q) ?? "").trim().slice(0, 120),
    roles: parseEnumListParam(params.role, staffRoles),
    statuses: parseEnumListParam(params.status, membershipStatuses),
    sort: parseEnumParam(
      singleParam(params.sort),
      staffRosterSortFields,
      DEFAULT_STAFF_ROSTER_SORT,
    ),
    direction: parseEnumParam(
      singleParam(params.dir),
      ["asc", "desc"] as const,
      DEFAULT_STAFF_ROSTER_DIRECTION,
    ),
  };
}

/** The same state as a query string, with every default omitted. */
export function serializeStaffRosterQuery(query: StaffRosterQuery): string {
  const params = new URLSearchParams();
  if (query.page > 1) params.set("page", String(query.page));
  if (query.pageSize !== DEFAULT_PEOPLE_PAGE_SIZE) {
    params.set("size", String(query.pageSize));
  }
  if (query.search) params.set("q", query.search);
  for (const role of [...query.roles].sort()) params.append("role", role);
  for (const status of [...query.statuses].sort()) {
    params.append("status", status);
  }
  if (query.sort !== DEFAULT_STAFF_ROSTER_SORT) params.set("sort", query.sort);
  if (query.direction !== DEFAULT_STAFF_ROSTER_DIRECTION) {
    params.set("dir", query.direction);
  }
  return params.toString();
}
