import type {
  MonitoringExercisePreview,
  NavigatorPath,
  StudentContextChangedEvent,
} from '@cove/shared';

/**
 * What the teacher is looking at, and where the student actually is.
 *
 * These are two facts, not one. A teacher reading ahead through the curriculum
 * panel is displaying an exercise the student is not on, and the student may
 * move again while they read. Keeping them apart is the whole reason this
 * reducer exists: the only thing that may change the display is a deliberate
 * act by the teacher, and the only thing that may change the live target is
 * the server.
 *
 * Nothing here talks to a socket, a document, or oRPC. It decides what should
 * be shown; the hook around it performs the requests that produce these
 * actions, which is what makes every rule below testable on plain values.
 */

export type TeacherDisplayState =
  | { mode: 'live'; materialId: string; path: NavigatorPath | null }
  | {
      mode: 'preview';
      materialId: string;
      snapshot: MonitoringExercisePreview;
    };

export type StudentLiveTarget = {
  materialId: string | null;
  courseId: string | null;
  path: NavigatorPath | null;
  /** False when the student is between exercises or on unmonitorable work. */
  available: boolean;
};

export type TeacherDisplay = {
  /** Null before the first watch acknowledgement. */
  display: TeacherDisplayState | null;
  live: StudentLiveTarget;
  /** The preview being fetched, if any. Its token guards the commit. */
  pending: { materialId: string; token: number } | null;
  /** The preview destination that failed, retained so Retry is deterministic. */
  previewFailedMaterialId: string | null;
  following: boolean;
  /**
   * Unsent composer text, per material.
   *
   * Keyed rather than held as one string: a teacher who types half a note,
   * previews the next exercise, and comes back must find their words where
   * they left them — and must never find them attached to another thread.
   */
  feedbackDrafts: Readonly<Record<string, string>>;
  /** The token of the request in flight, if any. Supplied by the caller. */
  token: number;
};

export type TeacherDisplayAction =
  /** A watch acknowledgement: authorized, and therefore the live exercise. */
  | { type: 'watched'; materialId: string; path: NavigatorPath | null }
  | { type: 'watch_path_resolved'; materialId: string; path: NavigatorPath }
  | { type: 'moved'; event: StudentContextChangedEvent }
  | { type: 'preview_requested'; materialId: string; token: number }
  | {
      type: 'preview_resolved';
      token: number;
      materialId: string;
      snapshot: MonitoringExercisePreview;
    }
  | { type: 'preview_failed'; token: number; materialId: string }
  | { type: 'follow_requested'; token: number }
  | { type: 'follow_settled' }
  | { type: 'feedback_draft'; materialId: string; body: string }
  | { type: 'watch_ended' };

export const initialTeacherDisplay: TeacherDisplay = {
  display: null,
  live: { materialId: null, courseId: null, path: null, available: false },
  pending: null,
  previewFailedMaterialId: null,
  following: false,
  feedbackDrafts: {},
  token: 0,
};

