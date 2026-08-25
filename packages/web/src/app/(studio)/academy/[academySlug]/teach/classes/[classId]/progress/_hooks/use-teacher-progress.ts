'use client';

import type { TeacherStudentsResult } from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { orpc } from '@/lib/orpc';

import {
  parseProgressQuery,
  progressPath,
  serializeProgressQuery,
  withProgressChange,
  withProgressPage,
  withProgressView,
  type ProgressQuery,
  type ProgressView,
} from '../_lib/progress-url';

/** A pause in typing, not the gap between two words. */
const SEARCH_DEBOUNCE_MS = 350;

type Scope = { academyId: string; classId: string };

/**
 * The page's one source of truth, and its one writer.
 *
 * The URL holds the state; this hook parses it, keeps the search box
 * responsive while a teacher types, and writes changes back with
 * `replaceState` so paging does not push a history entry per click. Back
 * leaves the page; `returnTo` is what restores a position.
 *
 * Nothing here fetches. The data hooks below each take the settled state and
 * ask for exactly one region, which is what keeps a lecture expansion from
 * reloading a roster.
 */
export function useProgressState(scope: Scope) {
  const academySlug = useAcademySlug();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlQuery = React.useMemo(
    () => parseProgressQuery(new URLSearchParams(searchKey)),
    [searchKey],
  );

  const [query, setQuery] = React.useState<ProgressQuery>(urlQuery);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    // A real navigation happened — Back, or a shared link. Adopt it.
    setUrlKey(searchKey);
    setQuery(urlQuery);
  }

  const [debouncedSearch, setDebouncedSearch] = React.useState(query.q);
  React.useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(query.q),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [query.q]);

  // Everything but the search box applies at once; only `q` waits.
  const settled: ProgressQuery = React.useMemo(
    () => ({ ...query, q: debouncedSearch }),
    [debouncedSearch, query],
  );
  const path = progressPath(academySlug, scope.classId, settled);

  React.useEffect(() => {
    if (path !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', path);
    }
  }, [path]);

  return {
    /** What the controls render from, including the still-typing search. */
    query,
    /** What the server is being asked for. */
    settled,
    /** The exact address a Review link should carry as `returnTo`. */
    returnTo: path,
    change: React.useCallback(
      (partial: Partial<ProgressQuery>) =>
        setQuery((current) => withProgressChange(current, partial)),
      [],
    ),
    setPage: React.useCallback(
      (page: number) => setQuery((current) => withProgressPage(current, page)),
      [],
    ),
    setView: React.useCallback(
      (view: ProgressView) =>
        setQuery((current) => withProgressView(current, view)),
      [],
    ),
    reset: React.useCallback(
      () =>
        setQuery((current) =>
          withProgressChange(current, {
            q: '',
            courseIds: [],
            moduleId: null,
            lectureId: null,
            statuses: [],
            attention: [],
          }),
        ),
      [],
    ),
  };
}

export type ProgressState = ReturnType<typeof useProgressState>;

/**
 * Cache keys, built in one place.
 *
 * Every key names the academy, the class, and the region, so two classes never
 * share a cached roster and a stale response from a previous selection cannot
 * land in the current panel — TanStack Query discards it because the key it
 * belongs to is no longer mounted.
 */
function key(scope: Scope, region: string, ...rest: (string | number)[]) {
  return ['teacher-progress', scope.academyId, scope.classId, region, ...rest];
}

/** The roster. The only region the server renders for the first paint. */
export function useStudentsQuery(
  scope: Scope,
  query: ProgressQuery,
  initialData: TeacherStudentsResult | null,
  initialKey: string,
) {
  const filters = serializeProgressQuery({ ...query, membershipId: null });
  return useQuery({
    queryKey: key(scope, 'students', filters),
    queryFn: () =>
      orpc.teacherProgress.listStudents({
        ...scope,
        ...(query.q ? { q: query.q } : {}),
        ...(query.courseIds.length ? { courseIds: query.courseIds } : {}),
        ...(query.statuses.length ? { statuses: query.statuses } : {}),
        ...(query.attention.length ? { attention: query.attention } : {}),
        ...(query.sort ? { sort: query.sort, direction: query.direction } : {}),
        page: query.page,
      }),
    enabled: query.view === 'students',
    // Only the state the server page was rendered for; any change fetches.
    initialData: filters === initialKey ? (initialData ?? undefined) : undefined,
    // The rows in hand stay on screen, dimmed, until the next page arrives.
    placeholderData: keepPreviousData,
    retry: false,
  });
}

