import { z } from "zod";

import { academyRoleSchema, academyRoles } from "../auth/roles.js";
import { membershipStatusSchema, membershipStatuses } from "./status.js";

/**
 * The people directory's request and response, and the rules that keep them
 * agreeing with each other.
 *
 * The module exists because the browser was doing this. `academyMembers.list`
 * returns every membership in the academy and the table searched, filtered,
 * sorted, and paged it locally — which works at forty members, gets slow at
 * four hundred, and at two thousand ships the entire staff and student roster,
 * emails included, to any tab that can open the page.
 *
 * Three rules follow from moving it to the server.
 *
 * Order is total. `updatedAt desc` alone is not an order — memberships updated
 * in the same transaction share a timestamp, and any page boundary landing
 * inside such a group would drop or repeat rows as the reader pages through.
 * Every sort here ends in `id asc` for that reason.
 *
 * Invalid state is not an error. A stale bookmark naming a page that no longer
 * exists, or a role that was renamed, should open the directory — §10 says it
 * falls back to defaults and canonicalizes the URL, because the alternative is
 * an error page produced by the reader's own history.
 *
 * A selection is a filter, never a list of ids. "Select all 1,840 matching
 * results" sends the normalized filter and the exclusions; expanding it in the
 * browser would be both the payload it was built to avoid and a lie the moment
 * somebody else changes a membership mid-scroll.
 *
 * See §10 of the manager control tower and scalable people operations design.
 */

/* --------------------------------------------------------------- paging */

/** §10 — the three page sizes, as a closed set rather than a bounded number. */
export const peoplePageSizes = [25, 50, 100] as const;
export const peoplePageSizeSchema = z.union([
  z.literal(25),
  z.literal(50),
  z.literal(100),
]);
export type PeoplePageSize = (typeof peoplePageSizes)[number];

export const DEFAULT_PEOPLE_PAGE_SIZE: PeoplePageSize = 25;

/* -------------------------------------------------------------- ordering */

export const peopleSortFields = [
  "displayName",
  "email",
  "role",
  "status",
  "joinedAt",
  "updatedAt",
] as const;
export const peopleSortFieldSchema = z.enum(peopleSortFields);
export type PeopleSortField = z.infer<typeof peopleSortFieldSchema>;

export const peopleSortDirectionSchema = z.enum(["asc", "desc"]);
export type PeopleSortDirection = z.infer<typeof peopleSortDirectionSchema>;

/**
 * §10's default: most recently changed first.
 *
 * The one order that answers a manager's usual reason for opening the page —
 * "what happened to this academy while I was away" — without them choosing
 * anything.
 */
export const DEFAULT_PEOPLE_SORT: PeopleSortField = "updatedAt";
export const DEFAULT_PEOPLE_DIRECTION: PeopleSortDirection = "desc";

/* --------------------------------------------------------------- filters */

/**
 * The filter, normalized.
 *
 * Roles and statuses are sets rather than single values: a manager asking for
 * "teachers and team leads, active or suspended" is asking one question, and
 * two round trips would answer it twice.
 *
 * An empty array means "every one of them" rather than "none". It is the
 * reading that makes an unfiltered page and a page whose filters were all
 * cleared the same request, which is what lets the URL omit them entirely.
 */
export const peopleFilterSchema = z
  .object({
    search: z
      .string()
      .trim()
      .max(120)
      .transform((value) => (value.length === 0 ? "" : value))
      .default(""),
    roles: z.array(academyRoleSchema).max(academyRoles.length).default([]),
    statuses: z
      .array(membershipStatusSchema)
      .max(membershipStatuses.length)
      .default([]),
  })
  .strict();
export type PeopleFilter = z.infer<typeof peopleFilterSchema>;

export const listPeopleInputSchema = z
  .object({
    academyId: z.uuid(),
    /** One-based, as the interface counts. */
    page: z.number().int().min(1).max(100_000).default(1),
    pageSize: peoplePageSizeSchema.default(DEFAULT_PEOPLE_PAGE_SIZE),
    search: z.string().trim().max(120).default(""),
    roles: z.array(academyRoleSchema).max(academyRoles.length).default([]),
    statuses: z
      .array(membershipStatusSchema)
      .max(membershipStatuses.length)
      .default([]),
    sort: peopleSortFieldSchema.default(DEFAULT_PEOPLE_SORT),
    direction: peopleSortDirectionSchema.default(DEFAULT_PEOPLE_DIRECTION),
  })
  .strict();
export type ListPeopleInput = z.infer<typeof listPeopleInputSchema>;

/* ----------------------------------------------------------------- rows */

export const peopleRowSchema = z
  .object({
    membershipId: z.uuid(),
    userId: z.uuid(),
    /** The academy-scoped override if one exists, else the account name. */
    displayName: z.string().min(1).max(200),
    email: z.email().nullable(),
    /** The member's highest role — what the column sorts and filters on. */
    role: academyRoleSchema,
    /**
     * Every role this member holds, `role` included.
     *
     * Carried on the row so the roster can grant and revoke in place, instead
     * of sending a manager to the member page to learn that somebody is both a
     * manager and a teacher.
     */
    roles: z.array(academyRoleSchema).min(1),
    status: membershipStatusSchema,
    joinedAt: z.iso.datetime().nullable(),
    suspendedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
    /** Active classes this membership sits in, for the roster column. */
    classCount: z.number().int().nonnegative(),
    /**
     * The three inputs to `resolveAvatar`, in its own order.
     *
     * Carried as three fields rather than one resolved URL because the fallback
     * is a *read-time* decision — §10.4 — and resolving it here would freeze it
     * into the payload. Removing an academy override reveals the global image
     * rather than copying it down, and a single pre-resolved `imageUrl` could
     * not express that.
     *
     * The two signed URLs expire. That is why they are minted per response and
     * never cached alongside the row.
     */
    academyImageUrl: z.string().nullable(),
    globalImageUrl: z.string().nullable(),
    externalAvatarUrl: z.string().nullable(),
  })
  .strict();
