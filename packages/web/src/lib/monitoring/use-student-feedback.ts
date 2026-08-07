'use client';

import {
  monitoringLimits,
  monitoringServerEvents,
  type MonitoringFeedback,
} from '@cove/shared';
import * as React from 'react';
import type { Socket } from 'socket.io-client';

import { orpc } from '@/lib/orpc';

import {
  markThreadRead,
  mergeFeedback,
  mergeFeedbackPage,
  revisionOf,
  unreadIds,
} from './feedback-thread';

/**
 * The student's side of written feedback.
 *
 * The history read is the source of truth and the socket is an accelerator.
 * That order is deliberate: the draft room only exists while a teacher is
 * actively watching, so a socket-only thread would be correct exactly while
 * somebody was looking and empty the moment the student reloaded. Seeding from
 * `listMyFeedback` is what makes a message survive the tab being closed.
 *
 * The socket is passed in rather than opened here — `useMonitoringSocket`
 * creates a connection per call, and the workspace already has one.
 */
export function useStudentFeedback({
  academyId,
  materialId,
  socket,
}: {
  academyId: string;
  materialId: string | null;
  socket: Socket | null;
}) {
  const [messages, setMessages] = React.useState<
    readonly MonitoringFeedback[]
  >([]);
  const [open, setOpen] = React.useState(false);
  /**
   * Which messages were unread when the panel was last opened.
   *
   * Held apart from `readAt` so the highlight survives being marked read: a
   * student who opens the panel needs to see *which* note is new, and clearing
   * the emphasis in the same frame that clears the badge would answer the
   * question by erasing it.
   */
  const [highlighted, setHighlighted] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  /**
   * Every *revision* this thread has ever held, live or from history.
   *
   * Revisions rather than ids: a teacher rewrites their note in place, so a
   * correction keeps the id it had. Tracking ids alone would let a revision
   * arrive silently — which is the one message most worth surfacing.
   *
   * A ref because it decides whether the panel opens itself, and that decision
   * must survive a re-render without being made a second time.
   */
  const seenIdsRef = React.useRef<Set<string>>(new Set());
  /**
   * Kept in a ref so the socket subscription depends on the socket alone.
   * `markRead` changes identity whenever the thread does, and rebinding a
   * listener on every message is how a delivery gets dropped between an `off`
   * and the `on` that replaces it.
   */
  const markReadRef = React.useRef<(arriving?: MonitoringFeedback) => void>(
    () => undefined,
  );

  React.useEffect(() => {
    for (const note of messages) seenIdsRef.current.add(revisionOf(note));
  }, [messages]);

  /* --------------------------------------------------- switching exercises */

  /**
   * A different exercise is a different thread.
   *
   * Reset during render rather than in an effect: the previous exercise's
   * notes must never be painted under this one's title, and an effect runs
   * after that frame has already been shown. This is React's documented way to
   * derive state from a changed prop, and it converges in one pass.
   */
  const [threadMaterialId, setThreadMaterialId] = React.useState(materialId);
  if (materialId !== threadMaterialId) {
    setThreadMaterialId(materialId);
    setMessages([]);
    setHighlighted(new Set());
    setOpen(false);
  }

  /* ------------------------------------------------------------- history */

  React.useEffect(() => {
    // Cleared here rather than in the reset above, where it would be a ref
    // touched during render. This effect is keyed on the same material, and
    // it runs before anything could arrive for the new exercise.
    seenIdsRef.current = new Set();
    if (!materialId) return;

    const controller = new AbortController();
    void orpc.monitoring
      .listMyFeedback(
        { academyId, materialId, limit: monitoringLimits.feedbackPageSize },
        { signal: controller.signal },
      )
      .then((result) => {
        if (controller.signal.aborted) return;
        // Merged, not assigned: a note that arrived over the socket while this
        // request was in flight is still the student's, and replacing the
        // array outright would drop it.
        setMessages((current) => mergeFeedbackPage(current, result.feedback));
      })
      // Monitoring being switched off, or a student with no membership, is a
      // thread that does not exist — not an error worth a student's attention.
      .catch(() => undefined);
    return () => controller.abort();
  }, [academyId, materialId]);

  /* ---------------------------------------------------------- live arrival */

  React.useEffect(() => {
    if (!socket) return;

    const onCreated = (event: {
      draftId: string;
      feedback: MonitoringFeedback;
    }) => {
      setMessages((current) => mergeFeedback(current, event.feedback));
      // Matching v1: a new message opens the panel. Decided against a ref
      // rather than inside the updater above, which React is free to run twice
      // — and a panel that reopened on a re-render would fight the student for
      // control of their own screen.
      //
      // Only a genuinely new row opens it. A duplicate of one already on
      // screen must not reopen a panel that was just closed, and the history
      // read never opens it at all.
      if (seenIdsRef.current.has(revisionOf(event.feedback))) return;
      seenIdsRef.current.add(revisionOf(event.feedback));
      setOpen(true);
      // The panel is open and this note is on it, so it has been read. Passed
      // explicitly because the merge above has not reached a render yet.
      markReadRef.current(event.feedback);
    };

    socket.on(monitoringServerEvents.feedbackCreated, onCreated);
    return () => {
      socket.off(monitoringServerEvents.feedbackCreated, onCreated);
    };
  }, [socket]);

  /* ------------------------------------------------------------ read state */

  const unread = React.useMemo(() => unreadIds(messages), [messages]);
  const unreadCount = unread.length;

  /**
   * Reading the thread.
   *
   * `arriving` covers the one case the render's own `unread` cannot: a message
   * that opened the panel was merged in the same tick, so this render has not
   * seen it yet and it would otherwise stay unread until the next open.
   */
  const markRead = React.useCallback(
    (arriving?: MonitoringFeedback) => {
      if (!materialId) return;
      const pending =
        arriving && arriving.readAt === null
          ? [...unread, arriving.id]
          : unread;
      if (pending.length === 0) return;

      // Emphasis is captured before the rows are stamped, so opening the panel
      // shows what was new instead of a thread that has already forgotten.
      setHighlighted((current) => new Set([...current, ...pending]));
      const readAt = new Date().toISOString();
      setMessages((current) => markThreadRead(current, readAt));
      // The badge clears on the local write above; the request only makes it
      // durable. A failure leaves the server unread, and the next open retries.
      void orpc.monitoring
        .markMyFeedbackRead({ academyId, materialId })
        .catch(() => undefined);
    },
    [academyId, materialId, unread],
  );

  React.useEffect(() => {
    markReadRef.current = markRead;
  }, [markRead]);

  /**
   * Opening is reading — and it is done here, on the transition itself,
   * rather than in an effect watching `open`. An effect would re-run on every
   * change to the thread and make "the student looked at it" a conclusion the
   * renderer keeps re-deriving instead of a thing that happened once.
   */
  const setOpenAndRead = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) markRead();
    },
    [markRead],
  );

  return {
    /** Newest first, as v1 presented them. */
    messages,
    open,
    setOpen: setOpenAndRead,
    unreadCount,
    isHighlighted: (id: string) => highlighted.has(id),
  };
}
