/**
 * Which of the four identity hues a course wears.
 *
 * Shared rather than owned by the learning surface, because a course keeps one
 * identity wherever it is drawn: on a student's card, on a team lead's list,
 * and on the master in the content library that a branch's copy came from.
 *
 * A course's colour has to be the same one every time a student sees it —
 * across sessions, on My Courses and on a class page, in either language — or
 * it teaches them nothing and becomes noise. So it is derived from the course
 * id rather than from its position in a list, which changes whenever a course
 * is published, renamed, or filtered out.
 *
 * FNV-1a because it needs to be stable, cheap, and identical on the server and
 * the client. Anything seeded, time-based, or dependent on array order would
 * flip a course's colour between two renders of the same page.
 *
 * Only ever an identity. See the `--course-*` note in `globals.css` for why
 * these hues are their own family and where they are allowed to appear.
 */
export const courseAccents = ['a', 'b', 'c', 'd'] as const;

export type CourseAccent = (typeof courseAccents)[number];

export function courseAccent(courseId: string): CourseAccent {
  let hash = 0x811c9dc5;
  for (let index = 0; index < courseId.length; index += 1) {
    hash ^= courseId.charCodeAt(index);
    // The FNV prime, as shifts and adds: `hash * 16777619` overflows past the
    // 32 bits this is defined on, and `>>> 0` keeps it unsigned.
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return courseAccents[hash % courseAccents.length];
}

/**
 * Tailwind classes per accent, spelled out rather than built.
 *
 * Tailwind scans source text, so `bg-course-${accent}-soft` would compile to
 * nothing and every mark would render transparent. The lookup is the price of
 * that, and it is the reason a fifth hue means editing this table.
 *
 * Two weights, and which one to use is a question of what the thing is. `mark`
 * is the solid fill: the course itself, on its card, where it is the object
 * being chosen. `tint` is the pale one: a *reference* to a course from
 * somewhere else — a saved draft pointing back at the course it belongs to —
 * where the same fill twenty rows deep would be a wall of colour instead of a
 * way to tell rows apart.
 */
export const courseAccentClasses: Record<
  CourseAccent,
  { spine: string; mark: string; tint: string }
> = {
  a: {
    spine: 'bg-course-a',
    mark: 'bg-course-a text-on-course',
    tint: 'bg-course-a-soft text-course-a',
  },
  b: {
    spine: 'bg-course-b',
    mark: 'bg-course-b text-on-course',
    tint: 'bg-course-b-soft text-course-b',
  },
  c: {
    spine: 'bg-course-c',
    mark: 'bg-course-c text-on-course',
    tint: 'bg-course-c-soft text-course-c',
  },
  d: {
    spine: 'bg-course-d',
    mark: 'bg-course-d text-on-course',
    tint: 'bg-course-d-soft text-course-d',
  },
};
