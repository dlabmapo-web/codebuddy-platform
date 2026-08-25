'use client';

import type { LearningClassContext } from '@cove/shared';
import { Users } from 'lucide-react';
import Link from 'next/link';

import { useLayoutTranslation } from '@/i18n';
import { TrackedExerciseLink } from '@/components/workspace/tracked-exercise-link';

/** A deliberate choice when two classes deliver the same course. */
export function LearningClassChoice({
  context,
  path,
}: {
  context: LearningClassContext;
  path: string;
}) {
  const { t } = useLayoutTranslation('learn');
  const ChoiceLink = path.includes('/learn/exercises/')
    ? TrackedExerciseLink
    : Link;
  return (
    <section className="mx-auto w-full max-w-xl rounded-card border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <Users className="size-5" />
        </span>
        <div>
          <h2 className="text-[16px] font-bold">{t('class_context.title')}</h2>
          <p className="mt-1 text-[13.5px] leading-6 text-sub">
            {t('class_context.description')}
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-2">
        {context.classes.map((item) => (
          <ChoiceLink
            className="rounded-lg border border-border px-4 py-3 text-[14px] font-semibold transition-colors hover:border-brand/40 hover:bg-brand-soft hover:text-brand"
            href={`${path}${path.includes('?') ? '&' : '?'}classId=${item.classId}`}
            key={item.classId}
            replace
          >
            {t('class_context.choose', { name: item.name })}
          </ChoiceLink>
        ))}
      </div>
    </section>
  );
}
