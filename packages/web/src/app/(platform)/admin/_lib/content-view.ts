import type { ContentLens, PlatformClass, PlatformCourse } from '@cove/shared';
import { BookOpen, GraduationCap, type LucideIcon } from 'lucide-react';

import { routes } from '@/lib/routes';

/** Where each curriculum page lives, so the rail, the summary strip and the
 *  router all agree on one address per kind. */
export const contentLensHrefs: Record<ContentLens, string> = {
  courses: '/admin/content/courses',
  classes: '/admin/content/classes',
};

/**
 * The hue and mark each kind of curriculum wears.
 *
 * One kind is on screen at a time, so this is a *page* property rather than a
 * per-row decoration: the rail row, the summary tile and the table's own rail
 * light together, and moving to Classes turns the page teal. It is the
 * console's existing rule — hue says what a thing is, loudness says whether it
 * is in trouble — read at the scale of the whole page.
 *
 * Only two entries, because only two of these are pages. Violet still marks
 * problems in the summary strip, but as a *statistic* rather than a
 * destination — a third page hue with no page behind it would be a promise the
 * navigation cannot keep.
 */
export const lensTones = {
  courses: 'brand',
  classes: 'teal',
} as const satisfies Record<ContentLens, 'brand' | 'teal'>;

export const lensIcons = {
  courses: BookOpen,
  classes: GraduationCap,
} satisfies Record<ContentLens, LucideIcon>;

/**
 * Which curriculum page an editor was opened from, if any.
 *
 * The rail lights a row by matching the address, and every editor lives under
 * `/admin/academies/…` — so a course opened from Courses would light
 * **Academies** while its own Back link says **Courses**. `from` already
 * records where the reader came from, and this reads it back.
 *
 * It resolves to the *specific* page, never to a group: a class opened from
 * Classes must not light Courses, and the descent from a course into a lecture
 * and then a problem has to stay on Courses the whole way down. That descent is
 * the console's claim that a problem lives inside its course, enforced rather
 * than merely stated.
 */
export function contentLensFromReferrer(
  from: string | null | undefined,
): string | null {
  if (!from) return null;
  return (
    Object.values(contentLensHrefs).find((href) => from.startsWith(href)) ?? null
  );
}

/**
 * The address a detail page returns to, carried on the link that opened it.
 *
 * Without it a detail page can only guess, and it guesses the academy's own
 * index — so an operator who arrived from the cross-academy browser presses
 * Back and lands somewhere they have never been. The editors are mounted under
 * two shells and reachable from four places; the only thing that knows where a
 * reader came from is the link they followed, so it says.
 *
 * A search param rather than browser history: the destination stays visible in
 * the URL, survives a reload, and a shared link still goes somewhere sensible.
 */
export function withBackTo(href: string, from?: string): string {
  return from ? `${href}?from=${encodeURIComponent(from)}` : href;
}

/**
 * Where a row opens.
 *
 * Always a console route, never `/admin/access/new`. The support-grant detour
 * was correct while the console had no editors of its own; it has had them
 * since `2026-09-01-console-native-content-management-design.md`, and an
 * operator who lands in the customer's studio under a *"Standing in as Team
 * lead"* banner has been told something untrue about what they are doing.
 *
 * Two functions rather than one taking a lens and a loosely-typed row. A course
 * and a class are addressed by different ids, and a single signature could only
 * accept both as optional — which moves the guarantee from the compiler to a
 * runtime throw inside a cell renderer.
 *
 * There is no `problem` entry, because no table lists problems. One is reached
 * by opening its course and walking down to the lecture, which is the path the
 * course builder already draws with `contentPaths.exercise`.
 */
export const contentDetailHref = {
  course: (row: Pick<PlatformCourse, 'academySlug' | 'id'>, from?: string) =>
    withBackTo(routes.adminAcademyCourse(row.academySlug, row.id), from),
  class: (row: Pick<PlatformClass, 'academySlug' | 'id'>, from?: string) =>
    withBackTo(routes.adminAcademyClass(row.academySlug, row.id), from),
} as const;
