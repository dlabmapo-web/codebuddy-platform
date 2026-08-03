'use client';

import { Clock3 } from 'lucide-react';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';

import { formatExerciseDuration } from '../_lib/exercise-timer';

/**
 * A quiet workspace clock for the student. It is display-only; grading never
 * trusts this browser value and computes submission elapsed time on the server.
 */
export function ExerciseTimer() {
  const { t } = useLayoutTranslation('learn');
  const [startedAt] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(startedAt);

  React.useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span
      aria-label={t('workspace.elapsed_time')}
      className="hidden items-center gap-1 font-mono text-[12px] text-sub sm:inline-flex"
      title={t('workspace.elapsed_time')}
    >
      <Clock3 className="size-3.5" />
      {formatExerciseDuration((now - startedAt) / 1_000)}
    </span>
  );
}
