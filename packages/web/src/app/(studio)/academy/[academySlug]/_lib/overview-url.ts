import { routes } from '@/lib/routes';
import { overviewRanges, type OverviewRange } from '@cove/shared';

/**
 * The three things a teacher can change about their overview, in the address.
 *
 * A teacher who has narrowed to one class, one course, and thirty days should
 * be able to send that screen to the colleague covering for them, and Back from
 * a drill-down should return to it rather than to a reset page.
 *
 * Parsing is total: anything unsupported is dropped rather than refused, so a
 * hand-edited, stale, or hostile address renders a page instead of an error.
 * Serializing is canonical — one state produces exactly one address — and the
 * dependency is enforced here as well as on the server: a course cannot outlive
 * the class that taught it.
 *
 * None of this is authorization. The server resolves the scope again and says
 * in its response which class and course it actually used.
 *
 * See §5.3 of the teacher overview and student analytics redesign.
 */

export type OverviewQuery = {
  /** Null means every class this teacher is assigned to. */
  classId: string | null;
  courseId: string | null;
  range: OverviewRange;
};

export const defaultOverviewQuery: OverviewQuery = {
  classId: null,
  courseId: null,
  range: '7d',
};

/** Emitted in this order, always, so equivalent states share one address. */
const parameterOrder = ['class', 'course', 'range'] as const;

const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseOverviewQuery(
  params:
    | string
    | URLSearchParams
    | Record<string, string | string[] | undefined>,
): OverviewQuery {
  const search = toSearchParams(params);
  const range = overviewRanges.find((value) => value === search.get('range'));

  return {
    // `all` is the written form of "no filter", and it is also what an absent
    // parameter means. Both land on null so the two spellings are one state.
    classId: readId(search.get('class')),
    courseId: readId(search.get('course')),
    range: range ?? defaultOverviewQuery.range,
    // §5.3 — the superseded overview's `participation` lens is deliberately not
    // read. The redesigned page has one required participation view, so the
    // parameter has nothing left to select and is dropped on the way through
    // rather than being preserved as an address nobody can act on.
  };
}

export function serializeOverviewQuery(query: OverviewQuery): string {
  const search = new URLSearchParams();
  for (const key of parameterOrder) {
    switch (key) {
      case 'class':
        if (query.classId) search.set('class', query.classId);
        break;
      case 'course':
        if (query.courseId) search.set('course', query.courseId);
        break;
      case 'range':
        // The default never appears in the address.
        if (query.range !== defaultOverviewQuery.range) {
          search.set('range', query.range);
        }
        break;
    }
  }
  return search.toString();
}

export function overviewPath(academySlug: string, query: OverviewQuery): string {
  const search = serializeOverviewQuery(query);
  const base = `${routes.academy(academySlug)}`;
  return search ? `${base}?${search}` : base;
}

/**
 * Changing the class clears a course the new class may not teach.
 *
 * The available courses arrive with the response, so the caller passes them in
 * and a still-valid course survives the change. Dropping it unconditionally
 * would reset a teacher comparing the same course across two classes.
 */
export function withClassSelection(
  current: OverviewQuery,
  classId: string | null,
  courses: { value: string; classIds: string[] }[],
): OverviewQuery {
  const stillTaught =
    current.courseId !== null &&
    courses.some(
      (course) =>
        course.value === current.courseId &&
        (classId === null || course.classIds.includes(classId)),
    );
  return {
    ...current,
    classId,
    courseId: stillTaught ? current.courseId : null,
  };
}

/** The courses a class actually teaches, for the dependent picker. */
export function coursesForClass<T extends { classIds: string[] }>(
  courses: T[],
  classId: string | null,
): T[] {
  if (!classId) return courses;
  return courses.filter((course) => course.classIds.includes(classId));
}

/**
 * Where a preview on the overview opens in full.
 *
 * §5.1 — every preview links to Student analytics carrying the scope that was
 * on screen, so the first thing a teacher sees there is the same five students
 * they just clicked past, followed by the rest. A link that reset the filters
 * would make the preview and its "view all" describe different classes.
 */
export function studentAnalyticsPath(input: {
  academySlug: string;
  query: OverviewQuery;
  sort?: string;
  direction?: 'asc' | 'desc';
  attention?: readonly string[];
  moduleId?: string | null;
  lectureId?: string | null;
  problemId?: string | null;
}): string {
  const search = new URLSearchParams();
  if (input.query.classId) search.set('class', input.query.classId);
  if (input.query.courseId) search.set('course', input.query.courseId);
  if (input.moduleId) search.set('module', input.moduleId);
  if (input.lectureId) search.set('lecture', input.lectureId);
  if (input.problemId) search.set('problem', input.problemId);
  if (input.query.range !== '7d') search.set('range', input.query.range);
  if (input.sort) search.set('sort', input.sort);
  if (input.direction) search.set('direction', input.direction);
  for (const kind of input.attention ?? []) search.append('attention', kind);
  const base = `${routes.academy(input.academySlug)}/teach/students`;
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

/**
 * Where a signal on this page opens for inspection.
 *
 * Every curriculum drill-down lands in the class-scoped Solution status page,
 * carrying the filters that describe what was clicked. It never invents a
 * route: an academy-wide signal without a class has nowhere authorized to go,
 * so the caller is given null and renders no action rather than a dead link.
 */
export function solutionStatusPath(input: {
  academySlug: string;
  classId: string | null;
  view?: 'students' | 'problems';
  courseId?: string | null;
  membershipId?: string | null;
  materialId?: string | null;
  attention?: string | null;
}): string | null {
  if (!input.classId) return null;
  const search = new URLSearchParams();
  if (input.view === 'problems') search.set('view', 'problems');
  if (input.courseId) search.append('course', input.courseId);
  if (input.attention) search.append('attention', input.attention);
  if (input.view === 'problems' && input.materialId) {
    search.set('problem', input.materialId);
  }
  if (input.view !== 'problems' && input.membershipId) {
    search.set('student', input.membershipId);
  }
  const base =
    `${routes.academy(input.academySlug)}` +
    `/teach/classes/${input.classId}/progress`;
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

function readId(value: string | null): string | null {
  if (!value || value === 'all') return null;
  return idPattern.test(value) ? value : null;
}

export function toSearchParams(
  params:
    | string
    | URLSearchParams
    | Record<string, string | string[] | undefined>,
): URLSearchParams {
  if (typeof params === 'string') return new URLSearchParams(params);
  if (params instanceof URLSearchParams) return params;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const item of value) search.append(key, item);
    else if (value !== undefined) search.append(key, value);
  }
  return search;
}

export { readId };
