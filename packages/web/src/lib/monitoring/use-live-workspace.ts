'use client';

import {
  monitoringClientEvents,
  monitoringServerEvents,
  type DocumentPersistedEvent,
  type DocumentSyncedEvent,
  type DocumentUpdatedEvent,
  type FeedbackCreatedEvent,
  type MonitoringFeedback,
  type MonitoringVisitEndReason,
  type ResultChangedEvent,
  type RunActivityPayload,
  type WatchEndedEvent,
} from '@cove/shared';
import * as React from 'react';
import * as Y from 'yjs';

import { staysUntilCleared } from './awareness/pointer-lifecycle';
import { useAwareness } from './awareness/use-awareness';
import { monitoringAck, type MonitoringAckResult } from './types';
import { canActLive } from './connection';
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
  const [run, setRun] = React.useState<RunActivityPayload | null>(null);
  const [result, setResult] = React.useState<ResultChangedEvent | null>(null);
  const [feedback, setFeedback] = React.useState<MonitoringFeedback[]>([]);

  // One document per mounted workspace, created once. A state initializer
  // rather than a lazily filled ref: the document is a value this component
  // owns for its whole life, not something read back during render.
  const [doc] = React.useState(() => new Y.Doc());
  // Socket handlers outlive any one render, so they read the session through a
  // ref rather than closing over the value they were created with.
  const sessionRef = React.useRef<LiveWorkspaceSession | null>(null);
  React.useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  React.useEffect(() => () => doc.destroy(), [doc]);

  /* ------------------------------------------------------------- the watch */

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
              stateVector: Y.encodeStateVector(doc),
            },
            () => undefined,
          );
        }),
      );
    };

    socket.on('connect', startWatch);
    if (socket.connected) startWatch();

    return () => {
      socket.off('connect', startWatch);
      socket.emit(
        monitoringClientEvents.watchStop,
        { eventId: crypto.randomUUID() },
        () => undefined,
      );
    };
  }, [academyId, classId, doc, report, socket, studentMembershipId]);

  /* ---------------------------------------------------------- the document */

  React.useEffect(() => {
    if (!socket) return;

    const onSynced = (event: DocumentSyncedEvent) => {
      if (event.draftId !== sessionRef.current?.draftId) return;
      Y.applyUpdate(doc, toBytes(event.update), 'server');
      // Teacher editing is disabled until this snapshot arrives, so the
      // teacher cannot legitimately be ahead of the server here. Only the
      // student performs bidirectional reconciliation; sending a teacher-side
      // delta during bootstrap would falsely classify setup as active help.
      report({ type: 'synchronized' });
    };

    const onUpdated = (event: DocumentUpdatedEvent) => {
      if (event.draftId !== sessionRef.current?.draftId) return;
      Y.applyUpdate(doc, toBytes(event.update), 'remote');
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
  }, [doc, report, socket]);

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

  /* -------------------------------------------------- activity and results */

  React.useEffect(() => {
    if (!socket) return;
    const onRun = (event: RunActivityPayload) => setRun(event);
    const onResult = (event: ResultChangedEvent) => setResult(event);
    const onFeedback = (event: FeedbackCreatedEvent) => {
      setFeedback((current) =>
        current.some((item) => item.id === event.feedback.id)
          ? current
          : [...current, event.feedback],
      );
    };
    const onEnded = (event: WatchEndedEvent) => {
      setEnded(event.reason);
      sessionRef.current = null;
      setSession(null);
    };

    socket.on(monitoringServerEvents.runChanged, onRun);
    socket.on(monitoringServerEvents.resultChanged, onResult);
    socket.on(monitoringServerEvents.feedbackCreated, onFeedback);
    socket.on(monitoringServerEvents.watchEnded, onEnded);
    return () => {
      socket.off(monitoringServerEvents.runChanged, onRun);
      socket.off(monitoringServerEvents.resultChanged, onResult);
      socket.off(monitoringServerEvents.feedbackCreated, onFeedback);
      socket.off(monitoringServerEvents.watchEnded, onEnded);
    };
  }, [socket]);

  /* -------------------------------------------------------------- awareness */

  // The student's cursor and pointer, and this teacher's own on the way out.
  // Both halves are the same hook the student runs; the origin differs, and so
  // does what silence means.
  //
  // The student's arrow stays where they left it. A teacher reading a workspace
  // is reading where the student was last looking, and a student who has gone
  // quiet for four seconds is thinking, not absent — the pointer goes when the
  // student leaves the surface, the tab, or the session, and not before.
  const { remote, publishCursor } = useAwareness({
    draftId: session?.draftId ?? null,
    peerOrigin: 'STUDENT',
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
    session,
    state,
    ended,
    denied,
    unsaved,
    run,
    result,
    feedback,
    remote,
    setFeedback,
    publishCursor,
    sendFeedback,
    // Editing and feedback stay disabled until the watch and the first
    // document sync are both confirmed.
    canEdit: canActLive(state) && session !== null && ended === null,
  };
}

/**
 * Socket.IO hands binary payloads back as `ArrayBuffer` in some transports and
 * as `Uint8Array` in others; Yjs needs the view either way.
 */
function toBytes(value: Uint8Array | ArrayBuffer): Uint8Array {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}
