'use client';

import type { TeacherStudentList } from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';

import { orpc } from '@/lib/orpc';

import {
  parseStudentsQuery,
  serializeStudentsQuery,
  studentsPath,
  withStudentsChange,
  type StudentsQuery,
} from '../_lib/students-url';

/**
 * Student analytics' one source of truth, and its one writer.
 *
 * The URL holds every filter, the sort, and the page; this parses it, writes
 * changes back with `replaceState` so narrowing a filter does not push a
 * history entry per keystroke, and adopts a real navigation — Back, or a link
 * a colleague sent — when one happens.
 */
export function useStudentsState(academyId: string) {
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();

  const urlQuery = React.useMemo(
    () => parseStudentsQuery(new URLSearchParams(searchKey)),
    [searchKey],
  );

  const [query, setQuery] = React.useState<StudentsQuery>(urlQuery);
  const [urlKey, setUrlKey] = React.useState(searchKey);
  if (urlKey !== searchKey) {
    setUrlKey(searchKey);
    setQuery(urlQuery);
  }

  const path = studentsPath(academyId, query);
  React.useEffect(() => {
    if (path !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState(null, '', path);
    }
  }, [path]);

  return {
    query,
    path,
    change: React.useCallback(
      (partial: Partial<StudentsQuery>) =>
        setQuery((current) => withStudentsChange(current, partial)),
      [],
    ),
  };
}

/**
 * One page of the table.
 *
 * `keepPreviousData` is what makes paging and sorting readable: the rows in
 * hand stay on screen while the next page loads, dimmed and marked busy, rather
 * than the table emptying and refilling under the reader's cursor.
 *
 * The search term is debounced before it reaches here, so a teacher typing a
 * name issues one request rather than one per letter.
 */
export function useTeacherStudentsQuery(
  academyId: string,
  query: StudentsQuery,
  initialData: TeacherStudentList | null,
  initialKey: string,
) {
  const key = serializeStudentsQuery(query);

  return useQuery({
    queryKey: ['academy-teacher-students', academyId, key],
    queryFn: () =>
      orpc.academyTeacherStudents.list({
        academyId,
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.courseId ? { courseId: query.courseId } : {}),
        ...(query.moduleId ? { moduleId: query.moduleId } : {}),
        ...(query.lectureId ? { lectureId: query.lectureId } : {}),
        ...(query.problemId ? { problemId: query.problemId } : {}),
        ...(query.search.trim() ? { search: query.search.trim() } : {}),
        range: query.range,
        attention: query.attention,
        sort: query.sort,
        direction: query.direction,
        page: query.page,
        pageSize: query.pageSize,
      }),
    initialData: key === initialKey ? (initialData ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * A value that lags behind its input.
 *
 * Used for the search box alone. Every other control on the page is a discrete
 * choice worth a request the moment it is made; a name typed one letter at a
 * time is not, and issuing eight requests for "Jiwoo" would leave the table
 * showing the answer to "Jiwo".
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
