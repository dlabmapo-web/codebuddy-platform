'use client';

import {
  monitoringClientEvents,
  monitoringServerEvents,
  type DocumentPersistedEvent,
  type DocumentSyncResult,
  type DocumentSyncedEvent,
  type DocumentUpdatedEvent,
  type FeedbackCreatedEvent,
  type MonitoringFeedback,
  type MonitoringVisitEndReason,
  type ResultChangedEvent,
  type RunActivityPayload,
  type TerminalMirrorEvent,
  type WatchEndedEvent,
} from '@cove/shared';
import * as React from 'react';
import * as Y from 'yjs';

import {
  applyTerminalEvent,
  emptyTranscript,
  type TerminalTranscript,
} from '@/lib/workspace/terminal-transcript';

import { staysUntilCleared } from './awareness/pointer-lifecycle';
import { useAwareness } from './awareness/use-awareness';
import { canEditSynchronizedDraft } from './connection';
import { applyDocumentSyncResult, toBytes } from './document-sync';
import { monitoringAck, type MonitoringAckResult } from './types';
import { useMonitoringSocket } from './use-monitoring-socket';

/**
 * One teacher watching one student.
 *
 * Owns the whole live session: the watch, the shared document, awareness, the
 * student's run and result summaries, and durable feedback. The page renders
 * what this reports and never talks to the socket itself — which is what keeps
 * a single component from owning authorization, transport, CRDT state, and
 * layout at once, as v1's did.
 */

export type LiveWorkspaceSession = {
  draftId: string;
  materialId: string;
  visitId: string;
};

