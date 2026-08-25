'use client';

import {
  monitoringServerEvents,
  navigatorPathFromBreadcrumb,
  type NavigatorPath,
  type StudentContextChangedEvent,
} from '@cove/shared';
import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import type { Socket } from 'socket.io-client';

import { orpc } from '@/lib/orpc';

import {
  canReturnToLive,
  initialTeacherDisplay,
  isLiveDisplay,
  teacherDisplayReducer,
} from '../_lib/teacher-display';

/**
 * What the teacher is shown, and how it is allowed to change.
 *
 * The reducer beside this decides; this performs the requests that feed it and
 * subscribes to the one event that may move the LIVE marker. The division
 * matters because every rule worth holding — a stale preview cannot commit, a
 * student's movement cannot navigate the teacher, following re-authorizes —
 * is a statement about state transitions, and is tested as one.
 *
 * The live watch itself belongs to `useLiveWorkspace`. This hook consumes its
 * boundary: it asks it to follow, and it reads which material it authorized.
 * It implements neither Yjs nor Socket.IO.
 */
export function useTeacherDisplay({
  academyId,
  classId,
  membershipId,
  liveMaterialId,
  livePath,
  liveVisitId,
  follow: followWatch,
  socket,
  watchDenied,
  watchEnded,
}: {
  academyId: string;
  classId: string;
  membershipId: string;
  /** The material the current watch authorized, or null before one exists. */
  liveMaterialId: string | null;
  /** Where that material sits, once the exercise context has loaded. */
  livePath: NavigatorPath | null;
  /** A new value means a deliberate, newly authorized watch. */
  liveVisitId: string | null;
  follow: () => void;
  socket: Socket | null;
  watchEnded: boolean;
  /** Set when the last watch attempt was refused, so following can stop. */
  watchDenied: boolean;
}) {
  const [state, dispatch] = React.useReducer(
    teacherDisplayReducer,
    initialTeacherDisplay,
  );

  // The watch is authoritative about the live material, so the reducer learns
  // it from there rather than from anything a client remembered.
  const announcedVisitRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!liveMaterialId || !liveVisitId) return;
    if (announcedVisitRef.current === liveVisitId) return;
    announcedVisitRef.current = liveVisitId;
    dispatch({ type: 'watched', materialId: liveMaterialId, path: livePath });
  }, [liveMaterialId, livePath, liveVisitId]);

  React.useEffect(() => {
    if (!liveMaterialId || !livePath) return;
    dispatch({
      type: 'watch_path_resolved',
      materialId: liveMaterialId,
      path: livePath,
    });
  }, [liveMaterialId, livePath]);

  React.useEffect(() => {
    if (watchEnded) dispatch({ type: 'watch_ended' });
  }, [watchEnded]);

  // A refused follow has to stop reporting itself as in progress, or the
  // button spins for a student who is no longer reachable.
  React.useEffect(() => {
    if (watchDenied) dispatch({ type: 'follow_settled' });
  }, [watchDenied]);

  /* ------------------------------------------------------------- movement */

  React.useEffect(() => {
    if (!socket) return;
    const onMoved = (event: StudentContextChangedEvent) => {
      // Advisory metadata. It moves the marker and the status line, and it is
      // deliberately incapable of moving the teacher: the reducer has no
      // transition from this action to a display change.
      if (event.studentMembershipId !== membershipId) return;
      dispatch({ type: 'moved', event });
    };
    socket.on(monitoringServerEvents.studentContextChanged, onMoved);
    return () => {
      socket.off(monitoringServerEvents.studentContextChanged, onMoved);
    };
  }, [membershipId, socket]);

  /* ----------------------------------------------------------- curriculum */

  const displayPath =
    state.display?.mode === 'preview'
      ? navigatorPathFromBreadcrumb({
          breadcrumb: state.display.snapshot.breadcrumb,
          exercise: state.display.snapshot.exercise,
        })
      : (state.display?.path ?? null);
  const courseId = displayPath?.course.id ?? null;
  const anchorMaterialId = state.display?.materialId ?? null;

  /**
   * The monitored student's course, cached per course.
   *
   * Keyed on the course rather than on the exercise so a student moving
   * between problems does not refetch the outline — and so the teacher's
   * expanded branches and scroll position survive every move they make. The
   * anchor material is what the server authorizes the read through; it is
   * read from the current live target when a fetch actually happens.
   */
  const curriculumQuery = useQuery({
    queryKey: ['academy', academyId, 'live-curriculum', membershipId, courseId],
    queryFn: () =>
      orpc.monitoring.getStudentCurriculum({
        academyId,
        classId,
        membershipId,
        materialId: anchorMaterialId!,
      }),
    enabled: Boolean(courseId && anchorMaterialId),
    retry: false,
    staleTime: 60_000,
  });
  const navigator = curriculumQuery.data ?? null;

  const loadCurriculum = React.useCallback(() => {
    void curriculumQuery.refetch();
  }, [curriculumQuery]);

  /* -------------------------------------------------------------- preview */

  /**
   * The request token, minted where the request is made.
   *
   * Owned here rather than derived from the reducer's state: a callback that
   * read the token back out of state would be reading whatever the last
   * committed render held, which during two clicks in the same frame is the
   * same number twice — and two requests sharing a token cannot supersede
   * each other.
   */
  const tokenRef = React.useRef(0);
  const nextToken = React.useCallback(() => {
    tokenRef.current += 1;
    return tokenRef.current;
  }, []);

  const preview = React.useCallback(
    async (materialId: string) => {
      const token = nextToken();
      dispatch({ type: 'preview_requested', materialId, token });
      try {
        const snapshot = await orpc.monitoring.getExercisePreview({
          academyId,
          classId,
          membershipId,
          materialId,
        });
        // Committed only while this request is still the one the teacher is
        // waiting for. The reducer holds the token, so a late answer is
        // dropped rather than allowed to replace a newer selection.
        dispatch({ type: 'preview_resolved', token, materialId, snapshot });
      } catch {
        dispatch({ type: 'preview_failed', token, materialId });
      }
    },
    [academyId, classId, membershipId, nextToken],
  );

  /**
   * The one command a row click produces.
   *
   * Selecting the LIVE row is following, not previewing: the teacher is asking
   * to be beside the student again, and that has to go through a fresh
   * authorization rather than loading a read-only copy of the same exercise.
   */
  const select = React.useCallback(
    (materialId: string) => {
      if (materialId === state.display?.materialId && isLiveDisplay(state)) {
        return;
      }
      if (state.live.available && materialId === state.live.materialId) {
        dispatch({ type: 'follow_requested', token: nextToken() });
        followWatch();
        return;
      }
      void preview(materialId);
    },
    [followWatch, nextToken, preview, state],
  );

  const returnToLive = React.useCallback(() => {
    if (!canReturnToLive(state)) return;
    dispatch({ type: 'follow_requested', token: nextToken() });
    followWatch();
  }, [followWatch, nextToken, state]);

  const retryPreview = React.useCallback(() => {
    if (!state.previewFailedMaterialId) return;
    void preview(state.previewFailedMaterialId);
  }, [preview, state.previewFailedMaterialId]);

  /* ------------------------------------------------------------- feedback */

  const composerMaterialId =
    state.display?.mode === 'live' ? state.display.materialId : null;
  const setFeedbackDraft = React.useCallback(
    (body: string) => {
      if (!composerMaterialId) return;
      dispatch({ type: 'feedback_draft', materialId: composerMaterialId, body });
    },
    [composerMaterialId],
  );

  /**
   * Where the header prints the workspace's position.
   *
   * Derived from whichever payload produced the displayed exercise, so a
   * preview's breadcrumb describes the preview and a live watch's describes
   * the student — the header can never print one over the other's content.
   */
  const path = displayPath;

  return {
    display: state.display,
    displayedMaterialId: state.display?.materialId ?? null,
    following: state.following,
    isLive: isLiveDisplay(state),
    canReturnToLive: canReturnToLive(state),
    live: state.live,
    loadCurriculum,
    navigator,
    navigatorFailed: curriculumQuery.isError,
    path,
    /** The note in progress for the exercise currently on screen. */
    feedbackDraft: composerMaterialId
      ? (state.feedbackDrafts[composerMaterialId] ?? '')
      : '',
    previewFailed: state.previewFailedMaterialId !== null,
    previewing: state.pending !== null,
    pendingMaterialId: state.pending?.materialId ?? null,
    returnToLive,
    retryPreview,
    select,
    setFeedbackDraft,
  };
}
