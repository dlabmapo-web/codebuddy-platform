import {
  DEFAULT_STUDENT_PAGE_SIZE,
  STUDENT_PAGE_SIZES,
  STUDENT_SEARCH_MAX_LENGTH,
  overviewAttentionKinds,
  overviewRanges,
  sortDirections,
  studentSortKeys,
  type OverviewRange,
  type SortDirection,
  type StudentAttentionFilter,
  type StudentSortKey,
} from '@cove/shared';

/**
 * The complete Student analytics state, in the address.
 *
 * Eleven parameters is a lot for a URL, and it is the point: §5.4 requires the
 * whole state to be deep-linkable and to survive a reload, because the thing a
 * teacher does with this page is narrow it for ten minutes and then send it to
 * the colleague covering their class. A page that reset on refresh would make
 * that work disposable.
 *
 * Parsing is total. Anything unsupported — a hand-edited id, a page size that
 * is not offered, a sort key from an older build — is dropped rather than
 * refused, so a stale or hostile address renders a page instead of an error.
 *
 * The dependent chain is enforced here as well as on the server: clearing a
 * course clears the module, lecture, and problem under it, because a lecture
 * whose course is gone describes a scope no picker on the page can reproduce.
 * None of this is authorization — the server resolves the scope again and its
 * response says which levels it actually used.
 *
 * See §5.4 of the teacher overview and student analytics redesign.
 */

export type StudentsQuery = {
  classId: string | null;
  courseId: string | null;
  moduleId: string | null;
  lectureId: string | null;
  problemId: string | null;
  range: OverviewRange;
  sort: StudentSortKey;
  direction: SortDirection;
  page: number;
  pageSize: number;
  search: string;
  attention: StudentAttentionFilter;
};

export const defaultStudentsQuery: StudentsQuery = {
  classId: null,
  courseId: null,
  moduleId: null,
  lectureId: null,
  problemId: null,
  range: '7d',
  sort: 'score',
  direction: 'desc',
  page: 1,
  pageSize: DEFAULT_STUDENT_PAGE_SIZE,
  search: '',
  attention: [],
};

/** Emitted in this order, always, so equivalent states share one address. */
const parameterOrder = [
  'class',
  'course',
  'module',
  'lecture',
  'problem',
  'range',
  'attention',
  'search',
  'sort',
  'direction',
  'pageSize',
  'page',
] as const;

const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;



export function parseStudentsQuery(
  params:
    | string
    | URLSearchParams
    | Record<string, string | string[] | undefined>,
): StudentsQuery {
  const search = toSearchParams(params);

  const classId = readId(search.get('class'));
  const courseId = readId(search.get('course'));
  // Each level survives only if the one above it did. A module without its
  // course is not a narrower filter, it is an unreproducible one.
  const moduleId = courseId ? readId(search.get('module')) : null;
  const lectureId = moduleId ? readId(search.get('lecture')) : null;
  const problemId = lectureId ? readId(search.get('problem')) : null;

  const sort =
    studentSortKeys.find((value) => value === search.get('sort')) ??
    defaultStudentsQuery.sort;

  return {
    classId,
    courseId,
    moduleId,
    lectureId,
    problemId,
    range:
      overviewRanges.find((value) => value === search.get('range')) ??
      defaultStudentsQuery.range,
    sort,
    direction:
      sortDirections.find((value) => value === search.get('direction')) ??
      defaultStudentsQuery.direction,
    page: readPage(search.get('page')),
    pageSize: readPageSize(search.get('pageSize')),
    search: (search.get('search') ?? '').slice(0, STUDENT_SEARCH_MAX_LENGTH),
    // Repeated rather than comma-joined: `getAll` is what a URLSearchParams
    // round-trip preserves, and an unknown reason from an older build is
    // dropped instead of poisoning the whole filter.
    attention: search
      .getAll('attention')
      .filter((value): value is StudentAttentionFilter[number] =>
        (overviewAttentionKinds as readonly string[]).includes(value),
      ),
  };
}

export function serializeStudentsQuery(query: StudentsQuery): string {
  const search = new URLSearchParams();
  for (const key of parameterOrder) {
    switch (key) {
      case 'class':
        if (query.classId) search.set('class', query.classId);
        break;
      case 'course':
        if (query.courseId) search.set('course', query.courseId);
        break;
      case 'module':
        if (query.moduleId) search.set('module', query.moduleId);
        break;
      case 'lecture':
        if (query.lectureId) search.set('lecture', query.lectureId);
        break;
      case 'problem':
        if (query.problemId) search.set('problem', query.problemId);
        break;
      case 'search':
        if (query.search.trim()) search.set('search', query.search.trim());
        break;
      case 'attention':
        // Emitted in the canonical reason order rather than in click order, so
        // two teachers who picked the same two reasons share one address.
        for (const kind of overviewAttentionKinds) {
          if (query.attention.includes(kind)) search.append('attention', kind);
        }
        break;
      default: {
        // `range`, `sort`, `direction`, `pageSize`, and `page` are named
        // identically in the query and the address, so they need no mapping —
        // only the rule that a default never appears, which is what makes one
        // state have exactly one spelling.
        if (query[key] !== defaultStudentsQuery[key]) {
          search.set(key, String(query[key]));
        }
        break;
      }
    }
  }
  return search.toString();
}

export function studentsPath(academyId: string, query: StudentsQuery): string {
  const search = serializeStudentsQuery(query);
  const base = `/studio/academies/${academyId}/teach/students`;
  return search ? `${base}?${search}` : base;
}

/**
 * A change, with the descendants it invalidates cleared and the page reset.
 *
 * Page 1 is not a nicety. Narrowing to one lecture while sitting on page 7 of
 * the unfiltered roster would land on an empty table, and a teacher would
 * reasonably read that as "no students match" rather than "you are past the
 * end".
 */
export function withStudentsChange(
  current: StudentsQuery,
  partial: Partial<StudentsQuery>,
): StudentsQuery {
  const next = { ...current, ...partial };

  if (partial.classId !== undefined && partial.classId !== current.classId) {
    // A class change cannot preserve a course: the new class may not teach it,
    // and the server would drop it anyway. Clearing it here means the pickers
    // and the address agree before the response arrives.
    next.courseId = null;
  }
  if (next.courseId !== current.courseId) next.moduleId = null;
  if (next.moduleId !== current.moduleId) next.lectureId = null;
  if (next.lectureId !== current.lectureId) next.problemId = null;

  // Any change but paging itself returns to the first page.
  if (partial.page === undefined) next.page = 1;

  return next;
}

/** The options a picker may show, given what is selected above it. */
export function optionsForParent<T extends { parentId: string | null }>(
  options: T[],
  parentId: string | null,
): T[] {
  if (!parentId) return [];
  return options.filter((option) => option.parentId === parentId);
}

function readId(value: string | null): string | null {
  if (!value || value === 'all') return null;
  return idPattern.test(value) ? value : null;
}

function readPage(value: string | null): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function readPageSize(value: string | null): number {
  const size = Number(value);
  return (STUDENT_PAGE_SIZES as readonly number[]).includes(size)
    ? size
    : DEFAULT_STUDENT_PAGE_SIZE;
}

function toSearchParams(
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
