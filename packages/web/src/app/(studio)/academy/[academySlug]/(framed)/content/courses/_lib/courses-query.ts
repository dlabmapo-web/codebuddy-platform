/**
 * The academy's course list, as three surfaces cache it.
 *
 * Shared because the list is read by the courses table and by a class's course
 * picker, and written from the library browser — which lives under a different
 * route entirely. One query client outlives all of those navigations, so a
 * write that does not name this key leaves the other surfaces serving the list
 * as it was before the write: `initialData` from a fresh server render is used
 * only when the cache holds nothing, and after one visit it never does.
 */
export function academyCoursesQueryKey(academyId: string) {
  return ['academy', academyId, 'courses'] as const;
}
