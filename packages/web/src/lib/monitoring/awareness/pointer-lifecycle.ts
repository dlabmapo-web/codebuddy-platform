import { monitoringTiming } from '@cove/shared';

/**
 * How long a remote awareness marker may remain after it last moved.
 *
 * Awareness intentionally differs by direction: every teacher marker fades
 * from the student's workspace, while the student's last pointer and active
 * line remain available to the supervising teacher until collaboration ends.
 *
 * The rule is passed in as a value rather than derived from the peer's origin,
 * the route, or the label on screen. Two callers, two explicit decisions, and
 * no component below this one has to translate a role into a timeout.
 */
export type RemoteAwarenessLifecycle = {
  /** Null when only an explicit clear may remove the marker. */
  readonly idleExpiryMs: number | null;
};

/** Backwards-compatible name for callers that only manage pointers. */
export type RemotePointerLifecycle = RemoteAwarenessLifecycle;

/** A marker that follows `main`'s three-second idle lifetime. */
export const expiresWhenIdle: RemoteAwarenessLifecycle = {
  idleExpiryMs: monitoringTiming.pointerExpiryMs,
};

/** A marker that remains until the collaboration lifecycle clears it. */
export const staysUntilCleared: RemoteAwarenessLifecycle = {
  idleExpiryMs: null,
};

/**
 * How long a just-arrived marker may survive, or null for no timer at all.
 *
 * Null rather than `Infinity`: nothing is scheduled unless there is something
 * to schedule, so a marker that never expires costs no timer and cannot be
 * removed by one that outlived the state it was measured from.
 */
export function idleExpiryFor(
  lifecycle: RemoteAwarenessLifecycle,
  marker: unknown | null,
): number | null {
  if (!marker) return null;
  return lifecycle.idleExpiryMs;
}

/**
 * Arms the countdown for one received marker, and returns how to disarm it.
 *
 * Written as a scheduler rather than inlined into an effect so the rule can be
 * exercised on its own clock. The restart-on-every-event behavior falls out of
 * the cleanup: each arriving pointer disarms the previous countdown before its
 * own is armed, so the deadline is always measured from the newest position
 * and never from the first one.
 */
export function scheduleRemoteAwarenessExpiry(
  lifecycle: RemoteAwarenessLifecycle,
  marker: unknown | null,
  onExpired: () => void,
): (() => void) | undefined {
  const expiryMs = idleExpiryFor(lifecycle, marker);
  if (expiryMs === null) return undefined;
  const timer = setTimeout(onExpired, expiryMs);
  return () => clearTimeout(timer);
}

/** @deprecated Use `scheduleRemoteAwarenessExpiry` for pointers and carets. */
export const scheduleRemotePointerExpiry = scheduleRemoteAwarenessExpiry;
