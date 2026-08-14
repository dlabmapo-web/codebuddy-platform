'use client';

import { AlertTriangle, Clock } from 'lucide-react';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { logoutAction } from '@/app/(v2-auth)/auth/actions';
import { toApiError } from '@/lib/api-errors';
import { orpc } from '@/lib/orpc';
import { cn } from '@/lib/utils';

import { flushDrafts } from './draft-flush';
import {
  INACTIVITY_CHANNEL,
  INACTIVITY_RETURN_KEY,
  INACTIVITY_STORAGE_KEY,
  INACTIVITY_TICK_MS,
  SESSION_ACTIVITY_EVENTS,
  countdown,
  inactivityPhase,
  laterDeadline,
  nextDeadline,
  remainingMs,
  safeReturnPath,
  shouldAnnounce,
  shouldSyncStudentSession,
  type InactivityPhase,
} from './inactivity';

/**
 * The student's inactivity countdown, and the sign-out at the end of it.
 *
 * Mounted once for the whole student experience rather than per page, because
 * the thing being measured is the student, not the route: navigating between
 * two courses is activity, and a timer that remounted on it would reset itself
 * for the wrong reason and never fire.
 *
 * Three properties hold, and each one is a bug that would only appear in a real
 * classroom:
 *
 * The deadline is absolute. Everything visible is recomputed from it against
 * `Date.now()`, so a closed lid, a throttled background tab, or a phone waking
 * from sleep all arrive at the correct answer without the timer having run.
 *
 * The deadline is shared. Every tab broadcasts its own resets and adopts the
 * latest one it hears, so a student typing in one tab keeps the other alive —
 * §9.2. `BroadcastChannel` where it exists, a storage event where it does not.
 *
 * The client is not the authority. This is the interface for a rule the server
 * enforces; a student who freezes the timer in a debugger gets a page that
 * stops counting and a next request that is still refused.
 *
 * See §9 of the teacher overview and student analytics redesign.
 */
