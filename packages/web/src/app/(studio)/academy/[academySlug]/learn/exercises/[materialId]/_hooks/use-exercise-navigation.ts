'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import {
  navigatorPathFromBreadcrumb,
  toNavigatorContext,
  type LearnExerciseBootstrap,
  type WorkspaceNavigatorContext,
} from '@cove/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { orpc } from '@/lib/orpc';
import {
  claimExerciseNavigation,
  exerciseExitDelta,
  materialIdFromExercisePath,
  readExerciseHistoryEntry,
  withExerciseHistoryEntry,
  type ExerciseHistoryEntry,
} from '@/lib/workspace/exercise-history';

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
  const academySlug = useAcademySlug();
  const queryClient = useQueryClient();
  const router = useRouter();
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
  const historyEntryRef = React.useRef<ExerciseHistoryEntry | null>(null);

  const exerciseUrl = React.useCallback(
    (materialId: string) =>
      routes.academyLearnExercise(academySlug, materialId, { classId }),
    [academySlug, classId],
  );

  const restoreRenderedEntry = React.useCallback(
    (entry: ExerciseHistoryEntry, materialId: string) => {
      historyEntryRef.current = entry;
      window.history.replaceState(
        withExerciseHistoryEntry(window.history.state, entry),
        '',
        exerciseUrl(materialId),
      );
    },
    [exerciseUrl],
  );

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
   * A popstate already moved the address and carries the destination's
   * namespaced history entry. It must never append another entry.
   */
  const commit = React.useCallback(
    async (
      materialId: string,
      options:
        | { kind: 'push' }
        | {
            kind: 'pop';
            entry: ExerciseHistoryEntry;
            rollbackEntry: ExerciseHistoryEntry;
          },
    ) => {
      // Selecting the exercise already on screen is not a transition; doing
      // the work anyway would stop the runner and clear the terminal for it.
      if (materialId === workspace.exercise.materialId) return;

      // One gate for rows, Previous/Next, retry, and popstate. A run or
      // submission may refuse the attempt before any request or cleanup.
      if (!(beforeTransitionRef.current?.canStart() ?? false)) {
        if (options.kind === 'pop') {
          restoreRenderedEntry(
            options.rollbackEntry,
            workspace.exercise.materialId,
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
        if (options.kind === 'push') {
          const current = historyEntryRef.current ?? {
            sessionId: crypto.randomUUID(),
            index: 0,
            classId,
            trustedOrigin: false,
          };
          const entry: ExerciseHistoryEntry = {
            ...current,
            index: current.index + 1,
          };
          window.history.pushState(
            withExerciseHistoryEntry(window.history.state, entry),
            '',
            exerciseUrl(materialId),
          );
          historyEntryRef.current = entry;
        } else {
          historyEntryRef.current = options.entry;
        }
      } catch {
        if (tokenRef.current !== token) return;
        // Deliberately no fallback to a real navigation. Routing away would
        // discard the draft, the terminal, and the running worker in order to
        // report a failure — the destination is what failed, and the exercise
        // the student is on is still perfectly good.
        setFailedDestination(materialId);
        if (options.kind === 'pop') {
          // The address bar already moved. Put it back on the workspace that
          // is actually rendered rather than leaving the two disagreeing.
          restoreRenderedEntry(
            options.rollbackEntry,
            workspace.exercise.materialId,
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
      exerciseUrl,
      fetchWorkspace,
      queryClient,
      restoreRenderedEntry,
      workspace.exercise.materialId,
    ],
  );

  const navigate = React.useCallback(
    (materialId: string) => commit(materialId, { kind: 'push' }),
    [commit],
  );

  const retry = React.useCallback(() => {
    if (failedDestination) void commit(failedDestination, { kind: 'push' });
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

  React.useEffect(() => {
    const materialId = materialIdFromExercisePath(
      window.location.pathname,
      academySlug,
    );
    const existing = readExerciseHistoryEntry(window.history.state);
    if (
      materialId === workspace.exercise.materialId &&
      existing?.classId === classId
    ) {
      historyEntryRef.current = existing;
      return;
    }

    const intent = claimExerciseNavigation(window.sessionStorage, {
      current: window.location.href,
      origin: window.location.origin,
    });
    const entry: ExerciseHistoryEntry = {
      sessionId: crypto.randomUUID(),
      index: 0,
      classId,
      trustedOrigin: intent !== null,
    };
    historyEntryRef.current = entry;
    window.history.replaceState(
      withExerciseHistoryEntry(window.history.state, entry),
      '',
      window.location.href,
    );
  }, [academySlug, classId, workspace.exercise.materialId]);

  const commitRef = React.useRef(commit);
  React.useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  React.useEffect(() => {
    // `pushState` means back/forward no longer re-render the page, so the
    // popped URL has to be reconciled by hand — through the same guarded
    // machinery, so a failed Back behaves exactly like a failed row click.
    const onPopState = (event: PopStateEvent) => {
      const materialId = materialIdFromExercisePath(
        window.location.pathname,
        academySlug,
      );
      const current = historyEntryRef.current;
      const popped = readExerciseHistoryEntry(event.state);
      const poppedClassId = new URLSearchParams(window.location.search).get(
        'classId',
      );

      // Leaving the workspace is ordinary Next navigation. In particular, a
      // course id must never be mistaken for a material id and fetched here.
      if (
        !materialId ||
        !current ||
        !popped ||
        popped.sessionId !== current.sessionId ||
        popped.classId !== classId ||
        poppedClassId !== classId
      ) {
        return;
      }
      void commitRef.current(materialId, {
        kind: 'pop',
        entry: popped,
        rollbackEntry: current,
      });
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [academySlug, classId]);

  const exit = React.useCallback(
    (fallbackHref: string) => {
      if (!(beforeTransitionRef.current?.canStart() ?? false)) return;
      beforeTransitionRef.current?.beforeCommit();

      const entry = historyEntryRef.current;
      const delta = entry ? exerciseExitDelta(entry) : null;
      if (delta !== null) {
        window.history.go(delta);
        return;
      }
      router.replace(fallbackHref);
    },
    [beforeTransitionRef, router],
  );

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
    exit,
    refreshProgress,
    retry,
  };
}
