'use client';

import {
  monitoringClientEvents,
  monitoringTiming,
  shouldPublishActivity,
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
  state: MonitoringConnectionState;
  report: (event: ConnectionEvent) => void;
  /**
   * What the student has open, for as long as the page holding it is mounted.
   * Null everywhere else, which is what the roster reads as Online.
   */
  setOpenMaterial: (material: OpenMaterial | null) => void;
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
  socket: null,
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
    },
    [],
  );

  React.useEffect(() => {
    if (!socket) return;

    const publish = () => {
      lastPublishedAtRef.current = Date.now();
      socket.emit(monitoringClientEvents.presencePublish, {
        academyId,
        materialId: materialRef.current?.materialId ?? null,
        courseId: materialRef.current?.courseId ?? null,
        classId: materialRef.current?.classId ?? null,
        visibility: visibilityRef.current,
        active: activeRef.current,
      });
      activeRef.current = false;
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
    () => ({ markActive, report, setOpenMaterial, socket, state }),
    [markActive, report, setOpenMaterial, socket, state],
  );

  return (
    <StudentPresenceContext.Provider value={value}>
      {children}
    </StudentPresenceContext.Provider>
  );
}
