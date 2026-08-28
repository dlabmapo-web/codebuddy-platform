'use client';

import type { TeacherReviewCase, TeacherSubmissionReview } from '@cove/shared';
import type { TFunction } from 'i18next';
import { formatDateTime } from '@cove/i18n/format';
import { Lock } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { registerPaircodeTheme } from '@/lib/monaco/theme';
import { cn } from '@/lib/utils';

import { durationDisplay } from '../../../../../progress/_lib/progress-view';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <span className="block h-full bg-editor-bg" />,
});

/**
 * One immutable attempt, in a workspace built for reading it.
 *
 * Read-only is structural rather than a flag: there is no draft, no session,
 * no submit path, and no mutation in this component's reach, so there is
 * nothing here that could be re-enabled by mistake. The editor takes a string.
 *
 * The header carries the frozen labels the attempt was submitted under, so a
 * course renamed last term still reads correctly, and Back returns to the
 * exact Solution status state that opened this — filters, page, and selection
 * included.
 *
 * Hidden cases contribute a count and nothing else. Their inputs and outputs
 * are absent from the payload, not hidden by the markup.
 */
export function SubmissionReview({
  review,
}: {
  review: TeacherSubmissionReview;
}) {
  const { t } = useTranslation('teach');
  const locale = useLocale();
  const samples = review.cases.filter((item) => item.isSample);

  return (
    <div className="flex flex-col gap-4">
      {/* The way back moved to the page's `back` slot, above the heading,
          where every other detail page keeps it. */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[12px] font-semibold text-sub">
          <Lock aria-hidden className="size-3.5" />
          {t('progress.review.read_only')}
        </span>
      </div>

      <header className="rounded-card border border-border bg-card px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[17px] font-extrabold leading-tight">
              {review.outlineNumber ? (
                <span className="mr-2 font-mono text-[13px] text-sub">
                  {review.outlineNumber}
                </span>
              ) : null}
              {review.problemTitle}
            </h1>
            <p className="mt-1 truncate text-[12.5px] text-sub">
              {[review.courseTitle, review.moduleTitle, review.lectureTitle].join(
                ' › ',
              )}
            </p>
            <p className="mt-1 text-[13px] font-semibold">
              {review.studentName}
            </p>
          </div>

          <span
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-[13px] font-bold',
              review.accepted
                ? 'bg-success/10 text-success'
                : 'bg-danger/10 text-danger',
            )}
            data-testid="review-verdict"
          >
            {review.accepted
              ? t('progress.result.accepted')
              : t('progress.result.not_accepted')}
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-3 sm:grid-cols-5">
          <Fact label={t('progress.review.score')} value={String(review.score)} />
          <Fact
            label={t('progress.review.tests')}
            value={`${review.passedCount}/${review.totalCount}`}
          />
          <Fact
            label={t('progress.review.runtime')}
            value={
              review.runtimeMs === null
                ? '—'
                : t('progress.review.runtime_value', { ms: review.runtimeMs })
            }
          />
          <Fact
            label={t('progress.review.solve_time')}
            value={durationText(review.solveElapsedSec, t)}
          />
          <Fact
            label={t('progress.review.submitted')}
            value={formatDateTime(review.createdAt, locale)}
          />
        </dl>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section
          aria-label={t('progress.review.editor_label')}
          className="overflow-hidden rounded-card border border-border"
        >
          <h2 className="border-b border-border bg-card px-4 py-2.5 text-[13px] font-bold">
            {t('progress.review.code_heading')}
          </h2>
          <div className="h-[26rem]">
            <MonacoEditor
              beforeMount={registerPaircodeTheme}
              height="100%"
              language="python"
              options={{
                automaticLayout: true,
                // Read-only and announced as such, but still focusable and
                // scrollable by keyboard: reading code is the whole task.
                domReadOnly: true,
                readOnly: true,
                ariaLabel: t('progress.review.editor_label'),
                fontFamily: "'Fira Code', Consolas, monospace",
                fontSize: 13,
                lineNumbers: 'on',
                minimap: { enabled: false },
                padding: { bottom: 12, top: 12 },
                scrollBeyondLastLine: false,
                tabSize: 4,
                wordWrap: 'on',
              }}
              theme="paircode-dark"
              value={review.code}
            />
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-card border border-border bg-card">
            <h2 className="border-b border-border px-4 py-2.5 text-[13px] font-bold">
              {t('progress.review.cases_heading')}
            </h2>
            {samples.length === 0 ? (
              <p className="px-4 py-5 text-[13px] text-sub">
                {t('progress.review.hidden_note')}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {samples.map((sample) => (
                  <SampleCase item={sample} key={sample.position} />
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-card border border-border bg-card px-4 py-3.5">
            <h2 className="text-[13px] font-bold">
              {t('progress.review.hidden_heading')}
            </h2>
            <p className="mt-1.5 text-[13.5px] font-semibold tabular-nums">
              {t('progress.review.hidden_summary', {
                passed: review.hiddenPassed,
                total: review.hiddenTotal,
              })}
            </p>
            <p className="mt-1 text-[12.5px] leading-[1.5] text-sub">
              {t('progress.review.hidden_note')}
            </p>
          </section>

          <section className="rounded-card border border-border bg-card px-4 py-3.5">
            <h2 className="text-[13px] font-bold">
              {t('progress.review.statement_heading')}
            </h2>
            {review.statement ? (
              <div
                className="tiptap-render mt-2 max-h-64 overflow-y-auto text-[13.5px] leading-[1.6]"
                // The authored statement, rendered the same way the student's
                // own workspace renders it.
                dangerouslySetInnerHTML={{ __html: review.statement }}
              />
            ) : (
              <p className="mt-1.5 text-[12.5px] text-sub">
                {t('progress.review.statement_missing')}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function SampleCase({ item }: { item: TeacherReviewCase }) {
  const { t } = useTranslation('teach');
  const passed = item.outcome === 'PASSED';

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12.5px] font-bold">
          {t('progress.review.case', { position: item.position })}
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11.5px] font-bold',
            passed ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
          )}
        >
          {t(`progress.review.outcome.${item.outcome}`)}
        </span>
      </div>
      <dl className="mt-2 space-y-1.5">
        <CaseLine label={t('progress.review.case_input')} value={item.input} />
        <CaseLine
          label={t('progress.review.case_expected')}
          value={item.expectedOutput}
        />
        <CaseLine
          label={t('progress.review.case_actual')}
          value={item.actualOutput}
        />
      </dl>
    </li>
  );
}

function CaseLine({ label, value }: { label: string; value: string | null }) {
  if (value === null) return null;
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-sub">
        {label}
      </dt>
      <dd className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-accent px-2 py-1 font-mono text-[12px]">
        {value}
      </dd>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-sub">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13.5px] font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function durationText(seconds: number | null, t: TFunction<'teach'>): string {
  const display = durationDisplay(seconds);
  switch (display.kind) {
    case 'hours':
      return t('progress.duration.hours', {
        hours: display.hours,
        minutes: display.minutes,
      });
    case 'minutes':
      return t('progress.duration.minutes', {
        minutes: display.minutes,
        seconds: display.seconds,
      });
    case 'seconds':
      return t('progress.duration.seconds', { seconds: display.seconds });
    default:
      return t('progress.duration.missing');
  }
}
