import { Check, Circle } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

import type { ExerciseAuthoring } from '../_hooks/use-exercise-authoring';

export function ExerciseReadiness({
  completeness,
  completeCount,
}: Pick<ExerciseAuthoring, 'completeness' | 'completeCount'>) {
  const { t } = useLayoutTranslation('content');

  return (
    <aside className="order-first rounded-card border border-border bg-white p-4 lg:order-none lg:sticky lg:top-[13rem]">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-sub">
          {t('exercise.completeness')}
        </h2>
        <span className="font-mono text-[13px] font-bold text-brand">
          {completeCount}/{completeness.length}
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {completeness.map((item) => (
          <li
            className="flex items-center gap-2 text-[13px] font-semibold"
            key={item.id}
          >
            {item.complete ? (
              <Check className="size-4 text-success" />
            ) : (
              <Circle className="size-4 text-sub" />
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
