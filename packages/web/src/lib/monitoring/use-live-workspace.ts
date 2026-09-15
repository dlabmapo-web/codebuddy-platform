'use client';

import {
  monitoringClientEvents,
  monitoringProtocolVersion,
  monitoringServerEvents,
  type DocumentPersistedEvent,
  type DocumentSyncResult,
  type DocumentUpdatedEvent,
  type FeedbackCreatedEvent,
  type MonitoringFeedback,
  type MonitoringVisitEndReason,
  type MonitoringWatchMode,
  type ResultChangedEvent,
  type RunActivityPayload,
  type TerminalMirrorEvent,
  type WatchEndedEvent,
  type WatchModeChangedEvent,
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
  /** This workspace's own id, echoed back so identity is one object. */
  sessionId: string;
  /** Bumped by the server on every fresh watch, including a reconnect. */
  generation: number;
  /** What the server has confirmed this watch may do. Never assumed. */
  mode: MonitoringWatchMode;
};

/** The three values every privileged message must carry together. */
function identityOf(session: LiveWorkspaceSession) {
  return {
    sessionId: session.sessionId,
    visitId: session.visitId,
    generation: session.generation,
  };
}

export function useLiveWorkspace({
  academyId,
  classId,
  studentMembershipId,
}: {
  academyId: string;
  classId: string;
  studentMembershipId: string;
}) {
  const { socket, state, report } = useMonitoringSocket({ classId, studentMembershipId });
  /**
   * This workspace's identity, created once at mount and held only in memory.
   *
   * Deliberately not localStorage and not sessionStorage. Duplicating a browser
   * tab copies sessionStorage, so two tabs would agree on a session id, and the
   * server would treat each new watch as the other's reconnect — fencing them
   * out of existence in turn. Two tabs must be two sessions, which means the id
   * has to die with the page that made it.
   */
  const sessionIdRef = React.useRef<string>(undefined as unknown as string);
  if (sessionIdRef.current === undefined) {
    sessionIdRef.current = crypto.randomUUID();
  }
  const [session, setSession] = React.useState<LiveWorkspaceSession | null>(null);
  /**
   * Terminal until the page reloads.
   *
   * Set when the server says this client speaks a retired watch protocol.
   * Retrying would reopen the same refusal, and silently degrading would mean
   * mixing singleton endings with aggregate ones on one student.
   */
  const [refreshRequired, setRefreshRequired] = React.useState(false);
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
  // Every session mutation publishes to this ref synchronously before state.
  // A passive effect copying state back can overwrite a newer acknowledgement
  // with the previous visit (or its ending) and discard the new sync response.

  /**
   * Completion for the identity-fenced command acknowledgement. It validates
   * the binary payload and exact current draft before the
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

  /**
   * Which watch attempt an acknowledgement belongs to.
   *
   * `Return to live`, a reconnection, and a student moving can each start a
   * watch while one is already in flight, and the answers can come back in
   * either order. The visit check on the synchronization acknowledgement below
   * cannot help here: at watch-start time there is no visit yet to compare.
   * Without this, the slower of two attempts publishes its session last and
   * the teacher ends up watching the exercise they did not choose.
   */
  const watchTokenRef = React.useRef(0);

  React.useEffect(() => {
    if (!socket) return;

    const startWatch = () => {
      const token = watchTokenRef.current + 1;
      watchTokenRef.current = token;
      socket.emit(
        monitoringClientEvents.watchStart,
        {
          eventId: crypto.randomUUID(),
          academyId,
          classId,
          studentMembershipId,
          sessionId: sessionIdRef.current,
          protocolVersion: monitoringProtocolVersion,
        },
        monitoringAck<LiveWorkspaceSession>((ack) => {
          // Superseded while in flight: a newer attempt owns the workspace.
          if (watchTokenRef.current !== token) return;
          if (!ack?.ok) {
            setDenied(ack?.code ?? 'MONITORING_REALTIME_UNAVAILABLE');
            if (ack?.code === 'MONITORING_ACCESS_DENIED') {
              report({ type: 'revoked' });
            }
            // Reconnecting would only earn the same refusal. The teacher is
            // told to reload, which is the actual remedy.
            if (ack?.code === 'MONITORING_REFRESH_REQUIRED') {
              setRefreshRequired(true);
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
          if (sessionRef.current?.visitId !== ack.data.visitId) {
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
              identity: identityOf(ack.data),
            },
            monitoringAck<DocumentSyncResult>((syncAck) => {
              // A replaced watch may name the same draft, so the visit as well
              // as the draft must still be current when its acknowledgement
              // arrives.
              if (
                !syncAck?.ok ||
                watchTokenRef.current !== token ||
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
      // Names the watch it means to stop. A tab closing races its own
      // replacement on reload, and an unqualified stop would close whichever
      // watch this connection happened to hold by the time it arrived.
      const current = sessionRef.current;
      socket.emit(
        monitoringClientEvents.watchStop,
        {
          eventId: crypto.randomUUID(),
          ...(current ? { identity: identityOf(current) } : {}),
        },
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

    // Only the identity-fenced request acknowledgement may complete a sync.
    // A delayed same-draft broadcast can belong to a retired visit.
    const onUpdated = (event: DocumentUpdatedEvent) => {
      if (event.draftId !== sessionRef.current?.draftId) return;
      Y.applyUpdate(docRef.current, toBytes(event.update), 'remote');
    };

    const onPersisted = (event: DocumentPersistedEvent) => {
      if (event.draftId !== sessionRef.current?.draftId) return;
      // Cleared by a confirmed write and by nothing else.
      setUnsaved(!event.persisted);
    };

    socket.on(monitoringServerEvents.documentUpdated, onUpdated);
    socket.on(monitoringServerEvents.documentPersisted, onPersisted);
    return () => {
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
        {
          eventId: crypto.randomUUID(),
          draftId: current.draftId,
          update,
          identity: identityOf(current),
        },
        monitoringAck((ack) => {
          if (ack?.ok || sessionRef.current?.visitId !== current.visitId) return;
          // A Yjs merge cannot undo a rejected local operation. Start a fresh,
          // read-only watch and document, then load the canonical server state.
          setSyncedDraftId(null);
          report({ type: 'recovery_failed' });
          startWatchRef.current?.();
        }),
      );
    };
    doc.on('update', onUpdate);
    return () => doc.off('update', onUpdate);
  }, [doc, report, socket]);

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
      identity: identityOf(current),
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
    // Each of these names the draft it is about. A run, a verdict, or a note
    // that arrives after the teacher has followed the student elsewhere
    // describes the previous exercise, and showing it beside this one's code
    // is the same fault as showing the wrong code.
    const onRun = (event: RunActivityPayload) => {
      if (event.draftId !== sessionRef.current?.draftId) return;
      setRun(event);
    };
    const onResult = (event: ResultChangedEvent) => {
      if (event.draftId !== sessionRef.current?.draftId) return;
      setResult(event);
    };
    /**
     * Replaced by id, not appended.
     *
     * A teacher rewrites their note in place, so a revision comes back under
     * the id it already had. Skipping ids already present — which is what this
     * did while notes were append-only — would leave the dock showing the
     * wording the teacher just replaced.
     */
    const onFeedback = (event: FeedbackCreatedEvent) => {
      if (event.draftId !== sessionRef.current?.draftId) return;
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
      const current = sessionRef.current;
      if (!current) return;
      // Which watch ended, not merely which draft. Every tab this teacher has
      // open shares their private room and receives this, and two of those
      // tabs may legitimately be on the same student — so the draft alone
      // cannot say whether the ending is this workspace's own. A server that
      // still sends no visit id falls back to the draft comparison.
      if (event.visitId != null) {
        if (event.visitId !== current.visitId) return;
      } else if (event.draftId !== null && event.draftId !== current.draftId) {
        return;
      }
      setEnded(event.reason);
      setSyncedDraftId(null);
      sessionRef.current = null;
      setSession(null);
    };

    /**
     * The server's confirmation of what this watch may do.
     *
     * The only thing that makes Monaco writable. The control that asked is a
     * request; this is the permission, and it is checked again server-side on
     * every update, so a client that skipped it gains nothing.
     */
    const onModeChanged = (event: WatchModeChangedEvent) => {
      const current = sessionRef.current;
      if (!current) return;
      // A confirmation for a superseded generation describes a session that no
      // longer exists. Applying it would unlock an editor on the strength of
      // permission granted to a watch that has already ended.
      if (
        event.visitId !== current.visitId ||
        event.generation !== current.generation
      ) {
        return;
      }
      const next = { ...current, mode: event.mode };
      sessionRef.current = next;
      setSession(next);
    };

    const onRefreshRequired = () => setRefreshRequired(true);

    socket.on(monitoringServerEvents.runChanged, onRun);
    socket.on(monitoringServerEvents.resultChanged, onResult);
    socket.on(monitoringServerEvents.feedbackCreated, onFeedback);
    socket.on(monitoringServerEvents.feedbackRead, onFeedbackRead);
    socket.on(monitoringServerEvents.watchEnded, onEnded);
    socket.on(monitoringServerEvents.watchModeChanged, onModeChanged);
    socket.on(
      monitoringServerEvents.protocolRefreshRequired,
      onRefreshRequired,
    );
    return () => {
      socket.off(monitoringServerEvents.runChanged, onRun);
      socket.off(monitoringServerEvents.resultChanged, onResult);
      socket.off(monitoringServerEvents.feedbackCreated, onFeedback);
      socket.off(monitoringServerEvents.feedbackRead, onFeedbackRead);
      socket.off(monitoringServerEvents.watchEnded, onEnded);
      socket.off(monitoringServerEvents.watchModeChanged, onModeChanged);
      socket.off(
        monitoringServerEvents.protocolRefreshRequired,
        onRefreshRequired,
      );
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
    identity: session ? identityOf(session) : null,
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
            identity: identityOf(current),
            idempotencyKey: crypto.randomUUID(),
            body,
          },
          monitoringAck(resolve),
        );
      }),
    [socket],
  );

  /**
   * Asking the server for edit permission, or handing it back.
   *
   * A request, never the grant. The editor becomes writable when the
   * acknowledgement arrives and not a moment earlier, and stepping back to
   * MONITORING locks it here immediately rather than waiting for the round
   * trip — withdrawing a permission must never be the slower of the two.
   */
  const setMode = React.useCallback(
    (mode: MonitoringWatchMode) =>
      new Promise<MonitoringAckResult<{ mode: MonitoringWatchMode }>>(
        (resolve) => {
          const current = sessionRef.current;
          if (!socket || !current) {
            resolve(undefined);
            return;
          }
          if (mode === 'MONITORING') {
            // Locked first, confirmed second. The server is the authority on
            // what is permitted, but the local editor must stop accepting
            // keystrokes the instant the teacher says stop.
            const locked = { ...current, mode };
            sessionRef.current = locked;
            setSession(locked);
          }
          socket.emit(
            monitoringClientEvents.watchMode,
            {
              eventId: crypto.randomUUID(),
              identity: identityOf(current),
              mode,
            },
            monitoringAck<{ mode: MonitoringWatchMode }>((ack) => {
              const latest = sessionRef.current;
              // The acknowledgement belongs to the watch that asked. A
              // reconnect in between means this answer is about a session
              // that has gone.
              if (latest && latest.visitId === current.visitId && ack?.ok) {
                const next = { ...latest, mode: ack.data.mode };
                sessionRef.current = next;
                setSession(next);
              }
              resolve(ack);
            }),
          );
        },
      ),
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
     * Turning edit permission on and off for this watch.
     *
     * The workspace opens read-only and stays that way until the teacher asks
     * and the server agrees; `helping` below reports what was actually
     * granted, never what was requested.
     */
    setMode,
    enableHelp: React.useCallback(() => setMode('HELPING'), [setMode]),
    disableHelp: React.useCallback(() => setMode('MONITORING'), [setMode]),
    /** Whether the server has confirmed this watch may edit, right now. */
    helping: session?.mode === 'HELPING',
    /**
     * This client speaks a retired watch protocol and must reload.
     *
     * Surfaced rather than retried: reconnecting earns the same refusal, and
     * the page has no way to upgrade itself in place.
     */
    refreshRequired,
    /**
     * Shared with the teacher's display controller, which listens for the
     * watched student's movement on this same connection. Opening a second
     * socket would rejoin the watch's rooms and double every event.
     */
    socket,
    /**
     * Whether a shared document exists right now.
     *
     * The same condition that gates awareness publishing, so the statement
     * enters and leaves its fixed canvas in step with the student's.
     */
    collaborating: session?.draftId != null,
    /**
     * Whether the workspace is live enough to act on at all.
     *
     * The transport is up, the watch is authorized, and this exact draft's
     * authoritative snapshot has been applied. Feedback and Run answer to
     * this; changing the student's code does not — see `canEditCode`.
     */
    canEdit: canEditSynchronizedDraft({
      state,
      sessionDraftId: session?.draftId ?? null,
      syncedDraftId,
      ended: ended !== null,
    }),
    /**
     * Whether Monaco may be writable.
     *
     * Everything `canEdit` requires, plus server-confirmed edit permission.
     * A workspace opens read-only, a reconnect returns to read-only because
     * the new watch starts in MONITORING, and losing the connection disables
     * it through `state`. The server enforces the same rule independently, so
     * this is the UI agreeing with the gate rather than being it.
     */
    canEditCode:
      session?.mode === 'HELPING' &&
      canEditSynchronizedDraft({
        state,
        sessionDraftId: session?.draftId ?? null,
        syncedDraftId,
        ended: ended !== null,
      }),
  };
}
