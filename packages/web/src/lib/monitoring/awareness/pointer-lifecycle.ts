import { monitoringTiming, type CollaborationPointer } from '@cove/shared';

/**
 * How long a remote mouse pointer may go on being drawn after it last moved.
 *
 * The two halves of a monitoring session are not symmetric here. A student is
 * being told that somebody is present, and that sentence stops being true the
 * moment the teacher's mouse stops arriving — a stale arrow over their code
 * claims attention nobody is paying. A teacher is reading a workspace, and the
 * student's last position is part of what they are reading; removing it after
 * three still seconds would delete information rather than correct it.
 *
 * The rule is passed in as a value rather than derived from the peer's origin,
 * the route, or the label on screen. Two callers, two explicit decisions, and
 * no component below this one has to translate a role into a timeout.
 */
export type RemotePointerLifecycle = {
  /** Null when only an explicit clear may remove the pointer. */
  readonly idleExpiryMs: number | null;
};

/** The teacher's pointer, as a student renders it. */
export const expiresWhenIdle: RemotePointerLifecycle = {
  idleExpiryMs: monitoringTiming.pointerExpiryMs,
};

/** The student's pointer, as a teacher renders it. */
export const staysUntilCleared: RemotePointerLifecycle = {
  idleExpiryMs: null,
};

/**
 * How long a just-arrived pointer may survive, or null for no timer at all.
 *
 * Null rather than `Infinity`: nothing is scheduled unless there is something
 * to schedule, so a pointer that never expires costs no timer and cannot be
 * removed by one that outlived the state it was measured from.
 */
export function idleExpiryFor(
  lifecycle: RemotePointerLifecycle,
  pointer: CollaborationPointer | null,
): number | null {
  if (!pointer) return null;
  return lifecycle.idleExpiryMs;
}

/**
 * Arms the countdown for one received pointer, and returns how to disarm it.
 *
 * Written as a scheduler rather than inlined into an effect so the rule can be
 * exercised on its own clock. The restart-on-every-event behavior falls out of
 * the cleanup: each arriving pointer disarms the previous countdown before its
 * own is armed, so the deadline is always measured from the newest position
 * and never from the first one.
 */
export function scheduleRemotePointerExpiry(
  lifecycle: RemotePointerLifecycle,
  pointer: CollaborationPointer | null,
  onExpired: () => void,
): (() => void) | undefined {
  const expiryMs = idleExpiryFor(lifecycle, pointer);
  if (expiryMs === null) return undefined;
  const timer = setTimeout(onExpired, expiryMs);
  return () => clearTimeout(timer);
}
