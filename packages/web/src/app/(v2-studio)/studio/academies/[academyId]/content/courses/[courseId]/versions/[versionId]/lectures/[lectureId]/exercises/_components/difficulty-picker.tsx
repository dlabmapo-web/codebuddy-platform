import type { ExerciseDifficulty } from '@cove/shared';

import { useLayoutTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

const order: ExerciseDifficulty[] = ['EASY', 'MEDIUM', 'HARD'];

/** Green climbs to red as the problem gets harder — read at a glance. */
const dotClass: Record<ExerciseDifficulty, string> = {
  EASY: 'bg-success',
  MEDIUM: 'bg-warning',
  HARD: 'bg-danger',
};

/**
 * Three fixed, mutually exclusive levels stay visible as a segmented control
 * rather than hiding in a dropdown, and the dot colour carries the meaning.
 */
export function DifficultyPicker({
  value,
  onChange,
  disabled,
}: {
  value: ExerciseDifficulty;
  onChange: (value: ExerciseDifficulty) => void;
  disabled?: boolean;
}) {
  const { t } = useLayoutTranslation('content');

  return (
    <div
      className="inline-flex rounded-lg border border-border bg-canvas p-1"
      role="radiogroup"
    >
      {order.map((difficulty) => {
        const active = difficulty === value;
        return (
          <button
            aria-checked={active}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-60',
              active
                ? 'bg-white text-ink shadow-sm'
                : 'text-sub hover:text-ink',
            )}
            disabled={disabled}
            key={difficulty}
            onClick={() => onChange(difficulty)}
            role="radio"
            type="button"
          >
            <span
              className={cn(
                'size-2 rounded-full transition-opacity',
                dotClass[difficulty],
                active ? 'opacity-100' : 'opacity-40',
              )}
            />
            {t(`exercise.difficulty.${difficulty}`)}
          </button>
        );
      })}
    </div>
  );
}
