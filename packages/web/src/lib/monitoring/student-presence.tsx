'use client';

import {
  monitoringClientEvents,
  monitoringProtocolVersion,
  monitoringTiming,
  shouldPublishActivity,
  observationEvents,
  type ObservationWork,
} from '@cove/shared';
import * as React from 'react';
import type { Socket } from 'socket.io-client';

import type {
  ConnectionEvent,
  MonitoringConnectionState,
} from './connection';
import {
  LEARNING_ACTIVITY_EVENTS,
  isPlayingMedia,
} from './student-activity';
import { useMonitoringSocket } from './use-monitoring-socket';

type OpenMaterial = {
  materialId: string | null;
  courseId: string;
  classId: string;
};

type StudentPresence = {
  /**
   * The student's one academy-scoped realtime connection.
   *
   * Collaboration consumers attach to this same socket so the private room
   * joined by presence is also the room on which they hear watch events.
   */
  socket: Socket | null;
  /**
   * Which academy this student's connection belongs to.
   *
   * Exposed so a collaboration consumer can address a server command that
   * needs the academy — re-reading the aggregate watch summary after a
   * reconnect — without opening a second socket or threading the id through
   * every page that renders a workspace.
   */
  academyId: string | null;
  state: MonitoringConnectionState;
  report: (event: ConnectionEvent) => void;
  /**
   * What the student has open, for as long as the page holding it is mounted.
   * Null everywhere else, which is what the roster reads as Online.
   */
  setOpenMaterial: (material: OpenMaterial | null) => (() => void) | void;
  publishObservation: (materialId: string, work: ObservationWork) => void;
  watching: boolean;
  /** Any real interaction. A heartbeat on its own is not activity. */
  markActive: () => void;
};

/**
 * A no-op rather than a thrown error. Presence is ambient: a page that renders
 * outside the provider — a teacher's, or a student's before the layout has
 * resolved their role — should go on working silently rather than crash over a
 * signal it was never going to send.
 */
const noop: StudentPresence = {
  watching: false,
  publishObservation: () => undefined,
  socket: null,
  academyId: null,
  state: 'connecting',
  report: () => undefined,
  setOpenMaterial: () => undefined,
  markActive: () => undefined,
};

const StudentPresenceContext = React.createContext<StudentPresence>(noop);

export function useStudentPresence(): StudentPresence {
  return React.useContext(StudentPresenceContext);
}

/**
 * The student's presence, published for as long as they are in this academy.
 *
 * Mounted once by the academy layout so it survives navigation. There must be
 * exactly one of these per student: presence is a single row per class in the
 * registry, and a second publisher would fight the first over what the student
 * has open, flipping the teacher's roster between Online and Solving.
 *
 * It reports; it never decides. The server reads these signals and derives the
 * state, which is what stops a modified client from calling itself Solving
 * forever.
 */