export function useStudentDetailQuery(scope: Scope, query: ProgressQuery) {
  const membershipId = query.membershipId;
  return useQuery({
    queryKey: key(
      scope,
      'student',
      membershipId ?? '',
      serializeProgressQuery({ ...query, sort: null }),
    ),
    queryFn: () =>
      orpc.teacherProgress.getStudentDetail({
        ...scope,
        membershipId: membershipId!,
        ...(query.q ? { q: query.q } : {}),
        ...(query.courseIds.length ? { courseIds: query.courseIds } : {}),
        ...(query.statuses.length ? { statuses: query.statuses } : {}),
        ...(query.attention.length ? { attention: query.attention } : {}),
        page: query.page,
      }),
    enabled: query.view === 'students' && Boolean(membershipId),
    retry: false,
  });
}

export function useCurriculumQuery(scope: Scope, query: ProgressQuery) {
  return useQuery({
    queryKey: key(
      scope,
      'curriculum',
      query.q,
      query.courseIds.join(',') || 'all',
    ),
    queryFn: () =>
      orpc.teacherProgress.listCurriculum({
        ...scope,
        ...(query.q ? { q: query.q } : {}),
        ...(query.courseIds.length ? { courseIds: query.courseIds } : {}),
      }),
    enabled: query.view === 'problems',
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/** One course's outline, requested only when that course is open. */
export function useCourseOutlineQuery(
  scope: Scope,
  query: ProgressQuery,
  courseId: string | null,
) {
  return useQuery({
    queryKey: key(scope, 'outline', courseId ?? '', query.q),
    queryFn: () =>
      orpc.teacherProgress.listCourseOutline({
        ...scope,
        courseId: courseId!,
        ...(query.q ? { q: query.q } : {}),
      }),
    enabled: query.view === 'problems' && Boolean(courseId),
    retry: false,
  });
}

export function useLectureProblemsQuery(
  scope: Scope,
  enabled: boolean,
  lectureId: string | null,
) {
  return useQuery({
    queryKey: key(scope, 'lecture', lectureId ?? ''),
    queryFn: () =>
      orpc.teacherProgress.listLectureProblems({
        ...scope,
        lectureId: lectureId!,
      }),
    enabled: enabled && Boolean(lectureId),
    retry: false,
  });
}

export function useProblemStudentsQuery(scope: Scope, query: ProgressQuery) {
  const materialId = query.materialId;
  return useQuery({
    queryKey: key(scope, 'problem', materialId ?? '', query.page),
    queryFn: () =>
      orpc.teacherProgress.listProblemStudents({
        ...scope,
        materialId: materialId!,
        page: query.page,
      }),
    enabled: query.view === 'problems' && Boolean(materialId),
    placeholderData: keepPreviousData,
    retry: false,
  });
}

/**
 * One student's attempts at one exercise.
 *
 * The same hook serves both lenses, because there is one attempt-history
 * contract; a second implementation is how two screens start disagreeing about
 * what a student did.
 */
export function useAttemptsQuery(
  scope: Scope,
  selection: { membershipId: string; materialId: string; page: number } | null,
) {
  return useQuery({
    queryKey: key(
      scope,
      'attempts',
      selection?.membershipId ?? '',
      selection?.materialId ?? '',
      selection?.page ?? 1,
    ),
    queryFn: () =>
      orpc.teacherProgress.listAttempts({
        ...scope,
        membershipId: selection!.membershipId,
        materialId: selection!.materialId,
        page: selection!.page,
      }),
    enabled: Boolean(selection),
    retry: false,
  });
}
