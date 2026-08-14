/**
 * When a student's session ends, and what the interface says on the way there.
 *
 * Every rule is a pure function of an *absolute deadline* and the current
 * instant. That is the whole design. A countdown built on `setTimeout` alone is
 * wrong the moment a laptop lid closes: the timer stops, the student comes back
 * an hour later, and the page cheerfully reports twelve minutes remaining on a
 * session that expired long ago. Recomputing from a deadline means every wake,
 * focus, reconnect, and navigation reaches the same answer without any of them
 * needing to know what the others did.
 *
 * This timer is deliberately not the active-learning timer. §9.4 — learning
 * time is earned only by bounded heartbeats on a visible learning page, and the
 * thirty minutes after a student's last action are never added to it. The two
 * measure different things and share no state: a student reading a settings
 * page stays signed in and earns nothing.
 *
 * See §9 of the teacher overview and student analytics redesign.
 */

import {
  STUDENT_INACTIVITY_LIMIT_MS,
  STUDENT_SESSION_SYNC_CADENCE_MS,
} from '@cove/shared';

/** §9.1 — the session ends this long after the last qualifying action. */
export const INACTIVITY_LIMIT_MS = STUDENT_INACTIVITY_LIMIT_MS;
/** The countdown appears with this much left, i.e. at 15 minutes inactive. */
export const INACTIVITY_WARNING_MS = 15 * 60_000;
/** The last five minutes carry danger emphasis. */
export const INACTIVITY_DANGER_MS = 5 * 60_000;
/** The last two minutes interrupt with a dialog. */
export const INACTIVITY_DIALOG_MS = 2 * 60_000;

/**
 * How often the visible countdown recomputes.
 *
 * One second, because the countdown prints seconds. It is not what decides
 * expiry — `remainingMs` does, from the deadline — so a throttled or suspended
 * interval delays the *display* and never the *decision*.
 */
export const INACTIVITY_TICK_MS = 1_000;

/** High-frequency input shares at most once per server heartbeat cadence. */
export function shouldSyncStudentSession(
  lastSharedAt: number | null,
  now: number,
): boolean {
  return (
    lastSharedAt === null ||
    now - lastSharedAt >= STUDENT_SESSION_SYNC_CADENCE_MS
  );
}

/**
 * The channel all of a student's tabs agree on.
 *
 * One name for the whole app: §9.2 requires every Cove student tab to share one
 * deadline, so a student typing in a second tab must keep the first one alive.
 */
export const INACTIVITY_CHANNEL = 'cove:session-inactivity';
/** The `BroadcastChannel` fallback, for browsers without one. */
export const INACTIVITY_STORAGE_KEY = 'cove:session-deadline';
/** Where to send the student back after they sign in again. */
export const INACTIVITY_RETURN_KEY = 'cove:session-return';

export type InactivityPhase =
  /** Nothing shown. */
  | 'idle'
  /** Header countdown, ordinary emphasis. */
  | 'warning'
  /** Header countdown, danger emphasis. */
  | 'urgent'
  /** Dialog, with Continue session and Sign out now. */
  | 'critical'
  /** The deadline has passed. */
  | 'expired';

/** A deadline this many milliseconds from now. */
export function nextDeadline(now: number): number {
  return now + INACTIVITY_LIMIT_MS;
}

/** Never negative: past the deadline there is no "minus four minutes" left. */
export function remainingMs(deadlineAt: number, now: number): number {
  return Math.max(0, deadlineAt - now);
}

/**
 * The four visible states, from the time left alone.
 *
 * Thresholds are `<=` so a countdown that lands exactly on 15:00 is already
 * showing. A boundary that had to be crossed rather than reached would leave
 * the warning one tick late, which on a suspended tab can be a long tick.
 */
export function inactivityPhase(remaining: number): InactivityPhase {
  if (remaining <= 0) return 'expired';
  if (remaining <= INACTIVITY_DIALOG_MS) return 'critical';
  if (remaining <= INACTIVITY_DANGER_MS) return 'urgent';
  if (remaining <= INACTIVITY_WARNING_MS) return 'warning';
  return 'idle';
}

/** `mm:ss`, zero-padded, for a countdown that must not change width. */
export function countdown(remaining: number): string {
  const total = Math.ceil(remaining / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * The one deadline several tabs agree on.
 *
 * The later wins, always. A student typing in one tab and idle in another has
 * not been idle — they have been working — and taking the earlier deadline
 * would sign them out mid-sentence because a background tab was quiet.
 */
export function laterDeadline(
  current: number | null,
  incoming: number | null,
): number | null {
  if (current === null) return incoming;
  if (incoming === null) return current;
  return Math.max(current, incoming);
}

/**
 * The thresholds worth announcing, in seconds remaining.
 *
 * §12 — an `aria-live` region that spoke every second would make the page
 * unusable with a screen reader, and the announcements a student needs are the
 * few that change what they should do.
 */
const announceAt = [15 * 60, 5 * 60, 60, 30] as const;

/**
 * Whether crossing into `remaining` passes an announcement threshold.
 *
 * Compares against the previous reading rather than against a flag, so a tab
 * that was suspended across two thresholds announces the one it landed past
 * instead of silently skipping both.
 */
export function shouldAnnounce(input: {
  previousMs: number | null;
  remainingMs: number;
}): boolean {
  if (input.previousMs === null) return false;
  const previous = Math.ceil(input.previousMs / 1000);
  const current = Math.ceil(input.remainingMs / 1000);
  return announceAt.some(
    (threshold) => previous > threshold && current <= threshold,
  );
}

/**
 * A return path that cannot become an open redirect.
 *
 * Same-origin, path-only, and query-free. §9.3 asks for a safe relative return
 * URL "without secrets or answer content", and a query string on a learning
 * page is exactly where a submission id or a review token would be — so the
 * whole search is dropped rather than filtered, because a filter has to be kept
 * correct as new parameters are added and dropping does not.
 */
export function safeReturnPath(path: string): string | null {
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  const [pathname] = path.split(/[?#]/);
  return pathname && pathname.length <= 512 ? pathname : null;
}

/**
 * The events that count as a student being present.
 *
 * §9.1 is deliberately broader than the learning-time rule: any deliberate
 * action anywhere in the student experience keeps the account signed in, even
 * on a page that earns no learning time. `scroll` is included because reading a
 * long lecture is using the app; `mousemove` is not, because a sleeping cat and
 * a trackpad drift both produce it.
 */
export const SESSION_ACTIVITY_EVENTS = [
  'pointerdown',
  'keydown',
  'scroll',
  'wheel',
  'touchstart',
] as const;
