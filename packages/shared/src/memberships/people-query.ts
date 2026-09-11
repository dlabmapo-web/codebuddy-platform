import { z } from "zod";

/**
 * Lenient readers for a people table's query string.
 *
 * Shared by the Members directory and the Students and Staff rosters, which
 * all keep their table state in the address and all read it by the same rule:
 * the query string is user-editable text arriving from bookmarks, chat
 * messages, and previous versions of the page, so every unparseable value
 * falls back to its default rather than failing. An invalid address is a page,
 * never an error.
 */

/** The first of a repeated parameter, which is the only one a scalar reads. */
export function singleParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** A one-based page number, or page one. */
export function parsePageParam(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100_000
    ? parsed
    : 1;
}

/** One of a closed set of page sizes, or the default. */
export function parsePageSizeParam<T extends number>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const parsed = Number(value);
  return (allowed as readonly number[]).includes(parsed)
    ? (parsed as T)
    : fallback;
}

export function parseEnumParam<T extends string>(
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
export function parseEnumListParam<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T[] {
  const found = new Set(
    splitListParam(value).filter((entry): entry is T =>
      allowed.includes(entry as T),
    ),
  );
  return allowed.filter((entry) => found.has(entry));
}

/**
 * Repeated query parameters naming UUIDs, deduplicated and sorted.
 *
 * For values with no closed vocabulary — class ids. Anything that is not a
 * UUID is dropped here, and a well-formed id that names nothing is dropped by
 * the server, so neither reaches the reader as an error.
 */
export function parseUuidListParam(
  value: string | string[] | undefined,
  max: number,
): string[] {
  const found = new Set(
    splitListParam(value)
      .map((entry) => entry.toLowerCase())
      .filter((entry) => uuidSchema.safeParse(entry).success),
  );
  return [...found].sort().slice(0, max);
}

function splitListParam(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw.flatMap((entry) => entry.split(","));
}

/** The same rule the input schema applies, so a parsed id is never refused. */
const uuidSchema = z.uuid();

/** Whether two filter selections name the same set, in any order. */
export function sameSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}
