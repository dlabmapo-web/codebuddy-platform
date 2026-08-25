'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { orpc } from '@/lib/orpc';

export function useSignupAcademies(invitedAcademyId?: string) {
  const [academyId, setAcademyId] = useState(invitedAcademyId ?? '');
  const academiesQuery = useQuery({
    queryKey: ['academies', 'signup'],
    queryFn: () => orpc.academies.listForSignup({}),
    staleTime: 5 * 60_000,
  });

  return {
    academyId,
    selectAcademy: setAcademyId,
    academies: academiesQuery.data?.academies ?? [],
    loading: academiesQuery.isPending,
    error: academiesQuery.error,
    locked: Boolean(invitedAcademyId),
  };
}

export type SignupAcademiesState = ReturnType<typeof useSignupAcademies>;
