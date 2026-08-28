'use client';

import type { LearnClassSummary } from '@cove/shared';
import { School } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

import { ClassCard } from './class-card';

/**
 * The classes a student is in.
 *
 * An empty result is a fact about this student, not a failure: it says nobody
 * has put them in a class yet, and deliberately not that the academy has none.
 * A request that failed never reaches here — the page keeps that state apart,
 * because telling a student they have no classes when the service was down is
 * the one wrong answer this surface can give.
 */
export function ClassList({ classes }: { classes: LearnClassSummary[] }) {
  const { t } = useLayoutTranslation('learn');

  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-card border border-dashed border-border bg-card px-6 py-16 text-center">
        <School className="size-8 text-sub/40" />
        <h2 className="mt-3 text-[15px] font-bold">
          {t('classes.empty_title')}
        </h2>
        <p className="mt-1.5 max-w-md text-[13.5px] leading-6 text-sub">
          {t('classes.empty_body')}
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {classes.map((summary) => (
        <li key={summary.classId}>
          <ClassCard summary={summary} />
        </li>
      ))}
    </ul>
  );
}
