'use client';

import type { StaffRosterPage, StaffRosterQuery } from '@cove/shared';
import {
  parseStaffRosterQuery,
  serializeStaffRosterQuery,
  staffRosterResetsToFirstPage,
  teachersOnly,
} from '@cove/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

import { useUrlTableQuery } from '../../_hooks/use-url-table-query';

/** The Staff roster's table state, held in the URL. */
export function useStaffRosterState() {
  const academySlug = useAcademySlug();
  return useUrlTableQuery<StaffRosterQuery>({
    basePath: routes.academyStaff(academySlug),
    parse: parseStaffRosterQuery,
    resetsToFirstPage: staffRosterResetsToFirstPage,
    serialize: serializeStaffRosterQuery,
  });
}

/** One page of the roster, keeping the previous rows on screen meanwhile. */
export function useStaffRosterQuery(
  academyId: string,
  query: StaffRosterQuery,
  initialData: StaffRosterPage | null,
  initialKey: string,
) {
  // The key is the reader's own state, and the fetch is pinned to teachers.
  // Keying on the pinned query instead would disagree with the server's
  // `initialKey`, which is built from the address, and throw the first page
  // away to fetch the rows it already had.
  const key = serializeStaffRosterQuery(query);
  return useQuery({
    queryKey: ['academy-staff-roster', academyId, key],
    queryFn: () =>
      orpc.academyPeople.staff({ academyId, ...teachersOnly(query) }),
    initialData: key === initialKey ? (initialData ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}
