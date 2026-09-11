'use client';

import type { StudentRosterPage, StudentRosterQuery } from '@cove/shared';
import {
  parseStudentRosterQuery,
  serializeStudentRosterQuery,
  studentRosterResetsToFirstPage,
} from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

import { useUrlTableQuery } from '../../_hooks/use-url-table-query';

/** The Students roster's table state, held in the URL. */
export function useStudentRosterState() {
  const academySlug = useAcademySlug();
  return useUrlTableQuery<StudentRosterQuery>({
    basePath: routes.academyStudents(academySlug),
    parse: parseStudentRosterQuery,
    resetsToFirstPage: studentRosterResetsToFirstPage,
    serialize: serializeStudentRosterQuery,
  });
}

/**
 * One page of the roster, keeping the previous rows on screen while the next
 * page loads — the directory's rule, for the directory's reason.
 */
export function useStudentRosterQuery(
  academyId: string,
  query: StudentRosterQuery,
  initialData: StudentRosterPage | null,
  initialKey: string,
) {
  const key = serializeStudentRosterQuery(query);
  return useQuery({
    queryKey: ['academy-student-roster', academyId, key],
    queryFn: () => orpc.academyPeople.students({ academyId, ...query }),
    initialData: key === initialKey ? (initialData ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}
