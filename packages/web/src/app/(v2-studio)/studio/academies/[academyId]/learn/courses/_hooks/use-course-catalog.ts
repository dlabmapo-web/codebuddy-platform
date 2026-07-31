'use client';

import type { LearnCourseSummary, LearnDraftSummary } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { orpc } from '@/lib/orpc';

export function useCourseCatalog({
  academyId,
  initialCourses,
  initialDrafts,
}: {
  academyId: string;
  initialCourses: LearnCourseSummary[];
  initialDrafts: LearnDraftSummary[];
}) {
  const queryClient = useQueryClient();
  const coursesKey = ['learn', academyId, 'courses'];
  const draftsKey = ['learn', academyId, 'drafts'];

  const coursesQuery = useQuery({
    queryKey: coursesKey,
    queryFn: () => orpc.learn.listCourses({ academyId }),
    initialData: { courses: initialCourses },
    retry: false,
  });

  const draftsQuery = useQuery({
    queryKey: draftsKey,
    queryFn: () => orpc.learn.listDrafts({ academyId }),
    initialData: { drafts: initialDrafts },
    retry: false,
  });

  const discard = useMutation({
    mutationFn: (materialId: string) =>
      orpc.learn.discardDraft({ academyId, materialId }),
    // Removing the row immediately keeps the panel from flashing the entry back
    // while the list refetches.
    onMutate: async (materialId: string) => {
      await queryClient.cancelQueries({ queryKey: draftsKey });
      const previous = queryClient.getQueryData<{ drafts: LearnDraftSummary[] }>(
        draftsKey,
      );
      queryClient.setQueryData(draftsKey, {
        drafts: (previous?.drafts ?? []).filter(
          (draft) => draft.materialId !== materialId,
        ),
      });
      return { previous };
    },
    onError: (_error, _materialId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(draftsKey, context.previous);
      }
    },
    onSettled: async () => {
      // The catalog's started counts move with the draft, so both refetch.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: draftsKey }),
        queryClient.invalidateQueries({ queryKey: coursesKey }),
      ]);
    },
  });

  return {
    courses: coursesQuery.data.courses,
    drafts: draftsQuery.data.drafts,
    discard: (materialId: string) => discard.mutate(materialId),
    discardingId: discard.isPending ? discard.variables : null,
  };
}

export type CourseCatalogState = ReturnType<typeof useCourseCatalog>;
