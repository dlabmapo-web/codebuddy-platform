'use client';

import {
  monitoringClientEvents,
  monitoringServerEvents,
  monitoringTiming,
  type StudentIndicatorState,
  type WatchStartedEvent,
} from '@cove/shared';
import * as React from 'react';
import * as Y from 'yjs';

import { attachRemoteCursor, readCursor } from './awareness/remote-cursor';
import { useAwareness } from './awareness/use-awareness';
import { bindYTextToMonaco, type MonacoCodeEditor } from './yjs-monaco';
import { useMonitoringSocket } from './use-monitoring-socket';

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
 */
export function useStudentMonitoring({
  academyId,
  courseId,
  materialId,
  onBeforeCollaborate,
  teacherLabel,
}: {
  academyId: string;
  courseId: string | null;
  materialId: string | null;
  /** Flushes the local draft, so the server seeds the document from it. */
  onBeforeCollaborate?: () => Promise<void>;
  /**
   * What the teacher's caret is called on this student's screen.
   *
   * Generic on purpose — "Teacher", never a name. The student is told that
   * somebody is helping and never which member of staff it is, and the
   * awareness payload carries no name for a modified client to reveal.
   */
  teacherLabel: string;
}) {
  const { socket, state } = useMonitoringSocket();
  const [indicator, setIndicator] = React.useState<StudentIndicatorState>('NONE');
  const [draftId, setDraftId] = React.useState<string | null>(null);
  // Created once, for this student's session. See `use-live-workspace` for why
  // this is a state initializer rather than a lazily filled ref.
  const [doc] = React.useState(() => new Y.Doc());
  const editorRef = React.useRef<MonacoCodeEditor | null>(null);
  const bindingRef = React.useRef<{ destroy: () => void } | null>(null);
  const activeRef = React.useRef(false);
  const visibilityRef = React.useRef<'VISIBLE' | 'HIDDEN'>('VISIBLE');

  /** Any real interaction; a heartbeat on its own is not activity. */
  const markActive = React.useCallback(() => {
    activeRef.current = true;
  }, []);

  /* ------------------------------------------------------------- presence */

  React.useEffect(() => {
    if (!socket) return;

    const publish = () => {
      socket.emit(monitoringClientEvents.presencePublish, {
        academyId,
        materialId,
        courseId,
        visibility: visibilityRef.current,
        active: activeRef.current,
      });
      activeRef.current = false;
    };

    const onVisibility = () => {
      visibilityRef.current = document.hidden ? 'HIDDEN' : 'VISIBLE';
      publish();
    };

    publish();
    const timer = setInterval(publish, monitoringTiming.presenceHeartbeatMs);
    globalThis.document?.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      globalThis.document?.removeEventListener('visibilitychange', onVisibility);
    };
  }, [academyId, courseId, materialId, socket]);

  /* ------------------------------------------------- the teacher's arrival */

  React.useEffect(() => {
    if (!socket) return;

    const onWatchStarted = (event: WatchStartedEvent) => {
      setIndicator(event.indicator);
      setDraftId(event.draftId);
      // The ordinary draft snapshot is still saved, but it must not gate the
      // realtime room: a slow HTTP request would otherwise leave the student
      // unable to receive teacher edits. On sync, `bindEditor` seeds the CRDT
      // from the student's current Monaco model and sends the server whatever
      // it is missing, so unsaved work is preserved independently of this
      // background durability write.
      void onBeforeCollaborate?.();
      socket.emit(
        monitoringClientEvents.documentSync,
        {
          eventId: crypto.randomUUID(),
          draftId: event.draftId,
          stateVector: Y.encodeStateVector(doc),
        },
        () => undefined,
      );
    };

    const onIndicator = (payload: { state: StudentIndicatorState }) => {
      setIndicator(payload.state);
    };

    const onWatchEnded = () => {
      // Only a confirmed end clears the indicator. A dropped connection shows
      // reconnecting instead, so a blink never reads as "they left".
      setIndicator('NONE');
      setDraftId(null);
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };

    const onSynced = (event: {
      draftId: string;
      update: Uint8Array;
      stateVector: Uint8Array;
    }) => {
      Y.applyUpdate(doc, toBytes(event.update), 'server');
      bindEditor();
      const missing = Y.encodeStateAsUpdate(doc, toBytes(event.stateVector));
      if (missing.byteLength > 2) {
        socket.emit(
          monitoringClientEvents.documentUpdate,
          { eventId: crypto.randomUUID(), draftId: event.draftId, update: missing },
          () => undefined,
        );
      }
    };

    const onUpdated = (event: { draftId: string; update: Uint8Array }) => {
      Y.applyUpdate(doc, toBytes(event.update), 'remote');
    };

    const bindEditor = () => {
      const editor = editorRef.current;
      if (!editor || bindingRef.current) return;
      // The student's own editor wins at bind time: it holds their work.
      bindingRef.current = bindYTextToMonaco(doc.getText('code'), editor, {
        seed: 'model',
      });
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
  }, [doc, onBeforeCollaborate, socket]);

  /** Local edits leave as bounded updates while a teacher is in the room. */
  React.useEffect(() => {
    if (!socket) return;
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (!draftId || origin === 'remote' || origin === 'server') return;
      socket.emit(
        monitoringClientEvents.documentUpdate,
        { eventId: crypto.randomUUID(), draftId, update },
        () => undefined,
      );
    };
    doc.on('update', onUpdate);
    return () => doc.off('update', onUpdate);
  }, [doc, draftId, socket]);

  React.useEffect(
    () => () => {
      bindingRef.current?.destroy();
      doc.destroy();
    },
    [doc],
  );

  /* -------------------------------------------------------------- awareness */

  // The same hook the teacher runs, with the origins swapped: this side sends
  // the student's cursor and mouse, and renders the teacher's.
  const { remote, publishCursor } = useAwareness({
    draftId,
    peerOrigin: 'TEACHER',
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
    const cursor = attachRemoteCursor(editor, teacherLabel);
    remoteCursorRef.current = cursor;
    return () => {
      cursor.dispose();
      remoteCursorRef.current = null;
    };
  }, [draftId, editor, teacherLabel]);

  React.useEffect(() => {
    remoteCursorRef.current?.update(remote.cursor);
  }, [remote.cursor]);

  React.useEffect(() => {
    if (!editor || !draftId) return;
    const listener = editor.onDidChangeCursorSelection((event) => {
      markActive();
      publishCursor(readCursor(event.selection));
    });
    return () => listener.dispose();
  }, [draftId, editor, markActive, publishCursor]);

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
    indicator:
      indicator !== 'NONE' && state === 'reconnecting' ? 'RECONNECTING' : indicator,
    markActive,
    publishResult,
    publishRun,
    /** The teacher's mouse, for the page to draw over its own panes. */
    remote,
    /** Handed to the editor so collaboration can bind to the live model. */
    registerEditor: (instance: MonacoCodeEditor) => {
      editorRef.current = instance;
      setEditor(instance);
    },
  };
}

function toBytes(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}
