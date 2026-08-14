'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AcademyProfileResponse, MyProfileResponse } from '@cove/shared';

import { orpc } from '@/lib/orpc';

import { selectAcademy } from '../_lib/academy-selection';
import { uploadProfileImage } from '../_lib/upload-image';

export const myProfileKey = ['profile', 'me'] as const;

export function academyProfileKey(academyId: string) {
  return ['profile', 'academy', academyId] as const;
}

/**
 * The two reads My Page is built from, plus the decision about which academy
 * the second one is for.
 *
 * They are separate queries because they are separately owned and separately
 * authorized: the account always loads, and the academy profile is whatever
 * the selected membership allows. Which academy that is depends on the account
 * response, so the choice lives here rather than in the component — otherwise
 * the component has to render once with no answer and once with one.
 */
export function useMyPage(input: {
  /** The `academy` query value, which may name anything at all. */
  requested: string | null;
  /** The last academy this browser looked at, or null before hydration. */
  remembered: string | null;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const profileQuery = useQuery<MyProfileResponse>({
    queryKey: myProfileKey,
    queryFn: () => orpc.profile.getMe({}),
    retry: false,
  });

  const selection = selectAcademy(
    profileQuery.data?.memberships ?? [],
    input.requested,
    input.remembered,
  );
  const academyId = selection.selected?.academyId ?? null;

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
    selection,
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
