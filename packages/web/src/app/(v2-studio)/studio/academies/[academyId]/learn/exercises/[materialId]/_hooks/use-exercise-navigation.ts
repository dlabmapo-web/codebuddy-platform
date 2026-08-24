'use client';

import {
  navigatorPathFromBreadcrumb,
  toNavigatorContext,
  type LearnExerciseBootstrap,
  type WorkspaceNavigatorContext,
} from '@cove/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { orpc } from '@/lib/orpc';

/** Long enough that walking a lecture never refetches a neighbour twice. */
const WORKSPACE_STALE_MS = 60_000;

export type ExerciseTransitionLifecycle = {
  /** Whether a run or submission currently owns the workspace. */
  canStart: () => boolean;
  /** Settle state only after the destination has loaded successfully. */
  beforeCommit: () => void;
};

export function workspaceQueryKey(academyId: string, classId: string, materialId: string) {
  return ['learn', academyId, 'workspace', classId, materialId];
}

/**
 * Moving between exercises without leaving the workspace.
 *
 * A `router.push` re-renders the server page and remounts the workspace, which
 * tears down the Pyodide worker and forces the runtime to reload — measured at
 * ~1,000ms against ~60ms for the swap, and the cost that made v1 slow in
 * production. Holding the workspace in state keeps the editor and the worker
 * alive across problems.
 *
 * Previous/Next, an arbitrary row in the curriculum panel, and browser
 * back/forward are all the same guarded transition: fetch first, commit
 * everything at once, and leave the current exercise entirely intact if the
 * fetch fails. A half-applied transition — a new breadcrumb over the old code
 * — is the one outcome none of the three may produce.
 */
