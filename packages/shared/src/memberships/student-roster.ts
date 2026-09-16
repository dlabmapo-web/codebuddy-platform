import { z } from "zod";

import {
  DEFAULT_PEOPLE_PAGE_SIZE,
  peoplePageSizeSchema,
  peoplePageSizes,
  peopleSortDirectionSchema,
  rosterViewerSchema,
  type PeopleSortDirection,
} from "./people-directory.js";
import {
  parseEnumListParam,
  parseEnumParam,
  parsePageParam,
  parsePageSizeParam,
  parseUuidListParam,
  sameSet,
  singleParam,
} from "./people-query.js";
import { membershipStatusSchema, membershipStatuses } from "./status.js";

/**
 * The manager's Students page: every student in the academy, with the facts an
 * office looks a child up for — their ID, their classes, their school, and who
 * to call.
 *
 * A sibling of the people directory rather than a mode of it. The row carries
 * student-only fields a staff row would leave empty, and the filters differ
 * (a class, not a role), so one contract would be two contracts sharing a name.
 * What they do share — page sizes, direction, the lenient URL readers — is
 * imported, so all three tables page and canonicalize by one rule.
 */

/** Enough for any real academy's filter chips, and a bound on the request. */
export const STUDENT_ROSTER_MAX_CLASS_FILTER = 50;

export const studentRosterSortFields = [
  "displayName",
  "username",
  "studentNumber",
  "schoolGrade",
  "status",
  "joinedAt",
  "updatedAt",
] as const;
export const studentRosterSortFieldSchema = z.enum(studentRosterSortFields);
export type StudentRosterSortField = z.infer<
  typeof studentRosterSortFieldSchema
>;

/**
 * By name, ascending. The directory opens on "most recently changed" because a
 * manager arrives there to see what happened; a student list is where they
 * arrive to find one child, and that is a lookup by name.
 */
export const DEFAULT_STUDENT_ROSTER_SORT: StudentRosterSortField = "displayName";
export const DEFAULT_STUDENT_ROSTER_DIRECTION: PeopleSortDirection = "asc";

export const listStudentRosterInputSchema = z
  .object({
    academyId: z.uuid(),
    page: z.number().int().min(1).max(100_000).default(1),
    pageSize: peoplePageSizeSchema.default(DEFAULT_PEOPLE_PAGE_SIZE),
    search: z.string().trim().max(120).default(""),
    statuses: z
      .array(membershipStatusSchema)
      .max(membershipStatuses.length)
      .default([]),
    classIds: z
      .array(z.uuid())
      .max(STUDENT_ROSTER_MAX_CLASS_FILTER)
      .default([]),
    sort: studentRosterSortFieldSchema.default(DEFAULT_STUDENT_ROSTER_SORT),
    direction: peopleSortDirectionSchema.default(
      DEFAULT_STUDENT_ROSTER_DIRECTION,
    ),
  })
  .strict();
export type ListStudentRosterInput = z.infer<
  typeof listStudentRosterInputSchema
>;
export type StudentRosterQuery = Omit<ListStudentRosterInput, "academyId">;

/** A class as a roster cell names it. */
export const rosterClassRefSchema = z
  .object({ id: z.uuid(), name: z.string().min(1).max(200) })
  .strict();
export type RosterClassRef = z.infer<typeof rosterClassRefSchema>;

export const studentRosterRowSchema = z
  .object({
    membershipId: z.uuid(),
    userId: z.uuid(),
    displayName: z.string().min(1).max(200),
    /** The sign-in name, shown under "ID" (아이디). */
    username: z.string().nullable(),
    status: membershipStatusSchema,
    joinedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
    studentNumber: z.string().nullable(),
    schoolName: z.string().nullable(),
    schoolGrade: z.string().nullable(),
    /**
     * Everything this student has ever earned in this academy.
     *
     * Absent when the academy runs no points — never zero in that case. Zero
     * is a real score a child can have, and printing it for an academy that
     * keeps no score would state a fact about every one of them. The same
     * optional-vs-null rule the guardian pair follows, for the same reason.
     *
     * Lifetime earned rather than a balance, and academy-wide rather than per
     * class: a roster column is read down, and a number that meant something
     * different from row to row could not be.
     */
    points: z.number().int().nonnegative().optional(),
    /**
     * Academy-private, and withheld from a reader who may not manage members.
     * `studentAcademyProfileSchema` states the rule: guardian and emergency
     * details are for the student and active managers, and nobody else.
     *
     * Optional rather than nulled, for the reason `staffRosterRowSchema` gives
     * about `email`: `null` means the academy holds no guardian name, and a
     * Team Lead told that about a child whose guardian is simply not theirs to
     * read would be told something false.
     */
    guardianName: z.string().nullable().optional(),
    /**
     * Canonical international form; the browser formats it for the reader.
     * Withheld like `guardianName`.
     */
    guardianPhone: z.string().nullable().optional(),
    /** Active classes only, by name. */
    classes: z.array(rosterClassRefSchema),
    academyImageUrl: z.string().nullable(),
    globalImageUrl: z.string().nullable(),
    externalAvatarUrl: z.string().nullable(),
  })
  .strict();
