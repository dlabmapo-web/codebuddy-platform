'use client';

import {
  monitoringClientEvents,
  monitoringServerEvents,
  type StudentIndicatorState,
  type WatchEndedEvent,
  type WatchStartedEvent,
} from '@cove/shared';
import * as React from 'react';
import * as Y from 'yjs';

import type { TerminalTranscript } from '@/lib/workspace/terminal-transcript';
import type { TerminalEvent } from '@/lib/workspace/use-python-runner';

import { expiresWhenIdle } from './awareness/pointer-lifecycle';
import { attachRemoteCursor, readCursor } from './awareness/remote-cursor';
import { useAwareness } from './awareness/use-awareness';
import { bindYTextToMonaco, type MonacoCodeEditor, type YjsMonacoBinding } from './yjs-monaco';
import { useStudentPresence } from './student-presence';
import { useTerminalMirrorPublisher } from './use-terminal-mirror-publisher';

/**
 * The student's half of live monitoring.
 *
 * Publishes signals and joins the shared document; it never decides a state
 * and never learns who is watching. The indicator it returns is generic by
 * construction — the server sends `MONITORING` or `HELPING` and no name, so
 * there is nothing here that could disclose one.
 *
 * Collaboration binds only once a teacher is actually present. Until then the
 * student's ordinary autosave is the only thing writing their draft, which
 * keeps the everyday path exactly as it was.
 *
 * ## One session per exercise
 *
 * The workspace deliberately does not remount between problems — the Pyodide
 * worker and the editor are kept alive, which is what makes Previous/Next
 * instant. Everything here therefore belongs to an explicit session: an
 * exercise, a class, a draft once one is authorized, and a generation that
 * only ever moves forward. A socket event, a synchronization answer, or an
 * editor registration that names a retired generation changes nothing. Without
 * that, a document opened on one problem stays attached while the next
 * problem's code is written into the same Monaco model, and the two problems'
 * text — and their CRDT histories — end up merged.
 */

/**
 * Where this exercise's collaboration has got to.
 *
 * `local` is the everyday case and the great majority of the time: nobody is
 * watching and nothing is shared. `syncing` is a watch authorized but not yet
 * answered — the room exists, the document does not. `bound` is the editor and
 * the document attached to each other. `retired` is a session the reader has
 * navigated away from, kept only so that a late answer about it can be
 * recognized and ignored.
 */
export type StudentSessionPhase = 'local' | 'syncing' | 'bound' | 'retired';

type StudentSession = {
  generation: number;
  classId: string;
  materialId: string | null;
  /** Null until a watch is authorized and names one. */
  draftId: string | null;
  phase: StudentSessionPhase;
};

