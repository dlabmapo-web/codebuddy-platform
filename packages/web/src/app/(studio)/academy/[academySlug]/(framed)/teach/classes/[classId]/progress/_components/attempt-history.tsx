'use client';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import { formatDateTime } from '@cove/i18n/format';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';

import { useAttemptsQuery } from '../_hooks/use-teacher-progress';
import { reviewPath } from '../_lib/progress-url';
import {
  DataGrid,
  Duration,
  Pager,
  RegionError,
  RegionLoading,
  Td,
  Th,
} from './progress-primitives';

/**
 * One student's attempts at one problem.
 *
 * The single attempt-history component. By student and By problem both mount
 * it with the same three ids, so the two lenses cannot grow different ideas of
 * what a student did — which is exactly what §9.3 asks for.
 *
 * Every row carries an explicit Review link. Nothing here opens on a whole-row
 * click: a table a teacher is reading should not navigate because they
 * selected a timestamp.
 */
export function AttemptHistory({
  academyId,
  classId,
  materialId,
  membershipId,
  onPageChange,
  page,
  returnTo,
}: {
  academyId: string;
  classId: string;
  materialId: string;
  membershipId: string;
  onPageChange: (page: number) => void;
  page: number;
  returnTo: string;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('teach');
  const locale = useLocale();
  const attempts = useAttemptsQuery(
    { academyId, classId },
    { membershipId, materialId, page },
  );

  if (attempts.isError && !attempts.data) {
    return (
      <div className="p-4">
        <RegionError
          body={t('progress.error.body')}
          onRetry={() => void attempts.refetch()}
          title={t('progress.error.title')}
        />
      </div>
    );
  }
  if (!attempts.data) return <RegionLoading rows={2} />;

  if (attempts.data.attempts.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-[13px] text-sub">
        {t('progress.attempts.empty')}
      </p>
    );
  }

  return (
    <>
      <DataGrid
        head={
          <>
            <Th>{t('progress.attempts.column_result')}</Th>
            <Th numeric>{t('progress.attempts.column_score')}</Th>
            <Th numeric>{t('progress.attempts.column_tests')}</Th>
            <Th numeric>{t('progress.attempts.column_solve_time')}</Th>
            <Th>{t('progress.attempts.column_submitted')}</Th>
            <Th className="text-right">
              <span className="sr-only">{t('progress.attempts.review')}</span>
            </Th>
          </>
        }
      >
        {attempts.data.attempts.map((attempt) => (
          <tr
            className="border-b border-border/60 last:border-0"
            key={attempt.submissionId}
          >
            <Td>
              <span
                className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ${
                  attempt.accepted
                    ? 'bg-success/10 text-success'
                    : 'bg-danger/10 text-danger'
                }`}
              >
                {attempt.accepted
                  ? t('progress.result.accepted')
                  : t('progress.result.not_accepted')}
              </span>
            </Td>
            <Td numeric>{attempt.score}</Td>
            <Td numeric>
              {t('progress.attempts.tests_value', {
                passed: attempt.passedCount,
                total: attempt.totalCount,
              })}
            </Td>
            <Td numeric>
              <Duration seconds={attempt.solveElapsedSec} />
            </Td>
            <Td>
              <time className="whitespace-nowrap text-sub" dateTime={attempt.createdAt}>
                {formatDateTime(attempt.createdAt, locale)}
              </time>
            </Td>
            <Td className="text-right">
              <Link
                className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1 text-[13px] font-bold text-brand underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/40"
                href={reviewPath({
                  academySlug,
                  classId,
                  membershipId,
                  submissionId: attempt.submissionId,
                  returnTo,
                })}
              >
                {t('progress.attempts.review')}
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </Td>
          </tr>
        ))}
      </DataGrid>
      <Pager
        onPageChange={onPageChange}
        page={attempts.data.pagination.page}
        pageCount={attempts.data.pagination.pageCount}
      />
    </>
  );
}
