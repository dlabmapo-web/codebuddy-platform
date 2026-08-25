import { routes } from '@/lib/routes';
import {
  teacherAttentionKinds,
  teacherProgressStatuses,
  teacherStudentSortKeys,
  sortDirections,
  type SortDirection,
  type TeacherAttentionKind,
  type TeacherProgressStatus,
  type TeacherStudentSort,
} from '@cove/shared';

/**
 * The URL is what Solution status is.
 *
 * Both lenses, every filter, and the open selection live here, so a teacher
 * can send a colleague the exact screen they are looking at and Back from a
 * reviewed attempt returns to it rather than to a reset page.
 *
 * Parsing is total: anything unsupported is dropped rather than refused, so a
 * hand-edited or stale address renders a page instead of an error. Serializing
 * is canonical — one state produces exactly one address — and cascading is
 * enforced in one place: a module cannot outlive its course, a lecture cannot
 * outlive its module, and a student and a problem cannot both be open, because
 * they belong to different lenses.
 *
 * The server repeats every scope check regardless. Nothing here is
 * authorization; it only decides what is worth asking for.
 *
 * See §5.2 of the teacher solution status design.
 */

export type ProgressView = 'students' | 'problems';

export type ProgressQuery = {
  view: ProgressView;
  q: string;
  courseIds: string[];
  moduleId: string | null;
  lectureId: string | null;
  statuses: TeacherProgressStatus[];
  attention: TeacherAttentionKind[];
  /** The open student, by class membership. Never a user id. */
  membershipId: string | null;
  /** The open problem, in the By-problem lens. */
  materialId: string | null;
  sort: TeacherStudentSort | null;
  direction: SortDirection;
  page: number;
};

export const emptyProgressQuery: ProgressQuery = {
  view: 'students',
  q: '',
  courseIds: [],
  moduleId: null,
  lectureId: null,
  statuses: [],
  attention: [],
  membershipId: null,
  materialId: null,
  sort: null,
  direction: 'desc',
  page: 1,
};

/** Emitted in this order, always, so equivalent states share one address. */
const parameterOrder = [
  'view',
  'q',
  'course',
  'module',
  'lecture',
  'status',
  'attention',
  'student',
  'problem',
  'sort',
  'direction',
  'page',
] as const;

const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseProgressQuery(
  params:
    | string
    | URLSearchParams
    | Record<string, string | string[] | undefined>,
): ProgressQuery {
  const search =
    typeof params === 'string'
      ? new URLSearchParams(params)
      : params instanceof URLSearchParams
        ? params
        : toSearchParams(params);

  const view: ProgressView =
    search.get('view') === 'problems' ? 'problems' : 'students';
  const sort =
    teacherStudentSortKeys.find((key) => key === search.get('sort')) ?? null;
  const direction = search.get('direction');

  const courseIds = unique(search.getAll('course').filter(isId));
  const moduleId = firstId(search.get('module'));
  const lectureId = firstId(search.get('lecture'));

  return canonicalize({
    view,
    q: (search.get('q') ?? '').trim(),
    courseIds,
    moduleId,
    lectureId,
    statuses: unique(
      search
        .getAll('status')
        .filter((value): value is TeacherProgressStatus =>
          (teacherProgressStatuses as readonly string[]).includes(value),
        ),
    ),
    attention: unique(
      search
        .getAll('attention')
        .filter((value): value is TeacherAttentionKind =>
          (teacherAttentionKinds as readonly string[]).includes(value),
        ),
    ),
    membershipId: firstId(search.get('student')),
    materialId: firstId(search.get('problem')),
    sort,
    // A direction without a sorted column orders nothing, so the roster's own
    // default stands until a supported column is chosen.
    direction:
      sort && sortDirections.find((value) => value === direction)
        ? (direction as SortDirection)
        : sort
          ? 'asc'
          : 'desc',
    page: parsePage(search.get('page')),
  });
}

/**
 * The rules a valid state always satisfies, applied in one place.
 *
 * Selecting a student and selecting a problem are mutually exclusive because
 * they are how the two lenses are read; a URL claiming both is a URL that
 * describes no screen.
 */
export function canonicalize(query: ProgressQuery): ProgressQuery {
  const membershipId = query.view === 'students' ? query.membershipId : null;
  const materialId = query.view === 'problems' ? query.materialId : null;
  return {
    ...query,
    membershipId,
    materialId,
    // A lecture without its module, or a module without a single chosen
    // course, is a coordinate nobody can see in the interface.
    moduleId: query.courseIds.length === 1 ? query.moduleId : null,
    lectureId:
      query.courseIds.length === 1 && query.moduleId ? query.lectureId : null,
    page: Math.max(1, Math.floor(query.page)),
  };
}