export type PeopleRow = z.infer<typeof peopleRowSchema>;

/**
 * How many people each filter value would return, on its own.
 *
 * Computed against the search but not against the other facet — the count
 * beside "Teacher" answers "what happens if I click this", and computing it
 * against a role filter that already excludes teachers would print zero next to
 * every unselected role and make the whole panel useless.
 */
export const peopleFacetsSchema = z
  .object({
    roles: z.array(
      z.object({ value: academyRoleSchema, count: z.number().int().nonnegative() }).strict(),
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
export type PeopleFacets = z.infer<typeof peopleFacetsSchema>;

export const peoplePageSchema = z
  .object({
    rows: z.array(peopleRowSchema),
    /** Exact, not an estimate, and always after the filter. */
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    pageSize: peoplePageSizeSchema,
    pageCount: z.number().int().nonnegative(),
    sort: peopleSortFieldSchema,
    direction: peopleSortDirectionSchema,
    facets: peopleFacetsSchema,
    /**
     * §8.1 — the academy revision this page was read at.
     *
     * Carried so a bulk mutation raised from a selection made here can be
     * refused if the roster moved underneath it, rather than quietly applying
     * to whoever happens to match now.
     */
    peopleRevision: z.number().int().nonnegative(),
  })
  .strict();
export type PeoplePage = z.infer<typeof peoplePageSchema>;

/* ------------------------------------------------------------ derivations */

/**
 * A manager on page 12 who suspends enough members to empty it lands on the
 * last page that still has rows, not on an empty table with working pagination
 * controls. That is `clampPage` in `content/teacher-students.ts`, reused rather
 * than restated: it is the same arithmetic the student list already does, and
 * two copies is how one of them ends up off by one at the last page.
 */
export { clampPage } from "../content/teacher-students.js";

/**
 * Whether a change to the query should send the reader back to page one.
 *
 * §10 — anything that changes *which* rows match does; changing the sort
 * direction of the same result set does not move a row out of the set, but it
 * does move it out of the page, so it resets too. Page size is the exception:
 * it changes the window, not the result, and a reader widening the page is
 * asking to see more of what they are already looking at.
 */
export function resetsToFirstPage(
  previous: ListPeopleInput,
  next: ListPeopleInput,
): boolean {
  return (
    previous.search !== next.search ||
    !sameSet(previous.roles, next.roles) ||
    !sameSet(previous.statuses, next.statuses) ||
    previous.sort !== next.sort ||
    previous.direction !== next.direction
  );
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

/**
 * A URL's worth of table state, read as leniently as §10 requires.
 *
 * Every unparseable value falls back to its default rather than failing: this
 * runs against a query string, which is user-editable text that arrives from
 * bookmarks, chat messages, and a previous version of this page. The response
 * states what it actually used, and the interface canonicalizes the URL with
 * `replace` so the reader's history is not filled with corrections.
 */
export function parsePeopleQuery(
  params: Record<string, string | string[] | undefined>,
): Omit<ListPeopleInput, "academyId"> {
  return {
    page: parsePage(single(params.page)),
    pageSize: parsePageSize(single(params.size)),
    search: (single(params.q) ?? "").trim().slice(0, 120),
    roles: parseEnumList(params.role, academyRoles),
    statuses: parseEnumList(params.status, membershipStatuses),
    sort: parseEnum(single(params.sort), peopleSortFields, DEFAULT_PEOPLE_SORT),
    direction: parseEnum(
      single(params.dir),
      ["asc", "desc"] as const,
      DEFAULT_PEOPLE_DIRECTION,
    ),
  };
}

/**
 * The same state as a query string, with every default omitted.
 *
 * Omitting defaults is what makes the URL shareable: a link to the unfiltered
 * directory is the bare path, so a manager pasting one into chat is not also
 * pasting their own current sort order.
 */
export function serializePeopleQuery(
  query: Omit<ListPeopleInput, "academyId">,
): string {
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
  if (query.sort !== DEFAULT_PEOPLE_SORT) params.set("sort", query.sort);
  if (query.direction !== DEFAULT_PEOPLE_DIRECTION) {
    params.set("dir", query.direction);
  }
  return params.toString();
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100_000
    ? parsed
    : 1;
}

function parsePageSize(value: string | undefined): PeoplePageSize {
  const parsed = Number(value);
  return (peoplePageSizes as readonly number[]).includes(parsed)
    ? (parsed as PeoplePageSize)
    : DEFAULT_PEOPLE_PAGE_SIZE;
}

function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Repeated query parameters as a deduplicated set, in the vocabulary's own
 * order.
 *
 * Sorted by the enum rather than by arrival so `?role=TEACHER&role=STUDENT` and
 * `?role=STUDENT&role=TEACHER` produce one canonical URL and one cache key.
 */
function parseEnumList<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  const flattened = raw.flatMap((entry) => entry.split(","));
  const found = new Set(flattened.filter((entry): entry is T =>
    allowed.includes(entry as T),
  ));
  return allowed.filter((entry) => found.has(entry));
}