export type StudentRosterRow = z.infer<typeof studentRosterRowSchema>;

/**
 * How many students each filter value would return on its own — computed
 * against the search but not the other facet, for the reason the directory's
 * facets are.
 *
 * Every active class appears, including those with nobody in them: a filter
 * that only lists classes with students cannot confirm that a class is empty.
 */
export const studentRosterFacetsSchema = z
  .object({
    statuses: z.array(
      z
        .object({
          value: membershipStatusSchema,
          count: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    classes: z.array(
      z
        .object({
          id: z.uuid(),
          name: z.string().min(1).max(200),
          count: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
export type StudentRosterFacets = z.infer<typeof studentRosterFacetsSchema>;

export const studentRosterPageSchema = z
  .object({
    rows: z.array(studentRosterRowSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    pageSize: peoplePageSizeSchema,
    pageCount: z.number().int().nonnegative(),
    sort: studentRosterSortFieldSchema,
    direction: peopleSortDirectionSchema,
    facets: studentRosterFacetsSchema,
    viewer: rosterViewerSchema,
    /**
     * The academy keeps score at all.
     *
     * On the page rather than inferred from the rows: a filter that matched
     * nobody returns no rows, and a table that decided from them would drop
     * the column on an empty search and put it back on the next one.
     */
    pointsEnabled: z.boolean(),
  })
  .strict();
export type StudentRosterPage = z.infer<typeof studentRosterPageSchema>;

/** Anything that changes which rows match, or their order, starts at page one. */
export function studentRosterResetsToFirstPage(
  previous: StudentRosterQuery,
  next: StudentRosterQuery,
): boolean {
  return (
    previous.search !== next.search ||
    !sameSet(previous.statuses, next.statuses) ||
    !sameSet(previous.classIds, next.classIds) ||
    previous.sort !== next.sort ||
    previous.direction !== next.direction
  );
}

export function parseStudentRosterQuery(
  params: Record<string, string | string[] | undefined>,
): StudentRosterQuery {
  return {
    page: parsePageParam(singleParam(params.page)),
    pageSize: parsePageSizeParam(
      singleParam(params.size),
      peoplePageSizes,
      DEFAULT_PEOPLE_PAGE_SIZE,
    ),
    search: (singleParam(params.q) ?? "").trim().slice(0, 120),
    statuses: parseEnumListParam(params.status, membershipStatuses),
    classIds: parseUuidListParam(params.class, STUDENT_ROSTER_MAX_CLASS_FILTER),
    sort: parseEnumParam(
      singleParam(params.sort),
      studentRosterSortFields,
      DEFAULT_STUDENT_ROSTER_SORT,
    ),
    direction: parseEnumParam(
      singleParam(params.dir),
      ["asc", "desc"] as const,
      DEFAULT_STUDENT_ROSTER_DIRECTION,
    ),
  };
}

/** The same state as a query string, with every default omitted. */
export function serializeStudentRosterQuery(query: StudentRosterQuery): string {
  const params = new URLSearchParams();
  if (query.page > 1) params.set("page", String(query.page));
  if (query.pageSize !== DEFAULT_PEOPLE_PAGE_SIZE) {
    params.set("size", String(query.pageSize));
  }
  if (query.search) params.set("q", query.search);
  for (const status of [...query.statuses].sort()) {
    params.append("status", status);
  }
  for (const classId of [...query.classIds].sort()) {
    params.append("class", classId);
  }
  if (query.sort !== DEFAULT_STUDENT_ROSTER_SORT) params.set("sort", query.sort);
  if (query.direction !== DEFAULT_STUDENT_ROSTER_DIRECTION) {
    params.set("dir", query.direction);
  }
  return params.toString();
}
