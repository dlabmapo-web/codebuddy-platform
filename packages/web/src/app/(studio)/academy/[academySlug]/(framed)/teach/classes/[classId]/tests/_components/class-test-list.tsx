'use client';

import type { ExamClassTestRow } from '@cove/shared';
import { BadgeCheck, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { formatDuration, formatPeriod } from '@/components/exam/exam-format';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { routes } from '@/lib/routes';

const statusTone = { BEFORE: 'bg-surface text-sub', OPEN: 'bg-success/15 text-success', AFTER: 'bg-border text-sub' } as const;

export function ClassTestList({ classId, tests }: { classId: string; tests: ExamClassTestRow[] }) {
  const { t } = useTranslation('exam');
  const slug = useAcademySlug();
  if (!tests.length) return <p className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center text-[14px] text-sub">{t('results.empty')}</p>;
  return (
    <ul className="space-y-3">
      {tests.map((test) => (
        <li key={test.lectureId}>
          <Link href={routes.academyTeachClassTest(slug, classId, test.lectureId)}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 transition-colors hover:border-brand/40">
            <BadgeCheck aria-hidden className="size-6 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[15px] font-bold text-ink">{test.title}</span>
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${statusTone[test.periodState]}`}>{t(`results.status.${test.periodState}`)}</span>
              </div>
              <div className="mt-1 text-[12.5px] text-sub">
                {t('results.list_meta', { course: test.courseTitle, count: test.itemCount, limit: formatDuration(t, test.timeLimitMinutes) })}
                {' · '}{formatPeriod(t, test.schedule)}
              </div>
            </div>
            <div className="hidden shrink-0 text-right text-[12.5px] font-semibold text-sub sm:block">
              <div>{t('results.taken', { count: test.taken })}</div>
              {test.inProgress ? <div className="text-brand">{t('results.in_progress_count', { count: test.inProgress })}</div> : null}
            </div>
            <ChevronRight aria-hidden className="size-4 shrink-0 text-sub" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
