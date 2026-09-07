'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcademyProfileResponse, MyProfileResponse } from '@cove/shared';

import { orpc } from '@/lib/orpc';

import { uploadProfileImage } from './upload-image';

export const myProfileKey = ['profile', 'me'] as const;

export function academyProfileKey(academyId: string) {
  return ['profile', 'academy', academyId] as const;
}

/**
 * The two reads My Page is built from.
 *
 * Separate queries because they are separately owned and separately
 * authorized: the account always loads, and the academy profile is whatever
 * the named membership allows.
 *
 * Which academy is no longer decided here. It used to be — from the query,
 * then local storage, then the first membership — which meant the component
 * rendered once with no answer and once with one. The address answers it now:
 * inside an academy the slug names it, and at `/account` there is deliberately
 * no academy at all.
 */
export function useMyPage(input: {
  /** The academy whose profile to read, or null on the global page. */
  academyId: string | null;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const profileQuery = useQuery<MyProfileResponse>({
    queryKey: myProfileKey,
    queryFn: () => orpc.profile.getMe({}),
    retry: false,
  });

  const academyId = input.academyId;

  const academyQuery = useQuery<AcademyProfileResponse>({
    queryKey: academyProfileKey(academyId ?? 'none'),
    queryFn: () => orpc.academyProfile.getMine({ academyId: academyId! }),
    enabled: Boolean(academyId),
    retry: false,
  });

  /**
   * Every mutation returns the whole response, so the cache is written
   * directly rather than invalidated. It removes a refetch between "Saved"
   * appearing and the revision the next save has to name.
   */
  const applyAcademy = useCallback(
    (response: AcademyProfileResponse) => {
      queryClient.setQueryData(
        academyProfileKey(response.context.academyId),
        response,
      );
    },
    [queryClient],
  );

  const applyProfile = useCallback(
    (response: MyProfileResponse) => {
      queryClient.setQueryData(myProfileKey, response);
    },
    [queryClient],
  );

  const imageMutation = useMutation({
    /** A null file removes the picture and reveals whatever is beneath it. */
    mutationFn: async (
      change:
        | { scope: 'GLOBAL'; file: File | null }
        | { scope: 'ACADEMY'; academyId: string; file: File | null },
    ) => {
      if (change.scope === 'GLOBAL') {
        applyProfile(
          change.file
            ? await uploadProfileImage<MyProfileResponse>(change.file)
            : await orpc.profile.removeImage({}),
        );
        router.refresh();
        return;
      }
      applyAcademy(
        change.file
          ? await uploadProfileImage<AcademyProfileResponse>(change.file, {
            academyId: change.academyId,
          })
          : await orpc.academyProfile.removeImage({
            academyId: change.academyId,
          }),
      );
      router.refresh();
    },
  });

  return {
    profile: profileQuery.data ?? null,
    academy: academyId ? academyQuery.data ?? null : null,
    academyId,
    loading:
      profileQuery.isPending || (Boolean(academyId) && academyQuery.isPending),
    loadError: profileQuery.error ?? academyQuery.error ?? null,
    applyProfile,
    applyAcademy,
    image: {
      pending: imageMutation.isPending,
      error: imageMutation.error,
      /** Awaitable: the picker clears its crop preview when this resolves. */
      change: imageMutation.mutateAsync,
    },
  };
}

export type MyPageState = ReturnType<typeof useMyPage>;
