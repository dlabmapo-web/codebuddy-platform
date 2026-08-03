'use client';

import type { LearnExerciseWorkspace } from '@cove/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { orpc } from '@/lib/orpc';

/** Long enough that walking a lecture never refetches a neighbour twice. */
const WORKSPACE_STALE_MS = 60_000;

export function workspaceQueryKey(academyId: string, materialId: string) {
  return ['learn', academyId, 'workspace', materialId];
}

/**
 * Previous/Next, swapping the workspace in place rather than routing.
 *
 * A `router.push` re-renders the server page and remounts the workspace, which
 * tears down the Pyodide worker and forces the runtime to reload — measured at
 * ~1,000ms against ~60ms for the swap, and the cost that made v1 slow in
 * production. Holding the workspace in state keeps the editor and the worker
 * alive across problems.
 */
export function useExerciseNavigation({
  academyId,
  initialWorkspace,
}: {
  academyId: string;
  initialWorkspace: LearnExerciseWorkspace;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [workspace, setWorkspace] = React.useState(initialWorkspace);
  const [navigating, setNavigating] = React.useState(false);

  const [trackedInitial, setTrackedInitial] = React.useState(initialWorkspace);
  if (trackedInitial !== initialWorkspace) {
    // A real navigation happened (deep link, reload): adopt the server's
    // payload rather than keeping stale in-memory state.
    setTrackedInitial(initialWorkspace);
    setWorkspace(initialWorkspace);
  }

  const fetchWorkspace = React.useCallback(
    (materialId: string) =>
      queryClient.fetchQuery({
        queryKey: workspaceQueryKey(academyId, materialId),
        queryFn: () =>
          orpc.learn.getExerciseWorkspace({ academyId, materialId }),
        staleTime: WORKSPACE_STALE_MS,
      }),
    [academyId, queryClient],
  );

  const navigate = React.useCallback(
    async (materialId: string) => {
      setNavigating(true);
      try {
        // Resolves from cache when the neighbour was prefetched, so the common
        // case costs no request at all.
        setWorkspace(await fetchWorkspace(materialId));
        window.history.pushState(
          null,
          '',
          `/studio/academies/${academyId}/learn/exercises/${materialId}`,
        );
      } catch {
        // A failed swap falls back to a real navigation, which surfaces the
        // error page rather than stranding the student on the old problem.
        router.push(
          `/studio/academies/${academyId}/learn/exercises/${materialId}`,
        );
      } finally {
        setNavigating(false);
        void queryClient.invalidateQueries({
          queryKey: ['learn', academyId, 'drafts'],
        });
      }
    },
    [academyId, fetchWorkspace, queryClient, router],
  );

  React.useEffect(() => {
    // Prefetched into the same cache `navigate` reads, so Next lands with the
    // payload already in hand.
    for (const neighbor of [
      workspace.neighbors.previous,
      workspace.neighbors.next,
    ]) {
      if (!neighbor) continue;
      void queryClient.prefetchQuery({
        queryKey: workspaceQueryKey(academyId, neighbor.materialId),
        queryFn: () =>
          orpc.learn.getExerciseWorkspace({
            academyId,
            materialId: neighbor.materialId,
          }),
        staleTime: WORKSPACE_STALE_MS,
      });
    }
  }, [academyId, queryClient, workspace.neighbors]);

  React.useEffect(() => {
    // `pushState` means back/forward no longer re-render the page, so the
    // popped URL has to be reconciled by hand.
    const onPopState = () => {
      const popped = window.location.pathname.split('/').pop();
      if (!popped || popped === workspace.exercise.materialId) return;
      void fetchWorkspace(popped)
        .then(setWorkspace)
        .catch(() => router.refresh());
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [fetchWorkspace, router, workspace.exercise.materialId]);

  return { workspace, navigating, navigate };
}
