import type {
  ContentLens,
  PlatformClass,
  PlatformCourse,
  PlatformProblem,
} from '@cove/shared';
import { BookOpen, GraduationCap, Zap, type LucideIcon } from 'lucide-react';

import { routes } from '@/lib/routes';

/** Where each content lens lives, so the type chip and the router agree. */
export const contentLensHrefs: Record<ContentLens, string> = {
  courses: '/admin/content/courses',
  classes: '/admin/content/classes',
  problems: '/admin/content/problems',
};

/**
 * The hue and mark each kind of content wears.
 *
 * One lens is on screen at a time, so this is a *page* property rather than a
 * per-row decoration: the summary tile, the toolbar chip and the table's rail
 * light together, and switching to problems turns the page violet. It is the
 * console's existing rule — hue says what a thing is, loudness says whether it
 * is in trouble — read at the scale of the whole page.
 */
export const lensTones = {
  courses: 'brand',
  classes: 'teal',
  problems: 'peer',
} as const satisfies Record<ContentLens, 'brand' | 'teal' | 'peer'>;

export const lensIcons = {
  courses: BookOpen,
  classes: GraduationCap,
  problems: Zap,
} satisfies Record<ContentLens, LucideIcon>;

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
 * Three functions rather than one taking a lens and a loosely-typed row. The
 * fields differ per kind — a problem is addressed by course, lecture and
 * material — and a single signature could only accept them all as optional,
 * which moves the guarantee from the compiler to a runtime throw inside a
 * cell renderer.
 */
export const contentDetailHref = {
  course: (row: Pick<PlatformCourse, 'academySlug' | 'id'>, from?: string) =>
    withBackTo(routes.adminAcademyCourse(row.academySlug, row.id), from),
  class: (row: Pick<PlatformClass, 'academySlug' | 'id'>, from?: string) =>
    withBackTo(routes.adminAcademyClass(row.academySlug, row.id), from),
  problem: (
    row: Pick<
      PlatformProblem,
      'academySlug' | 'courseId' | 'lectureId' | 'materialId'
    >,
    from?: string,
  ) =>
    withBackTo(
      routes.adminAcademyExercise(
        row.academySlug,
        row.courseId,
        row.lectureId,
        row.materialId,
      ),
      from,
    ),
} as const;