export function teacherDisplayReducer(
  state: TeacherDisplay,
  action: TeacherDisplayAction,
): TeacherDisplay {
  switch (action.type) {
    case 'watched': {
      // The server authorized this material for this watch, so it is both the
      // live target and what the teacher is now shown. Any preview in flight
      // is superseded — the teacher asked to be here instead.
      //
      // A watch acknowledgement can be re-announced without anything having
      // changed: the exercise context that supplies the path arrives after the
      // acknowledgement itself, and the two are separate loads. Returning the
      // identical state in that case is what keeps a caller that re-announces
      // on every render from re-rendering forever.
      const path =
        action.path ??
        (state.live.materialId === action.materialId ? state.live.path : null);
      const courseId =
        action.path?.course.id ??
        (state.live.materialId === action.materialId
          ? state.live.courseId
          : null);
      const settled =
        state.display?.mode === 'live' &&
        state.display.materialId === action.materialId &&
        state.display.path === path &&
        state.live.materialId === action.materialId &&
        state.live.path === path &&
        state.live.courseId === courseId &&
        state.live.available &&
        state.pending === null &&
        state.previewFailedMaterialId === null &&
        !state.following;
      if (settled) return state;

      return {
        ...state,
        display: { mode: 'live', materialId: action.materialId, path },
        live: {
          materialId: action.materialId,
          courseId,
          path,
          available: true,
        },
        pending: null,
        previewFailedMaterialId: null,
        following: false,
      };
    }

    case 'watch_path_resolved': {
      // Context for an old watch may resolve after the student has moved. It
      // may still hydrate the old exercise that remains displayed, but it must
      // never move the LIVE marker back or exit Preview mode.
      const display =
        state.display?.mode === 'live' &&
        state.display.materialId === action.materialId
          ? { ...state.display, path: action.path }
          : state.display;
      const live =
        state.live.materialId === action.materialId
          ? {
              ...state.live,
              courseId: action.path.course.id,
              path: action.path,
            }
          : state.live;
      if (display === state.display && live === state.live) return state;
      return { ...state, display, live };
    }

    case 'moved':
      // Metadata only. The marker moves; the screen does not. Expanded
      // branches, scroll position, and an unsent note are all untouched
      // because none of them is reachable from here.
      return {
        ...state,
        live: {
          materialId: action.event.materialId,
          courseId: action.event.courseId,
          path: action.event.path,
          available: action.event.available,
        },
      };

    case 'preview_requested':
      return {
        ...state,
        pending: { materialId: action.materialId, token: action.token },
        previewFailedMaterialId: null,
        token: action.token,
      };

    case 'preview_resolved':
      // A response that lost its race commits nothing: the teacher has since
      // chosen somewhere else, and this snapshot is no longer about anywhere
      // they are.
      if (state.pending?.token !== action.token) return state;
      return {
        ...state,
        display: {
          mode: 'preview',
          materialId: action.materialId,
          snapshot: action.snapshot,
        },
        pending: null,
        previewFailedMaterialId: null,
      };

    case 'preview_failed':
      if (state.pending?.token !== action.token) return state;
      // The previous valid display stays exactly as it was.
      return {
        ...state,
        pending: null,
        previewFailedMaterialId: action.materialId,
      };

    case 'follow_requested':
      // Supersedes any preview in flight. The display changes on `watched`,
      // once the server has re-resolved presence and authorized a material —
      // never on the strength of the event that suggested following.
      return {
        ...state,
        following: true,
        pending: null,
        previewFailedMaterialId: null,
        token: action.token,
      };

    case 'follow_settled':
      // Announced from a condition rather than from an event, so it arrives
      // more than once for one refusal. Idempotent for the same reason
      // `watched` is.
      return state.following ? { ...state, following: false } : state;

    case 'feedback_draft':
      return {
        ...state,
        feedbackDrafts: {
          ...state.feedbackDrafts,
          [action.materialId]: action.body,
        },
      };

    case 'watch_ended':
      // The last valid display remains on screen for review. What ends is the
      // claim that anything about it is live.
      if (
        !state.live.available &&
        state.live.materialId === null &&
        state.pending === null &&
        !state.following
      ) {
        return state;
      }
      return {
        ...state,
        live: { materialId: null, courseId: null, path: null, available: false },
        pending: null,
        following: false,
      };
  }
}

/**
 * Whether the teacher may act on what they are looking at.
 *
 * Preview is reading, and reading only: no edit, no run, no submit, no
 * feedback, and no document to join. Callers combine this with the live
 * connection's own state, which can withdraw permission independently.
 */
export function isLiveDisplay(state: TeacherDisplay): boolean {
  return (
    state.display?.mode === 'live' &&
    state.live.available &&
    state.live.materialId !== null &&
    state.display.materialId === state.live.materialId
  );
}

/** Whether returning to the student is currently something to offer. */
export function canReturnToLive(state: TeacherDisplay): boolean {
  if (!state.live.available || state.live.materialId === null) return false;
  return (
    state.display?.mode === 'preview' ||
    state.display?.materialId !== state.live.materialId
  );
}