export function InactivityGuard() {
  const { t } = useTranslation('session');
  const pathname = usePathname();

  /**
   * The deadline is a ref, not state, and that is deliberate.
   *
   * It is shared external state — several tabs, a storage key, and a broadcast
   * channel all write it — and every source that changes it is an event rather
   * than a render. Holding it in React state would mean a `setState` on mount,
   * on every navigation, on every keystroke, and on every message from another
   * tab, to produce a value the once-a-second tick re-reads anyway. The tick is
   * what makes it visible; this is what makes it true.
   */
  const deadlineRef = React.useRef<number | null>(null);
  /**
   * What the last tick observed: the instant it read, and the deadline in force
   * at that instant. One state update from one callback, so the countdown and
   * the phase derived from it can never describe two different moments.
   */
  const [observed, setObserved] = React.useState<{
    now: number;
    deadline: number | null;
  }>({ now: 0, deadline: null });
  const [signingOut, setSigningOut] = React.useState(false);
  const [draftsSaved, setDraftsSaved] = React.useState<boolean | null>(null);
  const [announcement, setAnnouncement] = React.useState('');

  const channelRef = React.useRef<BroadcastChannel | null>(null);
  const lastSharedAtRef = React.useRef<number | null>(null);
  const previousRemaining = React.useRef<number | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const signOutRef = React.useRef<() => void>(() => {});
  const serverSyncRef = React.useRef<(mode: 'current' | 'extend') => void>(
    () => {},
  );
  const serverSyncInFlightRef = React.useRef(false);
  // A ref rather than the state below, because the guard against a second
  // sign-out has to hold within one tick and state would not have updated yet.
  const signingOutRef = React.useRef(false);

  const signOut = React.useCallback(async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setSigningOut(true);
    const saved = await flushDrafts();
    setDraftsSaved(saved);
    const path = safeReturnPath(window.location.pathname);
    if (path) {
      try {
        window.sessionStorage.setItem(INACTIVITY_RETURN_KEY, path);
      } catch {
        // A student who cannot store a return path still gets signed out.
      }
    }
    formRef.current?.requestSubmit();
  }, []);

  // Installed before the first navigation effect can contact the server.
  React.useEffect(() => {
    signOutRef.current = signOut;
  }, [signOut]);

  /* --------------------------------------------------------- the deadline */

  const adopt = React.useCallback((incoming: number) => {
    deadlineRef.current =
      laterDeadline(deadlineRef.current, incoming) ?? incoming;
  }, []);

  const syncServer = React.useCallback(async (mode: 'current' | 'extend') => {
    if (serverSyncInFlightRef.current) return;
    serverSyncInFlightRef.current = true;
    try {
      const result = await (mode === 'extend'
        ? orpc.studentSession.extend({})
        : orpc.studentSession.current({}));
      const deadline = Date.parse(result.deadline);
      if (!Number.isFinite(deadline)) throw new Error('Invalid session deadline');
      // The server is authoritative, including when its clock makes the
      // deadline earlier than this tab's optimistic local value.
      deadlineRef.current = deadline;
      setObserved({ now: Date.now(), deadline });
    } catch (error) {
      const code = toApiError(error).code;
      if (
        code === 'STUDENT_SESSION_EXPIRED' ||
        code === 'STUDENT_SESSION_UNAVAILABLE' ||
        code === 'AUTHENTICATION_REQUIRED' ||
        code === 'TOKEN_INVALID'
      ) {
        void signOutRef.current();
      }
    } finally {
      serverSyncInFlightRef.current = false;
    }
  }, []);

  React.useEffect(() => {
    serverSyncRef.current = (mode) => void syncServer(mode);
  }, [syncServer]);

  /** Sets a fresh deadline, tells the other tabs, and returns what it set. */
  const reset = React.useCallback(
    ({ force = false, share = true }: { force?: boolean; share?: boolean } = {}) => {
      const now = Date.now();
      const next = nextDeadline(now);
      adopt(next);
      if (!share) return next;
      if (!force && !shouldSyncStudentSession(lastSharedAtRef.current, now)) {
        return next;
      }
      lastSharedAtRef.current = now;
      channelRef.current?.postMessage(next);
      try {
        // The fallback for browsers without BroadcastChannel. A write is what
        // fires `storage` in the *other* tabs; this tab never hears its own.
        window.localStorage.setItem(INACTIVITY_STORAGE_KEY, String(next));
      } catch {
        // Private browsing denies storage. Cross-tab sharing degrades; the
        // deadline in this tab is unaffected, which is the half that matters.
      }
      serverSyncRef.current('extend');
      return next;
    },
    [adopt],
  );

  /**
   * A reset the reader sees at once rather than on the next tick.
   *
   * `Continue session` has to make the banner disappear immediately — waiting
   * up to a second after a deliberate click reads as a control that did not
   * work. The deadline observed here is the one `reset` just set, not a second
   * reading of the clock, so the two cannot differ by the time between them.
   */
  const resetNow = React.useCallback(() => {
    const next = reset({ force: true });
    previousRemaining.current = null;
    setAnnouncement('');
    setObserved({ now: Date.now(), deadline: next });
  }, [reset]);

  React.useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(INACTIVITY_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event) => {
      const incoming = Number(event.data);
      if (!Number.isFinite(incoming)) return;
      // Adopted only if it is later. A tab that has been idle longer must not
      // be able to shorten a working tab's session.
      adopt(incoming);
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [adopt]);

  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== INACTIVITY_STORAGE_KEY || !event.newValue) return;
      const incoming = Number(event.newValue);
      if (Number.isFinite(incoming)) adopt(incoming);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [adopt]);

  /* ----------------------------------------------------------- activity */

  React.useEffect(() => {
    const onActivity = () => reset();
    for (const type of SESSION_ACTIVITY_EVENTS) {
      // Passive and captured: the handler never calls `preventDefault`, and
      // capture means a component that stops propagation cannot make a student
      // invisible to the timer while they are plainly working in it.
      window.addEventListener(type, onActivity, { capture: true, passive: true });
    }
    return () => {
      for (const type of SESSION_ACTIVITY_EVENTS) {
        window.removeEventListener(type, onActivity, { capture: true });
      }
    };
  }, [reset]);

  /**
   * Navigation is activity.
   *
   * A student moving between lectures is using the app even if the click that
   * did it landed on a link they never scrolled to. Writing the ref rather than
   * state is what keeps a route change from costing a render.
   */
  React.useEffect(() => {
    // `pathname` is the dependency; the call is a write to external state.
    void pathname;
    reset({ force: true });
  }, [pathname, reset]);

  /**
   * Video playback keeps the session alive; a paused video does not.
   *
   * §9.1 names this explicitly, and it is the case a pointer-and-key timer gets
   * wrong: a student watching a ten-minute lesson touches nothing and is
   * plainly present. `timeupdate` fires several times a second while playing
   * and stops on pause, which is exactly the signal wanted — and it is
   * delegated at the document rather than bound per element, so a video mounted
   * later is covered without this component knowing about it.
   */
  React.useEffect(() => {
    const onPlaying = (event: Event) => {
      const media = event.target;
      if (
        media instanceof HTMLMediaElement &&
        !media.paused &&
        !media.ended
      ) {
        reset();
      }
    };
    document.addEventListener('timeupdate', onPlaying, { capture: true });
    return () =>
      document.removeEventListener('timeupdate', onPlaying, { capture: true });
  }, [reset]);

  /* ------------------------------------------------------------- the tick */

  /**
   * The tick: one place that reads the clock, decides what is visible, and
   * announces a threshold if one was just crossed.
   *
   * All three together, in a callback rather than in an effect body, because
   * they are one observation of the same instant — computing the countdown in
   * one place and the announcement in another would let them disagree about
   * which second it is.
   */
  const tick = React.useCallback(() => {
    const current = Date.now();
    const deadline = deadlineRef.current;
    setObserved({ now: current, deadline });
    if (deadline === null) return;

    const left = remainingMs(deadline, current);
    if (
      shouldAnnounce({ previousMs: previousRemaining.current, remainingMs: left })
    ) {
      setAnnouncement(t('inactivity.announce', { time: countdown(left) }));
    }
    previousRemaining.current = left;
    // The expiry decision lives here rather than in an effect watching the
    // phase, so waking a suspended tab and deciding to sign out are the same
    // observation of the clock instead of two.
    if (left <= 0) void signOutRef.current();
  }, [t]);

  React.useEffect(() => {
    const timer = window.setInterval(tick, INACTIVITY_TICK_MS);
    // Recomputed on every way back into the page, so a suspended interval
    // delays the display and never the decision.
    const reconcile = () => {
      tick();
      if (!document.hidden) serverSyncRef.current('current');
    };
    window.addEventListener('focus', reconcile);
    window.addEventListener('online', reconcile);
    document.addEventListener('visibilitychange', reconcile);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', reconcile);
      window.removeEventListener('online', reconcile);
      document.removeEventListener('visibilitychange', reconcile);
    };
  }, [tick]);

  const remaining =
    observed.deadline === null
      ? null
      : remainingMs(observed.deadline, observed.now);
  // Nothing is shown until the first tick has observed a deadline. The window
  // is one second on mount, during which there is by definition nothing to warn
  // about — the session has just started.
  const phase: InactivityPhase =
    remaining === null ? 'idle' : inactivityPhase(remaining);

  /* -------------------------------------------------------------- render */

  if (remaining === null || phase === 'idle') {
    return <SignOutForm ref={formRef} />;
  }

  return (
    <>
      <SignOutForm ref={formRef} />

      {/* Threshold announcements only. Speaking every second would make the
          page unusable with a screen reader. */}
      <p aria-live="assertive" className="sr-only" role="status">
        {announcement}
      </p>

      <div
        className={cn(
          'fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 text-[13px] font-semibold',
          phase === 'warning'
            ? 'bg-warning/15 text-warning'
            : 'bg-danger/15 text-danger',
        )}
      >
        {phase === 'warning' ? (
          <Clock aria-hidden className="size-4 shrink-0" />
        ) : (
          <AlertTriangle aria-hidden className="size-4 shrink-0" />
        )}
        <span>
          {t('inactivity.banner')}{' '}
          <span className="font-mono tabular-nums">{countdown(remaining)}</span>
        </span>
        <button
          className={cn(
            'rounded-md px-2.5 py-1 font-bold underline-offset-2 transition-colors hover:underline',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            phase === 'warning' ? 'bg-warning/15' : 'bg-danger/15',
          )}
          onClick={resetNow}
          type="button"
        >
          {t('inactivity.continue')}
        </button>
      </div>

      {phase === 'critical' || phase === 'expired' ? (
        <ExpiryDialog
          draftsSaved={draftsSaved}
          onContinue={resetNow}
          onSignOut={() => void signOut()}
          remaining={remaining}
          signingOut={signingOut}
        />
      ) : null}
    </>
  );
}