export function useExerciseNavigation({
  academyId,
  classId,
  bootstrap,
  beforeTransitionRef,
}: {
  academyId: string;
  classId: string;
  bootstrap: LearnExerciseBootstrap;
  /**
   * The workspace-owned lifecycle that must run before every transition.
   *
   * Kept as a ref because the hook owns browser history while the page owns the
   * draft, runner, and submission. A callback argument on `navigate` would let
   * row clicks clean up correctly while Back/Forward silently skipped it.
   */
  beforeTransitionRef: React.RefObject<ExerciseTransitionLifecycle | null>;
}) {
  const queryClient = useQueryClient();
  const [workspace, setWorkspace] = React.useState(bootstrap.workspace);
  /** The destination in flight, which is also what the panel marks busy. */
  const [navigatingTo, setNavigatingTo] = React.useState<string | null>(null);
  const [failedDestination, setFailedDestination] = React.useState<
    string | null
  >(null);

  const [trackedBootstrap, setTrackedBootstrap] = React.useState(bootstrap);
  if (trackedBootstrap !== bootstrap) {
    // A real navigation happened (deep link, reload): adopt the server's
    // payload rather than keeping stale in-memory state.
    setTrackedBootstrap(bootstrap);
    setWorkspace(bootstrap.workspace);
  }

  /**
   * Which transition the workspace belongs to.
   *
   * Every commit is guarded by this token. A slow first request that resolves
   * after the reader has already chosen somewhere else finds its token stale
   * and returns without touching anything — the alternative being a workspace
   * that lands on a problem nobody asked for.
   */
  const tokenRef = React.useRef(0);

  const fetchWorkspace = React.useCallback(
    (materialId: string) =>
      queryClient.fetchQuery({
        queryKey: workspaceQueryKey(academyId, classId, materialId),
        queryFn: () =>
          orpc.learn.getExerciseWorkspace({ academyId, classId, materialId }),
        staleTime: WORKSPACE_STALE_MS,
      }),
    [academyId, classId, queryClient],
  );

  /**
   * One ordered transition: fetch, then commit workspace and URL together.
   *
   * `pushUrl` is false for a popstate, where the browser has already moved the
   * address and appending a second entry would make Back require two presses.
   */
  const commit = React.useCallback(
    async (materialId: string, options: { pushUrl: boolean }) => {
      // Selecting the exercise already on screen is not a transition; doing
      // the work anyway would stop the runner and clear the terminal for it.
      if (materialId === workspace.exercise.materialId) return;

      // One gate for rows, Previous/Next, retry, and popstate. A run or
      // submission may refuse the attempt before any request or cleanup.
      if (!(beforeTransitionRef.current?.canStart() ?? false)) {
        if (!options.pushUrl) {
          window.history.replaceState(
            null,
            '',
            `/studio/academies/${academyId}/learn/exercises/${workspace.exercise.materialId}?classId=${classId}`,
          );
        }
        return;
      }

      const token = tokenRef.current + 1;
      tokenRef.current = token;
      setNavigatingTo(materialId);
      setFailedDestination(null);
      try {
        // Resolves from cache when the neighbour was prefetched, so the common
        // case costs no request at all.
        const next = await fetchWorkspace(materialId);
        // Superseded while in flight: a newer destination owns the workspace
        // now, and this response is no longer about anywhere the reader is.
        if (tokenRef.current !== token) return;
        // Fetch failure leaves the current terminal, result, and hints intact.
        // Cleanup belongs to a transition that is definitely committing, not
        // merely to an attempted destination.
        beforeTransitionRef.current?.beforeCommit();
        setWorkspace(next);
        if (options.pushUrl) {
          window.history.pushState(
            null,
            '',
            `/studio/academies/${academyId}/learn/exercises/${materialId}?classId=${classId}`,
          );
        }
      } catch {
        if (tokenRef.current !== token) return;
        // Deliberately no fallback to a real navigation. Routing away would
        // discard the draft, the terminal, and the running worker in order to
        // report a failure — the destination is what failed, and the exercise
        // the student is on is still perfectly good.
        setFailedDestination(materialId);
        if (!options.pushUrl) {
          // The address bar already moved. Put it back on the workspace that
          // is actually rendered rather than leaving the two disagreeing.
          window.history.replaceState(
            null,
            '',
            `/studio/academies/${academyId}/learn/exercises/${workspace.exercise.materialId}?classId=${classId}`,
          );
        }
      } finally {
        if (tokenRef.current === token) setNavigatingTo(null);
        void queryClient.invalidateQueries({
          queryKey: ['learn', academyId, 'drafts'],
        });
      }
    },
    [
      academyId,
      classId,
      beforeTransitionRef,
      fetchWorkspace,
      queryClient,
      workspace.exercise.materialId,
    ],
  );

  const navigate = React.useCallback(
    (materialId: string) => commit(materialId, { pushUrl: true }),
    [commit],
  );

  const retry = React.useCallback(() => {
    if (failedDestination) void commit(failedDestination, { pushUrl: true });
  }, [commit, failedDestination]);

  /* ------------------------------------------------------------- curriculum */

  const courseId = workspace.breadcrumb.course.id;
  // Memoized because the panel below keys memos and an effect on the context
  // this ends up inside: rebuilt every render, it would make everything
  // downstream recompute on every render for a position that had not moved.
  const path = React.useMemo(
    () => navigatorPathFromBreadcrumb(workspace),
    [workspace],
  );

  /**
   * The course behind the panel, cached per course rather than per exercise.
   *
   * Walking a lecture reuses what is already in memory; only a course change
   * or an invalidated progress refresh reaches the network. The bootstrap
   * seeds it, so opening the workspace never pays for the outline twice.
   */
  const outlineQuery = useQuery({
    queryKey: ['learn', academyId, 'navigator', classId, courseId],
    queryFn: async () => {
      const outline = await orpc.learn.getCourseOutline({ academyId, classId, courseId });
      const next = toNavigatorContext(outline, workspace.exercise.materialId);
      if (!next) throw new Error('COURSE_MISSING_EXERCISE');
      return next;
    },
    initialData:
      courseId === bootstrap.navigator.course.id
        ? bootstrap.navigator
        : undefined,
    // The server delivered this course with the workspace moments ago, so a
    // mount is not a reason to fetch it again. A course change produces a new
    // key with no seed, and does.
    refetchOnMount: false,
    retry: false,
    staleTime: WORKSPACE_STALE_MS,
  });

  const navigator: WorkspaceNavigatorContext | null = React.useMemo(
    // The cached tree is a fact about the course; the path is a fact about the
    // exercise on screen, so it is restated here rather than read back out of
    // a payload that was fetched at some other position in the course.
    () => (outlineQuery.data ? { ...outlineQuery.data, path } : null),
    [outlineQuery.data, path],
  );

  const loadCourse = React.useCallback(() => {
    void outlineQuery.refetch();
  }, [outlineQuery]);

  /**
   * Progress after a submission, without disturbing anything the reader owns.
   *
   * The tree is replaced, not reconciled: the panel keys its expanded branches
   * by course, so fresh statuses land without closing anything the reader
   * opened. A badge that only updated on reload is a badge nobody trusts.
   */
  const refreshProgress = React.useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ['learn', academyId, 'navigator', classId, courseId],
    });
  }, [academyId, classId, courseId, queryClient]);

  /* -------------------------------------------------------------- prefetch */

  React.useEffect(() => {
    // Prefetched into the same cache `commit` reads, so the neighbour lands
    // with the payload already in hand.
    for (const neighbor of [
      workspace.neighbors.previous,
      workspace.neighbors.next,
    ]) {
      if (!neighbor) continue;
      void queryClient.prefetchQuery({
        queryKey: workspaceQueryKey(academyId, classId, neighbor.materialId),
        queryFn: () =>
          orpc.learn.getExerciseWorkspace({
            academyId,
            classId,
            materialId: neighbor.materialId,
          }),
        staleTime: WORKSPACE_STALE_MS,
      });
    }
  }, [academyId, classId, queryClient, workspace.neighbors]);

  /* --------------------------------------------------------------- history */

  const commitRef = React.useRef(commit);
  React.useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  React.useEffect(() => {
    // `pushState` means back/forward no longer re-render the page, so the
    // popped URL has to be reconciled by hand — through the same guarded
    // machinery, so a failed Back behaves exactly like a failed row click.
    const onPopState = () => {
      const popped = window.location.pathname.split('/').pop();
      if (!popped) return;
      void commitRef.current(popped, { pushUrl: false });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  return {
    workspace,
    navigator,
    navigatorFailed: outlineQuery.isError,
    /** Where the header prints the workspace's position. */
    path,
    navigating: navigatingTo !== null,
    navigatingTo,
    failedDestination,
    loadCourse,
    navigate,
    refreshProgress,
    retry,
  };
}