export function useStudentMonitoring({
  classId,
  courseId,
  materialId,
  onBeforeCollaborate,
  onAfterCollaborate,
  ready,
  teacherLabel,
  terminal,
}: {
  classId: string;
  courseId: string | null;
  materialId: string | null;
  /**
   * Whether the editor's buffer is this student's settled draft.
   *
   * The first bind of a draft hands that buffer to the server, so it must be
   * the right one before it happens. Two things can make it wrong. On a cached
   * revisit it is briefly the code the workspace query was cached with, and
   * publishing it would overwrite newer local work. While an old submission is
   * open for review it is not the student's draft at all, and publishing it
   * would replace their work with an attempt they only looked at.
   */
  ready: boolean;
  /**
   * Persists the local draft, so the server seeds the document from it.
   *
   * Must not promote a reviewed submission the student never edited: being
   * watched is not a decision to replace their draft with an old attempt.
   */
  onBeforeCollaborate?: () => Promise<void>;
  onAfterCollaborate?: (snapshot: { code: string; updatedAt: string }) => void;
  /**
   * The student's own terminal, mirrored to whoever is watching.
   *
   * Passed in rather than created here: the runner belongs to the workspace and
   * knows nothing about monitoring, and this hook knows nothing about Python.
   */
  terminal: {
    subscribeTerminal: (listener: (event: TerminalEvent) => void) => () => void;
    readTranscript: () => TerminalTranscript;
  };
  /**
   * What the teacher's caret is called on this student's screen.
   *
   * Generic on purpose — "Teacher", never a name. The student is told that
   * somebody is helping and never which member of staff it is, and the
   * awareness payload carries no name for a modified client to reveal.
   */
  teacherLabel: string;
}) {
  const {
    markActive,
    setOpenMaterial,
    socket,
    state,
  } = useStudentPresence();
  const [indicator, setIndicator] = React.useState<StudentIndicatorState>('NONE');
  const [session, setSession] = React.useState<StudentSession>(() => ({
    generation: 0,
    classId,
    materialId,
    draftId: null,
    phase: 'local',
  }));
  // Socket handlers outlive any one render, so they read the session through a
  // ref rather than closing over the value they were created with.
  const sessionRef = React.useRef(session);
  const publish = React.useCallback((next: StudentSession) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  /**
   * One document per draft, replaced whenever the draft changes.
   *
   * Reusing it across problems merges two exercises' histories into one CRDT,
   * which then synchronizes back to the server as though the student had
   * written the concatenation.
   */
  const [doc, setDoc] = React.useState(() => new Y.Doc());
  // Socket handlers outlive any one render, so the current document is read
  // through a ref rather than closed over.
  const docRef = React.useRef(doc);
  const editorRef = React.useRef<MonacoCodeEditor | null>(null);
  const bindingRef = React.useRef<YjsMonacoBinding | null>(null);
  /** Whether this session's authoritative snapshot has arrived. */
  const syncedRef = React.useRef(false);
  /**
   * Drafts this client has already handed its buffer to.
   *
   * The first bind of a draft is a handoff: the editor holds work the server
   * has never seen, so the model wins. Every later bind — a rebind after a
   * teacher left and returned, or after a reconnect — must take the document
   * instead, or the whole buffer is republished and whatever the teacher did
   * in the meantime is undone.
   */
  const handedOffRef = React.useRef<Set<string>>(new Set());

  /* ------------------------------------------------------------- presence */

  /**
   * Presence lives in the academy layout, not here. This hook is mounted only
   * inside an exercise, and a student is on the roster the whole time they are
   * signed in — so all this page owns is telling the one publisher which
   * exercise is open, and marking activity while it is.
   */
  React.useEffect(() => {
    if (!materialId || !courseId) return;
    setOpenMaterial({ materialId, courseId, classId });
    return () => setOpenMaterial(null);
  }, [classId, courseId, materialId, setOpenMaterial]);

  /* -------------------------------------------------------- the lifecycle */

  /**
   * Detaches this session from the editor and the socket, for good.
   *
   * Called before the destination's code is written into Monaco, and on
   * teardown. The binding goes first: while it is attached, any write to the
   * model — including the controlled `value` the workspace is about to change
   * — is reported as a local edit and published into the outgoing problem's
   * document.
   */
  const retire = React.useCallback(() => {
    bindingRef.current?.destroy();
    bindingRef.current = null;
    syncedRef.current = false;
    const current = sessionRef.current;
    if (current.phase === 'retired' && current.draftId === null) return;
    sessionRef.current = { ...current, draftId: null, phase: 'retired' };
    setSession(sessionRef.current);
    setIndicator('NONE');
  }, []);

  /**
   * A different exercise is a different session, and a different document.
   *
   * A layout effect, not a render-time adjustment and not an ordinary effect.
   * The ordering is the whole point: `@monaco-editor/react` writes a changed
   * `value` into the model from a passive effect, and a child's passive
   * effects run before this component's. A passive effect here would therefore
   * see the destination's code already in a model still bound to the outgoing
   * problem's document — which is the contamination this exists to prevent.
   * Layout effects run before any of them.
   *
   * `beforeCommit` calls `retire` ahead of this on every guarded transition;
   * this is what catches everything else, including a class changing underneath
   * the workspace.
   */
  const identityRef = React.useRef(`${classId}:${materialId ?? ''}`);
  React.useLayoutEffect(() => {
    const identity = `${classId}:${materialId ?? ''}`;
    if (identityRef.current === identity) return;
    identityRef.current = identity;
    bindingRef.current?.destroy();
    bindingRef.current = null;
    syncedRef.current = false;
    handedOffRef.current = new Set();
    const replacement = new Y.Doc();
    const stale = docRef.current;
    docRef.current = replacement;
    setDoc(replacement);
    stale.destroy();
    publish({
      generation: sessionRef.current.generation + 1,
      classId,
      materialId,
      draftId: null,
      phase: 'local',
    });
    setIndicator('NONE');
  }, [classId, materialId, publish]);

  /**
   * Binds when both halves are ready, in either order.
   *
   * Monaco is loaded dynamically and the socket answers on its own schedule,
   * so neither "the editor mounted" nor "the snapshot arrived" can be the
   * trigger on its own — whichever happens second has to complete the binding,
   * or a fast sync leaves the student unbound for the whole visit.
   */
  const readyRef = React.useRef(ready);
  const bindIfReady = React.useCallback(() => {
    const current = sessionRef.current;
    const editor = editorRef.current;
    if (
      bindingRef.current ||
      !editor ||
      !readyRef.current ||
      !syncedRef.current ||
      current.draftId === null ||
      current.materialId === null ||
      current.phase === 'retired'
    ) {
      return;
    }
    const firstHandoff = !handedOffRef.current.has(current.draftId);
    handedOffRef.current.add(current.draftId);
    bindingRef.current = bindYTextToMonaco(docRef.current.getText('code'), editor, {
      seed: firstHandoff ? 'model' : 'text',
      pointerIdentity: { draftId: current.draftId, material: current.materialId },
    });
    publish({ ...current, phase: 'bound' });
  }, [publish]);

  // Whichever of the three preconditions settles last completes the binding.
  React.useEffect(() => {
    readyRef.current = ready;
    if (ready) bindIfReady();
  }, [bindIfReady, ready]);

  /* ------------------------------------------------- the teacher's arrival */

  React.useEffect(() => {
    if (!socket) return;

    const onWatchStarted = (event: WatchStartedEvent) => {
      const current = sessionRef.current;
      // A watch is about one exercise in one class. An event naming anywhere
      // else describes a session this workspace is no longer in, and adopting
      // its draft id would label this problem's bytes with that one's.
      if (
        current.phase === 'retired' ||
        event.classId !== current.classId ||
        event.materialId !== current.materialId
      ) {
        return;
      }
      setIndicator(event.indicator);
      // A different draft is a different document. Reusing this one would
      // merge two problems' histories and send the result to the server.
      if (current.draftId !== null && current.draftId !== event.draftId) {
        bindingRef.current?.destroy();
        bindingRef.current = null;
        handedOffRef.current = new Set();
        const replacement = new Y.Doc();
        const stale = docRef.current;
        docRef.current = replacement;
        setDoc(replacement);
        stale.destroy();
      }
      syncedRef.current = false;
      publish({ ...current, draftId: event.draftId, phase: 'syncing' });
      // The ordinary draft snapshot is still saved, but it must not gate the
      // realtime room: a slow HTTP request would otherwise leave the student
      // unable to receive teacher edits. On sync, the binding seeds the CRDT
      // from the student's current Monaco model and sends the server whatever
      // it is missing, so unsaved work is preserved independently of this
      // background durability write.
      void onBeforeCollaborate?.();
      socket.emit(
        monitoringClientEvents.documentSync,
        {
          eventId: crypto.randomUUID(),
          draftId: event.draftId,
          stateVector: Y.encodeStateVector(docRef.current),
        },
        () => undefined,
      );
    };

    const onIndicator = (payload: { state: StudentIndicatorState }) => {
      if (sessionRef.current.phase === 'retired') return;
      setIndicator(payload.state);
    };

    const onWatchEnded = (event: WatchEndedEvent) => {
      const current = sessionRef.current;
      // A watch that ended somewhere else says nothing about this one. The
      // payload carries the draft precisely so a stale ending cannot silence
      // an indicator for a session that is still live.
      if (event.draftId !== null && event.draftId !== current.draftId) return;
      if (event.classId !== current.classId) return;
      if (event.snapshot) onAfterCollaborate?.(event.snapshot);
      // Only a confirmed end clears the indicator. A dropped connection shows
      // reconnecting instead, so a blink never reads as "they left".
      setIndicator('NONE');
      bindingRef.current?.destroy();
      bindingRef.current = null;
      syncedRef.current = false;
      handedOffRef.current = new Set();
      // The document goes with the watch. The editor is untouched and the
      // ordinary autosave still owns this text, so nothing is lost — and a
      // later watch starts from the server's copy rather than from a history
      // this client has been carrying around unattached.
      const replacement = new Y.Doc();
      const stale = docRef.current;
      docRef.current = replacement;
      setDoc(replacement);
      stale.destroy();
      publish({ ...current, draftId: null, phase: 'local' });
    };

    const onSynced = (event: {
      draftId: string;
      update: Uint8Array;
      stateVector: Uint8Array;
    }) => {
      const current = sessionRef.current;
      if (event.draftId !== current.draftId || current.phase === 'retired') return;
      Y.applyUpdate(docRef.current, toBytes(event.update), 'server');
      // Idempotent: Yjs updates converge, and binding is guarded on its own,
      // so a duplicated synchronization costs nothing and changes nothing.
      syncedRef.current = true;
      bindIfReady();
      const missing = Y.encodeStateAsUpdate(
        docRef.current,
        toBytes(event.stateVector),
      );
      if (missing.byteLength > 2) {
        socket.emit(
          monitoringClientEvents.documentUpdate,
          { eventId: crypto.randomUUID(), draftId: event.draftId, update: missing },
          () => undefined,
        );
      }
    };

    const onUpdated = (event: { draftId: string; update: Uint8Array }) => {
      // An update for another draft belongs to another problem's document.
      if (event.draftId !== sessionRef.current.draftId) return;
      Y.applyUpdate(docRef.current, toBytes(event.update), 'remote');
    };

    socket.on(monitoringServerEvents.watchStarted, onWatchStarted);
    socket.on(monitoringServerEvents.watchEnded, onWatchEnded);
    socket.on(monitoringServerEvents.studentIndicator, onIndicator);
    socket.on(monitoringServerEvents.documentSynced, onSynced);
    socket.on(monitoringServerEvents.documentUpdated, onUpdated);
    return () => {
      socket.off(monitoringServerEvents.watchStarted, onWatchStarted);
      socket.off(monitoringServerEvents.watchEnded, onWatchEnded);
      socket.off(monitoringServerEvents.studentIndicator, onIndicator);
      socket.off(monitoringServerEvents.documentSynced, onSynced);
      socket.off(monitoringServerEvents.documentUpdated, onUpdated);
    };
  }, [bindIfReady, onAfterCollaborate, onBeforeCollaborate, publish, socket]);

  /** Local edits leave as bounded updates while a teacher is in the room. */
  React.useEffect(() => {
    if (!socket) return;
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      const current = sessionRef.current;
      if (
        !current.draftId ||
        current.phase === 'retired' ||
        origin === 'remote' ||
        origin === 'server'
      ) {
        return;
      }
      socket.emit(
        monitoringClientEvents.documentUpdate,
        { eventId: crypto.randomUUID(), draftId: current.draftId, update },
        () => undefined,
      );
    };
    doc.on('update', onUpdate);
    return () => doc.off('update', onUpdate);
  }, [doc, socket]);

  React.useEffect(
    () => () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
      docRef.current.destroy();
    },
    [],
  );

  /* -------------------------------------------------------------- awareness */

  // The same hook the teacher runs, with the origins swapped: this side sends
  // the student's cursor and mouse, and renders the teacher's.
  //
  // The teacher's arrow fades three seconds after it stops moving. The student
  // is working, not supervising, and an arrow parked over their code says
  // somebody is following along when nobody may be.
  const draftId = session.draftId;
  const { remote, publishCursor } = useAwareness({
    draftId,
    peerOrigin: 'TEACHER',
    remoteCursor: expiresWhenIdle,
    remotePointer: expiresWhenIdle,
    socket,
  });

  const [editor, setEditor] = React.useState<MonacoCodeEditor | null>(null);
  const remoteCursorRef = React.useRef<ReturnType<
    typeof attachRemoteCursor
  > | null>(null);

  React.useEffect(() => {
    // Nothing is drawn in the editor until a teacher is actually in the room;
    // an unwatched student's editor is exactly the editor it always was.
    if (!editor || !draftId) return;
    const cursor = attachRemoteCursor(editor, teacherLabel, 'teacher');
    remoteCursorRef.current = cursor;
    return () => {
      cursor.dispose();
      remoteCursorRef.current = null;
    };
  }, [draftId, editor, teacherLabel]);

  React.useEffect(() => {
    remoteCursorRef.current?.update(remote.cursor);
  }, [remote.cursor]);

  /**
   * Activity, whether or not anybody is watching.
   *
   * Deliberately outside the `draftId` gate below. A student arrowing through
   * their code is working, and until this was split out that only counted once
   * a teacher had already opened them — so the roster reported different
   * things about identical behaviour depending on who was looking.
   */
  React.useEffect(() => {
    if (!editor) return;
    const cursorListener = editor.onDidChangeCursorSelection(markActive);
    const contentListener = editor.onDidChangeModelContent(markActive);
    return () => {
      cursorListener.dispose();
      contentListener.dispose();
    };
  }, [editor, markActive]);

  React.useEffect(() => {
    if (!editor || !draftId) return;
    const cursorListener = editor.onDidChangeCursorSelection((event) => {
      publishCursor(readCursor(event.selection));
    });
    let frame = 0;
    const contentListener = editor.onDidChangeModelContent(() => {
      cancelAnimationFrame(frame);
      // WebKit Monaco can apply text without a following cursor-selection
      // event. Read after Monaco finishes the edit so the teacher receives
      // the final column rather than the position before the keystroke.
      frame = requestAnimationFrame(() => {
        publishCursor(readCursor(editor.getSelection()));
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      cursorListener.dispose();
      contentListener.dispose();
    };
  }, [draftId, editor, publishCursor]);

  /* ---------------------------------------------------------------- terminal */

  // The live terminal mirror. It publishes only while a draft room exists, so
  // an unwatched student's runs stay entirely local.
  useTerminalMirrorPublisher({
    draftId,
    readTranscript: terminal.readTranscript,
    socket,
    subscribeTerminal: terminal.subscribeTerminal,
  });

  /* -------------------------------------------------------------- publishing */

  const publishRun = React.useCallback(
    (run: {
      clientRunId: string;
      lifecycle: 'STARTED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
      sampleCount: number;
      passedCount: number;
      output: string;
    }) => {
      markActive();
      if (!socket || !draftId) return;
      socket.emit(monitoringClientEvents.runActivity, {
        draftId,
        ...run,
        // Bounded before it leaves: the teacher needs the shape of the output,
        // not a megabyte of it.
        output: run.output.slice(0, 4_000),
        at: new Date().toISOString(),
      });
    },
    [draftId, markActive, socket],
  );

  const publishResult = React.useCallback(
    (submissionId: string) => {
      if (!socket || !draftId) return;
      // An id only. The server reads the verdict back and decides what the
      // teacher is told about it.
      socket.emit(monitoringClientEvents.resultPublish, { draftId, submissionId });
    },
    [draftId, socket],
  );

  return {
    /**
     * Whether a shared document exists right now.
     *
     * The same condition that gates awareness publishing, exposed so the
     * statement can switch onto its fixed canvas for exactly as long as there
     * is a peer to share coordinates with — and not one render longer.
     */
    collaborating: draftId !== null,
    phase: session.phase,
    indicator:
      indicator !== 'NONE' && state === 'reconnecting' ? 'RECONNECTING' : indicator,
    markActive,
    publishResult,
    publishRun,
    /** The teacher's mouse, for the page to draw over its own panes. */
    remote,
    /** Handed to the editor so collaboration can bind to the live model. */
    registerEditor: React.useCallback(
      (instance: MonacoCodeEditor) => {
        editorRef.current = instance;
        setEditor(instance);
        // The snapshot may already be here: whichever arrived second binds.
        bindIfReady();
      },
      [bindIfReady],
    ),
    /**
     * Detaches this exercise's collaboration before its editor is reused.
     *
     * The workspace calls this as part of committing a transition, ahead of
     * writing the destination's code into the model that is still bound to
     * this problem's document.
     */
    retire,
    /**
     * A deliberate whole-buffer replacement — Reset — routed through the
     * document rather than around it, so a watching teacher's editor and the
     * server's copy follow rather than diverge.
     */
    replaceDocument: React.useCallback((text: string) => {
      bindingRef.current?.replace(text);
    }, []),
    /**
     * Shared with the feedback thread, which listens on the same connection.
     *
     * Exposed rather than opened twice: `useMonitoringSocket` creates a socket
     * per call, and a second one would join the student's rooms again and
     * double every event the page receives.
     */
    socket,
  };
}

function toBytes(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}