/**
 * The final two minutes, as something a student cannot scroll past.
 *
 * A dialog rather than a louder banner because this is the point at which
 * ignoring it costs them the session. It is deliberately not `<dialog>`'s modal
 * mode: the student may still be mid-keystroke in the editor behind it, and
 * trapping focus would take the keyboard away from the work the dialog exists
 * to protect. `Continue session` is autofocused, so one key press dismisses it.
 */
function ExpiryDialog({
  draftsSaved,
  onContinue,
  onSignOut,
  remaining,
  signingOut,
}: {
  draftsSaved: boolean | null;
  onContinue: () => void;
  onSignOut: () => void;
  remaining: number;
  signingOut: boolean;
}) {
  const { t } = useTranslation('session');

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
      <div
        aria-describedby="inactivity-dialog-body"
        aria-labelledby="inactivity-dialog-title"
        aria-modal="false"
        className="w-full max-w-sm rounded-card border border-border bg-card p-5 shadow-[var(--shadow-modal)]"
        role="alertdialog"
      >
        <h2 className="text-[15px] font-bold text-ink" id="inactivity-dialog-title">
          {t('inactivity.dialog_title')}
        </h2>
        <p
          className="mt-2 text-[13px] leading-[1.6] text-sub"
          id="inactivity-dialog-body"
        >
          {t('inactivity.dialog_body')}
        </p>
        <p className="mt-3 text-center font-mono text-[30px] font-extrabold tabular-nums text-danger">
          {countdown(remaining)}
        </p>

        {draftsSaved === false ? (
          <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-[12.5px] leading-[1.5] text-warning">
            {t('inactivity.draft_unconfirmed')}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            autoFocus
            className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-brand px-4 text-[13.5px] font-bold text-on-brand transition-opacity hover:opacity-90 disabled:opacity-50"
            disabled={signingOut}
            onClick={onContinue}
            type="button"
          >
            {t('inactivity.continue')}
          </button>
          <button
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-[13.5px] font-bold text-sub transition-colors hover:border-danger hover:text-danger disabled:opacity-50"
            disabled={signingOut}
            onClick={onSignOut}
            type="button"
          >
            {t('inactivity.sign_out_now')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The sign-out itself, as the ordinary server action.
 *
 * Reusing `logoutAction` rather than clearing a cookie here means the automatic
 * sign-out and the one in the sidebar end a session by exactly the same path,
 * so there is no second way to be signed out that could behave differently.
 */
const SignOutForm = React.forwardRef<HTMLFormElement>(function SignOutForm(
  _props,
  ref,
) {
  return (
    <form
      action={logoutAction}
      className="hidden"
      data-testid="inactivity-guard"
      ref={ref}
    />
  );
});
