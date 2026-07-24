import { Check, Circle } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

import type { ExerciseAuthoring } from '../_hooks/use-exercise-authoring';

export function ExerciseReadiness({
  completeness,
  completeCount,
}: Pick<ExerciseAuthoring, 'completeness' | 'completeCount'>) {
  const { t } = useLayoutTranslation('content');
  const total = completeness.length;
  const ready = completeCount === total;
  const percent = Math.round((completeCount / total) * 100);

  return (
    <aside className="order-first rounded-card border border-border bg-white p-4 lg:order-none lg:sticky lg:top-[13rem]">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-sub">
          {ready ? t('exercise.ready') : t('exercise.completeness')}
        </h2>
        <span
          className={cn(
            'font-mono text-[13px] font-bold',
            ready ? 'text-success' : 'text-brand',
          )}
        >
          {completeCount}/{total}
        </span>
      </div>

      {/* A slim meter turns the count into an at-a-glance sense of progress. */}
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-canvas">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            ready ? 'bg-success' : 'bg-brand',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      <ul className="mt-4 space-y-2">
        {completeness.map((item) => (
          <li
            className={cn(
              'flex items-center gap-2 text-[13px] font-semibold',
              item.complete ? 'text-ink' : 'text-sub',
            )}
            key={item.id}
          >
            {item.complete ? (
              <Check className="size-4 shrink-0 text-success" />
            ) : (
              <Circle className="size-4 shrink-0 text-sub/50" />
            )}
            {t(`exercise.required.${item.id}`)}
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-border pt-3 text-[12.5px] leading-5 text-sub">
        {t('exercise.completeness_hint')}
      </p>
    </aside>
  );
}
