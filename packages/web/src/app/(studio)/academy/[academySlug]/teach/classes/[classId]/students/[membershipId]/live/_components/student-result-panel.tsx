'use client';

import { buildCaseCells } from '@cove/shared';
import { AlertTriangle, ExternalLink, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLayoutTranslation, useLocale } from '@/i18n';
import { routes } from '@/lib/routes';

import { ResultMetrics } from '@/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/result-metrics';
import { TestResultList } from '@/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/test-result-list';
import {
  hiddenResultCount,
  resultPresentation,
} from '@/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_lib/scoring';
import type { LiveSubmissionResult } from '../_hooks/use-live-submission-result';

/**
 * The student's latest verdict, as the student sees it.
 *
 * The score, the case counts, and the case list are the student's own result
 * components, fed the teacher's review, so "which case failed" is the same
 * row on both screens. The header is the teacher's: the student's hero speaks
 * to the student ("check your output"), and a teacher needs the verdict, the
 * problem, when it was submitted, and a way into the full review.
 */
export function StudentResultPanel({
  academySlug,
  classId,
  membershipId,
  submission,
}: {
  academySlug: string;
  classId: string;
  membershipId: string;
  submission: LiveSubmissionResult;
}) {
  const { t } = useTranslation('monitoring');
  const { t: tl } = useLayoutTranslation('learn');
  const locale = useLocale();
  const time = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }),
    [locale],
  );
  const { view, result, summary } = submission;

  if (view === 'empty') {
    return <Notice>{t('workspace.result.empty')}</Notice>;
  }
  if (view === 'grading') {
    return (
      <div className="flex items-start gap-2.5 px-4 py-4" data-testid="live-result-grading">
        <LoaderCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-[#60a5fa] motion-safe:animate-spin" />
        <div>
          <p className="text-[13px] font-bold text-[#dbe2ee]">{t('workspace.result.grading')}</p>
          <p className="mt-0.5 text-[12px] text-[#8c8c8c]">{t('workspace.result.grading_body')}</p>
        </div>
      </div>
    );
  }
  if (view === 'fault' || view === 'cancelled') {
    return (
      <div className="flex items-start gap-2.5 px-4 py-4">
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <p className="text-[12.5px] leading-5 text-[#dbe2ee]">
          {t(view === 'fault' ? 'workspace.result.fault' : 'workspace.result.cancelled')}
        </p>
      </div>
    );
  }

  const presentation = resultPresentation(result, false);
  const cells = result
    ? buildCaseCells({ totalCount: result.totalCount, reported: result.cases })
    : [];
  const hidden = hiddenResultCount(result);

  return (
    <div className="space-y-4 px-4 py-4 sm:px-5" data-testid="live-result">
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p
            className={`text-[13px] font-extrabold ${
              result ? verdictTone[presentation] : 'text-[#dbe2ee]'
            }`}
            data-testid="live-result-verdict"
          >
            {result
              ? tl(`submit.presentation.${presentation}.eyebrow`)
              : t('workspace.result_title')}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-[#8c8c8c]">
            {[
              submission.problemTitle,
              submission.createdAt
                ? t('workspace.result.submitted_at', {
                    time: time.format(new Date(submission.createdAt)),
                  })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {submission.submissionId ? (
          <Link
            className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-[#60a5fa] hover:underline"
            href={routes.academyTeachSubmission(
              academySlug,
              classId,
              membershipId,
              submission.submissionId,
            )}
            rel="noopener"
            target="_blank"
          >
            {t('workspace.result.open_review')}
            <ExternalLink aria-hidden className="size-3" />
          </Link>
        ) : null}
      </header>

      {result ? (
        <ResultMetrics cells={cells} presentation={presentation} result={result} />
      ) : summary ? (
        // The socket's numbers, while the case list is still being read.
        <p className="font-mono text-[12px] text-[#8c8c8c]">
          {t('workspace.result_score', { score: summary.score })} ·{' '}
          {t('workspace.result_cases', {
            passed: summary.passedCount,
            total: summary.totalCount,
          })}
        </p>
      ) : null}

      {view === 'loading' ? (
        <p className="flex items-center gap-2 text-[12px] text-[#8c8c8c]">
          <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" />
          {t('workspace.result.loading')}
        </p>
      ) : null}

      {view === 'error' ? (
        <p className="flex flex-wrap items-center gap-2 rounded-md bg-danger/10 px-3 py-2 text-[12.5px] text-[#fb7185]">
          {t('workspace.result.load_failed')}
          <button
            className="font-bold underline underline-offset-2"
            onClick={submission.retry}
            type="button"
          >
            {t('workspace.result.retry')}
          </button>
        </p>
      ) : null}

      {result ? <TestResultList cells={cells} result={result} /> : null}

      {hidden > 0 ? (
        <p className="text-[11.5px] text-[#8c8c8c]">{t('workspace.result.hidden_note')}</p>
      ) : null}
    </div>
  );
}

const verdictTone = {
  grading: 'text-[#60a5fa]',
  accepted: 'text-success',
  wrong_output: 'text-[#fb7185]',
  runtime_error: 'text-[#fb7185]',
  time_limit: 'text-warning',
  memory_limit: 'text-warning',
  not_accepted: 'text-[#fb7185]',
  judge_error: 'text-warning',
  transport_error: 'text-[#fb7185]',
} as const;

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-3 text-[12.5px] text-[#8c8c8c]">{children}</p>;
}