export function useLiveWorkspace({
  academyId,
  classId,
  studentMembershipId,
}: {
  academyId: string;
  classId: string;
  studentMembershipId: string;
}) {
  const { socket, state, report } = useMonitoringSocket();
  const [session, setSession] = React.useState<LiveWorkspaceSession | null>(null);
  const [ended, setEnded] = React.useState<MonitoringVisitEndReason | null>(null);
  const [denied, setDenied] = React.useState<string | null>(null);
  const [unsaved, setUnsaved] = React.useState(false);
  /** The exact draft whose authoritative snapshot has been applied. */
  const [syncedDraftId, setSyncedDraftId] = React.useState<string | null>(null);
  const [run, setRun] = React.useState<RunActivityPayload | null>(null);
  const [result, setResult] = React.useState<ResultChangedEvent | null>(null);
  const [feedback, setFeedback] = React.useState<MonitoringFeedback[]>([]);
  // The student's terminal, folded through the shared reducer. Held in a ref as
  // well as in state because a socket handler has to read the current mirror to
  // decide whether the next message continues it, and a stale closure would
  // apply a delta over a transcript it never saw.
  const [terminal, setTerminal] =
    React.useState<TerminalTranscript>(emptyTranscript);
  const terminalRef = React.useRef<TerminalTranscript>(emptyTranscript);
  const resyncedAtRef = React.useRef(0);

  /**
   * One document per watch, not one per mounted page.
   *
   * A teacher who follows a student to another exercise is joining a different
   * draft, and reusing the Y.Doc would merge two students' — or one student's
   * two problems' — histories into a single CRDT that then synchronizes back
   * to the server. The document is therefore replaced whenever the watch
   * resolves a different draft, and the old one is destroyed once the
   * replacement has rendered.
   */
  const [doc, setDoc] = React.useState(() => new Y.Doc());
  // Socket handlers outlive any one render, so they read the document and the
  // session through refs rather than closing over the values they were created
  // with.
  const docRef = React.useRef(doc);
  const sessionRef = React.useRef<LiveWorkspaceSession | null>(null);
  React.useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  /**
   * One completion path for the command acknowledgement and compatibility
   * event. It validates the binary payload and exact current draft before the
   * readiness marker can unlock Monaco.
   */
  const completeDocumentSync = React.useCallback(
    (result: unknown) => {
      const current = sessionRef.current;
      if (
        !current ||
        !applyDocumentSyncResult({
          currentDraftId: current.draftId,
          doc: docRef.current,
          result,
        })
      ) {
        return false;
      }
      setSyncedDraftId(current.draftId);
      report({ type: 'synchronized' });
      return true;
    },
    [report],
  );

  /**
   * Destroyed after the replacement is on screen.
   *
   * Passive effects run child-first, so by the time this fires the editor has
   * already rebound to the new document — the old one is observed by nothing
   * at the moment it goes away.
   */
  const retiredDocRef = React.useRef<Y.Doc | null>(null);
  React.useEffect(() => {
    const stale = retiredDocRef.current;
    retiredDocRef.current = doc;
    if (stale && stale !== doc) stale.destroy();
  }, [doc]);
  React.useEffect(() => () => docRef.current.destroy(), []);

  /* ------------------------------------------------------------- the watch */

  /**
   * Asking the server, again, which exercise this student is on.
   *
   * Exposed so `Return to live` is the same command as the initial watch: it
   * never carries a material id, so a stale marker cannot become an
   * instruction. The server re-reads presence, revalidates the assignment, the
   * enrollment, and the material, ends the previous visit, and answers with
   * the draft the teacher may actually join.
   */
  const startWatchRef = React.useRef<(() => void) | null>(null);
  const follow = React.useCallback(() => startWatchRef.current?.(), []);

  React.useEffect(() => {
    if (!socket) return;

    const startWatch = () => {
      socket.emit(
        monitoringClientEvents.watchStart,
        {
          eventId: crypto.randomUUID(),
          academyId,
          classId,
          studentMembershipId,
        },
        monitoringAck<LiveWorkspaceSession>((ack) => {
          if (!ack?.ok) {
            setDenied(ack?.code ?? 'MONITORING_REALTIME_UNAVAILABLE');
            if (ack?.code === 'MONITORING_ACCESS_DENIED') {
              report({ type: 'revoked' });
            }
            return;
          }
          setDenied(null);
          setEnded(null);
          // A watch acknowledgement authorizes a room; it does not prove the
          // room's document has arrived. Even when the material resolves to the
          // same draft, live mutations wait for this watch's sync response.
          setSyncedDraftId(null);
          report({ type: 'recovery_failed' });

          // A different draft is a different watch. Everything the previous
          // one produced — its document, its terminal, its run and verdict —
          // describes an exercise this teacher is no longer on, and carrying
          // any of it forward would show one problem's output beside another
          // problem's code.
          if (sessionRef.current?.draftId !== ack.data.draftId) {
            const replacement = new Y.Doc();
            docRef.current = replacement;
            setDoc(replacement);
            setRun(null);
            setResult(null);
            setFeedback([]);
            setUnsaved(false);
            terminalRef.current = emptyTranscript;
            setTerminal(emptyTranscript);
          }

          // Socket events can arrive before React commits the state update.
          // Publish the authorized session to handlers synchronously so the
          // first document snapshot cannot be mistaken for a stale room.
          sessionRef.current = ack.data;
          setSession(ack.data);
          // Synchronization follows the watch: the surface is not live until
          // the server has answered with the document it holds.
          socket.emit(
            monitoringClientEvents.documentSync,
            {
              eventId: crypto.randomUUID(),
              draftId: ack.data.draftId,
              stateVector: Y.encodeStateVector(docRef.current),
            },
            monitoringAck<DocumentSyncResult>((syncAck) => {
              // A replaced watch may name the same draft, so the visit as well
              // as the draft must still be current when its acknowledgement
              // arrives.
              if (
                !syncAck?.ok ||
                sessionRef.current?.visitId !== ack.data.visitId
              ) {
                return;
              }
              completeDocumentSync(syncAck.data);
            }),
          );
        }),
      );
    };

    startWatchRef.current = startWatch;
    socket.on('connect', startWatch);
    if (socket.connected) startWatch();

    return () => {
      startWatchRef.current = null;
      socket.off('connect', startWatch);
      socket.emit(
        monitoringClientEvents.watchStop,
        { eventId: crypto.randomUUID() },
        () => undefined,
      );
    };
  }, [
    academyId,
    classId,
    completeDocumentSync,
    report,
    socket,
    studentMembershipId,
  ]);

  /* ---------------------------------------------------------- the document */

  React.useEffect(() => {
    if (!socket) return;

    const onSynced = (event: DocumentSyncedEvent) => {
      completeDocumentSync(event);
    };

    const onUpdated = (event: DocumentUpdatedEvent) => {
      if (event.draftId !== sessionRef.current?.draftId) return;
      Y.applyUpdate(docRef.current, toBytes(event.update), 'remote');
    };

    const onPersisted = (event: DocumentPersistedEvent) => {
      if (event.draftId !== sessionRef.current?.draftId) return;
      // Cleared by a confirmed write and by nothing else.
      setUnsaved(!event.persisted);
    };

    socket.on(monitoringServerEvents.documentSynced, onSynced);
    socket.on(monitoringServerEvents.documentUpdated, onUpdated);
    socket.on(monitoringServerEvents.documentPersisted, onPersisted);
    return () => {
      socket.off(monitoringServerEvents.documentSynced, onSynced);
      socket.off(monitoringServerEvents.documentUpdated, onUpdated);
      socket.off(monitoringServerEvents.documentPersisted, onPersisted);
    };
  }, [completeDocumentSync, socket]);

  /** Local edits leave as bounded updates, never as a whole document. */
  React.useEffect(() => {
    if (!socket) return;
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      const current = sessionRef.current;
      if (!current || origin === 'remote' || origin === 'server') return;
      setUnsaved(true);
      socket.emit(
        monitoringClientEvents.documentUpdate,
        { eventId: crypto.randomUUID(), draftId: current.draftId, update },
        () => undefined,
      );
    };
    doc.on('update', onUpdate);
    return () => doc.off('update', onUpdate);
  }, [doc, socket]);

  /* ------------------------------------------------------- terminal mirror */

  /**
   * One snapshot request, not a storm of them.
   *
   * A gap is usually one hole, but a burst of deltas can report it several
   * times before the answer arrives, and each request costs the student a whole
   * transcript.
   */
  const requestTerminalSnapshot = React.useCallback(() => {
    const current = sessionRef.current;
    if (!socket || !current) return;
    const now = Date.now();
    if (now - resyncedAtRef.current < 500) return;
    resyncedAtRef.current = now;
    socket.emit(monitoringClientEvents.terminalResync, {
      draftId: current.draftId,
    });
  }, [socket]);

  React.useEffect(() => {
    if (!socket) return;

    const onTerminal = (event: TerminalMirrorEvent) => {
      if (event.draftId !== sessionRef.current?.draftId) return;
      const { outcome, transcript } = applyTerminalEvent(
        terminalRef.current,
        event,
      );
      terminalRef.current = transcript;
      setTerminal(transcript);
      // Nothing uncertain is rendered over a hole: the mirror says it is
      // catching up and asks the student for the transcript instead.
      if (outcome === 'gap') requestTerminalSnapshot();
    };

    socket.on(monitoringServerEvents.terminalChanged, onTerminal);
    return () => {
      socket.off(monitoringServerEvents.terminalChanged, onTerminal);
    };
  }, [requestTerminalSnapshot, socket]);

  /* -------------------------------------------------- activity and results */

  React.useEffect(() => {
    if (!socket) return;
    const onRun = (event: RunActivityPayload) => setRun(event);
    const onResult = (event: ResultChangedEvent) => setResult(event);
    /**
     * Replaced by id, not appended.
     *
     * A teacher rewrites their note in place, so a revision comes back under
     * the id it already had. Skipping ids already present — which is what this
     * did while notes were append-only — would leave the dock showing the
     * wording the teacher just replaced.
     */
    const onFeedback = (event: FeedbackCreatedEvent) => {
      setFeedback((current) => {
        const index = current.findIndex((item) => item.id === event.feedback.id);
        if (index === -1) return [...current, event.feedback];
        const next = [...current];
        next[index] = event.feedback;
        return next;
      });
    };
    /**
     * The student opened the thread.
     *
     * Stamps every message the teacher can see rather than the ids in the
     * event, which carries a count and no identifiers — the student read the
     * exercise's thread, and that is the whole of what the teacher is told.
     */
    const onFeedbackRead = (event: { readAt: string }) => {
      setFeedback((current) =>
        current.every((item) => item.readAt !== null)
          ? current
          : current.map((item) =>
              item.readAt === null ? { ...item, readAt: event.readAt } : item,
            ),
      );
    };
    const onEnded = (event: WatchEndedEvent) => {
      setEnded(event.reason);
      setSyncedDraftId(null);
      sessionRef.current = null;
      setSession(null);
    };

    socket.on(monitoringServerEvents.runChanged, onRun);
    socket.on(monitoringServerEvents.resultChanged, onResult);
    socket.on(monitoringServerEvents.feedbackCreated, onFeedback);
    socket.on(monitoringServerEvents.feedbackRead, onFeedbackRead);
    socket.on(monitoringServerEvents.watchEnded, onEnded);
    return () => {
      socket.off(monitoringServerEvents.runChanged, onRun);
      socket.off(monitoringServerEvents.resultChanged, onResult);
      socket.off(monitoringServerEvents.feedbackCreated, onFeedback);
      socket.off(monitoringServerEvents.feedbackRead, onFeedbackRead);
      socket.off(monitoringServerEvents.watchEnded, onEnded);
    };
  }, [socket]);

  /* -------------------------------------------------------------- awareness */

  // The student's cursor and pointer, and this teacher's own on the way out.
  // Both halves are the same hook the student runs; the origin differs, and so
  // does what silence means.
  //
  // The student's last pointer and Monaco caret remain visible to the teacher
  // for the whole problem-detail visit. A reliable lifecycle clear removes
  // both when the student leaves the workspace or the connection ends.
  const { remote, publishCursor } = useAwareness({
    draftId: session?.draftId ?? null,
    peerOrigin: 'STUDENT',
    remoteCursor: staysUntilCleared,
    remotePointer: staysUntilCleared,
    socket,
  });

  /* ---------------------------------------------------------------- actions */

  const sendFeedback = React.useCallback(
    (body: string) =>
      new Promise<MonitoringAckResult<{ feedbackId: string }>>((resolve) => {
        const current = sessionRef.current;
        if (!socket || !current) {
          resolve(undefined);
          return;
        }
        socket.emit(
          monitoringClientEvents.feedbackSend,
          {
            eventId: crypto.randomUUID(),
            draftId: current.draftId,
            // Generated once per send: a retry of this exact message stores
            // one row, however many times the socket redelivers it.
            idempotencyKey: crypto.randomUUID(),
            body,
          },
          monitoringAck(resolve),
        );
      }),
    [socket],
  );

  const text = React.useMemo(() => doc.getText('code'), [doc]);

  return {
    doc,
    text,
    /** Re-resolves the student's current exercise and replaces the watch. */
    follow,
    session,
    state,
    ended,
    denied,
    unsaved,
    run,
    result,
    /** The student's terminal, read-only, as they currently see it. */
    terminal,
    feedback,
    remote,
    setFeedback,
    publishCursor,
    requestTerminalSnapshot,
    sendFeedback,
    /**
     * Shared with the teacher's display controller, which listens for the
     * watched student's movement on this same connection. Opening a second
     * socket would rejoin the watch's rooms and double every event.
     */
    socket,
    // Editing and feedback stay disabled until the watch and the first
    // document sync are both confirmed.
    canEdit: canEditSynchronizedDraft({
      state,
      sessionDraftId: session?.draftId ?? null,
      syncedDraftId,
      ended: ended !== null,
    }),
  };
}