export function serializeProgressQuery(query: ProgressQuery): string {
  const canonical = canonicalize(query);
  const search = new URLSearchParams();
  for (const key of parameterOrder) {
    switch (key) {
      case 'view':
        // Absent means By student. The default never appears in the address.
        if (canonical.view !== 'students') search.set('view', canonical.view);
        break;
      case 'q':
        if (canonical.q.trim()) search.set('q', canonical.q.trim());
        break;
      case 'course':
        for (const value of canonical.courseIds) search.append('course', value);
        break;
      case 'module':
        if (canonical.moduleId) search.set('module', canonical.moduleId);
        break;
      case 'lecture':
        if (canonical.lectureId) search.set('lecture', canonical.lectureId);
        break;
      case 'status':
        for (const value of canonical.statuses) search.append('status', value);
        break;
      case 'attention':
        for (const value of canonical.attention) {
          search.append('attention', value);
        }
        break;
      case 'student':
        if (canonical.membershipId) {
          search.set('student', canonical.membershipId);
        }
        break;
      case 'problem':
        if (canonical.materialId) search.set('problem', canonical.materialId);
        break;
      case 'sort':
        if (canonical.sort) search.set('sort', canonical.sort);
        break;
      case 'direction':
        if (canonical.sort) search.set('direction', canonical.direction);
        break;
      case 'page':
        if (canonical.page > 1) search.set('page', String(canonical.page));
        break;
    }
  }
  return search.toString();
}

export function progressBasePath(academySlug: string, classId: string): string {
  return `${routes.academy(academySlug)}/teach/classes/${classId}/progress`;
}

export function progressPath(
  academySlug: string,
  classId: string,
  query: ProgressQuery,
): string {
  const search = serializeProgressQuery(query);
  const base = progressBasePath(academySlug, classId);
  return search ? `${base}?${search}` : base;
}

/**
 * Any change to what the server is being asked resets to page one.
 *
 * Staying on page 7 of a table that now has two is how a reader ends up
 * looking at an empty result they cannot explain.
 */
export function withProgressChange(
  current: ProgressQuery,
  change: Partial<ProgressQuery>,
): ProgressQuery {
  return canonicalize({ ...current, ...change, page: 1 });
}

export function withProgressPage(
  current: ProgressQuery,
  page: number,
): ProgressQuery {
  return canonicalize({ ...current, page });
}

/**
 * Switching lens keeps the class and the curriculum filters and drops the
 * selection.
 *
 * A student and a problem are not translations of each other, so carrying one
 * across would open something the teacher did not choose. Course, module, and
 * lecture survive because both lenses mean the same thing by them.
 */
export function withProgressView(
  current: ProgressQuery,
  view: ProgressView,
): ProgressQuery {
  return canonicalize({
    ...current,
    view,
    membershipId: null,
    materialId: null,
    sort: null,
    direction: 'desc',
    page: 1,
  });
}

/** Choosing a course clears the module and lecture it invalidated. */
export function withCourseSelection(
  current: ProgressQuery,
  courseIds: string[],
): ProgressQuery {
  return withProgressChange(current, {
    courseIds,
    moduleId: null,
    lectureId: null,
  });
}

export function withModuleSelection(
  current: ProgressQuery,
  moduleId: string | null,
): ProgressQuery {
  return withProgressChange(current, { moduleId, lectureId: null });
}

/**
 * The address a Review link may carry back.
 *
 * Only this class's own Solution status path is accepted, and only its
 * supported parameters survive, so a crafted `returnTo` cannot turn Back into
 * an open redirect or into another class's page.
 */
export function safeReturnTo(
  academySlug: string,
  classId: string,
  candidate: string | null | undefined,
): string {
  const root = progressBasePath(academySlug, classId);
  if (!candidate) return root;

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return root;
  }
  // A protocol-relative or absolute URL is not a path on this site, whatever
  // it looks like after the leading slash.
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return root;

  const [path, search = ''] = decoded.split('?');
  if (path !== root) return root;
  return progressPath(
    academySlug,
    classId,
    parseProgressQuery(new URLSearchParams(search)),
  );
}

/** Where an attempt is opened, carrying the exact state to come back to. */
export function reviewPath(input: {
  academySlug: string;
  classId: string;
  membershipId: string;
  submissionId: string;
  returnTo: string;
}): string {
  const search = new URLSearchParams({ returnTo: input.returnTo });
  return (
    `${routes.academy(input.academySlug)}/teach/classes/${input.classId}` +
    `/students/${input.membershipId}/submissions/${input.submissionId}` +
    `?${search.toString()}`
  );
}

function parsePage(value: string | null): number {
  if (!value) return 1;
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function firstId(value: string | null): string | null {
  return value && idPattern.test(value) ? value : null;
}

function isId(value: string): boolean {
  return idPattern.test(value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function toSearchParams(
  params: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const item of value) search.append(key, item);
    else if (value !== undefined) search.append(key, value);
  }
  return search;
}