export function StudentPresenceProvider({
  academyId,
  children,
}: {
  academyId: string;
  children: React.ReactNode;
}) {
  const { socket, state, report } = useMonitoringSocket();
  const [watching, setWatching] = React.useState(false);
  const workRef = React.useRef<{ materialId: string; work: ObservationWork; dirty: boolean } | null>(null);
  const revisionRef = React.useRef(0);
  const ownerRef = React.useRef<symbol | null>(null);
  const indicatorRevisionRef = React.useRef(-1);
  const publishObservation = React.useCallback((materialId: string, work: ObservationWork) => {
    const previous = workRef.current;
    if (previous?.materialId === materialId && JSON.stringify(previous.work) === JSON.stringify(work)) return;
    workRef.current = { materialId, work, dirty: true };
  }, []);
  const materialRef = React.useRef<OpenMaterial | null>(null);
  const activeRef = React.useRef(false);
  const visibilityRef = React.useRef<'VISIBLE' | 'HIDDEN'>('VISIBLE');
  const lastPublishedAtRef = React.useRef<number | null>(null);
  const publishRef = React.useRef<() => void>(() => undefined);

  const markActive = React.useCallback(() => {
    activeRef.current = true;
    // Straight out rather than on the next beat, so Solving lands within
    // seconds of the keystroke that earned it. The floor keeps continuous
    // typing and a moving pointer down to one frame per interval.
    if (shouldPublishActivity(lastPublishedAtRef.current, Date.now())) {
      publishRef.current();
    }
  }, []);

  const closeActivity = React.useCallback(() => {
    activeRef.current = false;
    // A stop signal is never throttled: leaving a tab or pausing a lesson must
    // close the server's interval before another cadence can be billed.
    publishRef.current();
  }, []);

  const setOpenMaterial = React.useCallback(
    (material: OpenMaterial | null) => {
      const owner = Symbol();
      ownerRef.current = owner;
      const previous = materialRef.current;
      materialRef.current = material;
      // Opening or leaving an exercise moves the student between Solving and
      // Online, so it goes out immediately rather than waiting for a beat.
      if (
        previous?.materialId !== material?.materialId ||
        previous?.courseId !== material?.courseId ||
        previous?.classId !== material?.classId
      ) {
        publishRef.current();
      }
      return () => {
        if (ownerRef.current !== owner) return;
        materialRef.current = null;
        workRef.current = null;
        publishRef.current();
      };
    },
    [],
  );

  React.useEffect(() => {
    if (!socket) return;

    const publish = () => {
      lastPublishedAtRef.current = Date.now();
      socket.emit(monitoringClientEvents.presencePublish, {
        protocolVersion: monitoringProtocolVersion,
        academyId,
        materialId: materialRef.current?.materialId ?? null,
        courseId: materialRef.current?.courseId ?? null,
        classId: materialRef.current?.classId ?? null,
        visibility: visibilityRef.current,
        active: activeRef.current,
      });
      activeRef.current = false;
      if (workRef.current) workRef.current.dirty = true;
    };
    publishRef.current = publish;

    const onVisibility = () => {
      visibilityRef.current = document.hidden ? 'HIDDEN' : 'VISIBLE';
      publish();
    };

    const onActivity = () => markActive();
    const onVideoProgress = (event: Event) => {
      const video = event.target;
      if (!(video instanceof HTMLMediaElement)) return;
      if (isPlayingMedia(video)) markActive();
    };
    const onVideoStop = (event: Event) => {
      if (event.target instanceof HTMLMediaElement) closeActivity();
    };

    // Publishing to a disconnected Socket.IO client relies on its temporary
    // send buffer. That is useful for commands, but presence describes the
    // connection that actually delivered it. Reassert it on every connect so
    // the teacher-first and reconnect paths have the same deterministic start.
    socket.on('connect', publish);
    if (socket.connected) publish();
    const timer = setInterval(publish, monitoringTiming.presenceHeartbeatMs);
    const publishWork = () => {
      const entry = workRef.current;
      const material = materialRef.current;
      if (!socket.connected || !entry?.dirty || !material?.classId || entry.materialId !== material.materialId) return;
      socket.timeout(5000).emit(observationEvents.publish, { academyId, classId: material.classId, materialId: entry.materialId,
        revision: ++revisionRef.current, work: entry.work }, (failure: Error | null, accepted: boolean) => {
        if (!failure && accepted && workRef.current === entry) entry.dirty = false;
      });
    };
    const requestWork = () => { if (workRef.current) workRef.current.dirty = true; publishWork(); };
    const onIndicator = (event: { watching: boolean; revision: number }) => {
      if (!Number.isSafeInteger(event.revision) || event.revision <= indicatorRevisionRef.current) return;
      indicatorRevisionRef.current = event.revision;
      setWatching(event.watching === true);
    };
    const disconnected = () => setWatching(false);
    socket.on(observationEvents.request, requestWork);
    socket.on(observationEvents.indicator, onIndicator);
    socket.on('disconnect', disconnected);
    const workTimer = setInterval(publishWork, 500);
    globalThis.document?.addEventListener('visibilitychange', onVisibility);
    for (const type of LEARNING_ACTIVITY_EVENTS) {
      globalThis.addEventListener(type, onActivity, {
        capture: true,
        passive: true,
      });
    }
    // Media events do not bubble consistently, so delegation uses capture.
    globalThis.document?.addEventListener('playing', onVideoProgress, true);
    globalThis.document?.addEventListener('timeupdate', onVideoProgress, true);
    globalThis.document?.addEventListener('pause', onVideoStop, true);
    globalThis.document?.addEventListener('ended', onVideoStop, true);
    return () => {
      clearInterval(timer);
      clearInterval(workTimer);
      socket.off(observationEvents.request, requestWork);
      socket.off(observationEvents.indicator, onIndicator);
      socket.off('disconnect', disconnected);
      globalThis.document?.removeEventListener('visibilitychange', onVisibility);
      for (const type of LEARNING_ACTIVITY_EVENTS) {
        globalThis.removeEventListener(type, onActivity, { capture: true });
      }
      globalThis.document?.removeEventListener('playing', onVideoProgress, true);
      globalThis.document?.removeEventListener('timeupdate', onVideoProgress, true);
      globalThis.document?.removeEventListener('pause', onVideoStop, true);
      globalThis.document?.removeEventListener('ended', onVideoStop, true);
      socket.off('connect', publish);
      publishRef.current = () => undefined;
    };
  }, [academyId, closeActivity, markActive, socket]);

  const value = React.useMemo(
    () => ({ academyId, markActive, report, setOpenMaterial, socket, state, watching, publishObservation }),
    [academyId, markActive, report, setOpenMaterial, socket, state, watching, publishObservation],
  );

  return (
    <StudentPresenceContext.Provider value={value}>
      {children}
    </StudentPresenceContext.Provider>
  );
}
