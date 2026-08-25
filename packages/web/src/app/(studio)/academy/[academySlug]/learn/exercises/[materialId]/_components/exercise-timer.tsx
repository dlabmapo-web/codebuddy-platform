'use client';

import { Clock3 } from 'lucide-react';
import { SOLVE_SESSION_MAX_SECONDS } from '@cove/shared';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';

import { formatExerciseDuration } from '../_lib/exercise-timer';

/**
 * The workspace clock, counting from the server-issued solve session.
 *
 * It reads the same origin the submission's stored solve time is computed
 * from, so what a student watches while working and what their answer records
 * report are one measurement rather than two that happen to agree. Nothing is
 * trusted from here: the browser names a session, never a duration.
 *
 * Renders nothing until a session exists — a clock counting from an unknown
 * origin is worse than no clock.
 */
export function ExerciseTimer({ startedAt }: { startedAt: string | null }) {
  const { t } = useLayoutTranslation('learn');
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!startedAt) return;
    // No synchronous seed: `now` is at most one tick stale, and the elapsed
    // value is a difference from the server origin either way.
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!startedAt) return null;

  // Stops at 23:59:59 rather than reporting an implausible duration: the
  // session expires at the same bound, and the next submit opens a fresh one.
  const elapsed = Math.min(
    SOLVE_SESSION_MAX_SECONDS - 1,
    Math.max(0, (now - Date.parse(startedAt)) / 1_000),
  );

  return (
    <span
      aria-label={t('workspace.elapsed_time')}
      className="hidden items-center gap-1 font-mono text-[12px] text-sub sm:inline-flex"
      title={t('workspace.elapsed_time')}
    >
      <Clock3 className="size-3.5" />
      {formatExerciseDuration(elapsed)}
    </span>
  );
}
