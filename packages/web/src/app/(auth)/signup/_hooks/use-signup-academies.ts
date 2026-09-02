'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { orpc } from '@/lib/orpc';

export function useSignupAcademies(
  invitedAcademyId?: string,
  /**
   * The invited academy as the invitation itself names it.
   *
   * `listForSignup` is a public directory of `ACTIVE` academies, so a locked
   * field looking its name up there renders blank for any other state — at
   * exactly the moment the recipient is deciding whether to trust the page.
   * The page reads the invitation server-side and passes the answer down; this
   * puts it in the list so the trigger has something true to show.
   */
  invitedAcademy?: { id: string; name: string } | null,
) {
  const [academyId, setAcademyId] = useState(invitedAcademyId ?? '');
  const academiesQuery = useQuery({
    queryKey: ['academies', 'signup'],
    queryFn: () => orpc.academies.listForSignup({}),
    staleTime: 5 * 60_000,
  });

  const listed = academiesQuery.data?.academies ?? [];
  const academies =
    invitedAcademy && !listed.some((academy) => academy.id === invitedAcademy.id)
      ? [...listed, invitedAcademy]
      : listed;

  return {
    academyId,
    selectAcademy: setAcademyId,
    academies,
    loading: academiesQuery.isPending,
    error: academiesQuery.error,
    locked: Boolean(invitedAcademyId),
  };
}

export type SignupAcademiesState = ReturnType<typeof useSignupAcademies>;
