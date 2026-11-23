'use client';

import { formatPoints, type ExamStudentTest } from '@cove/shared';
import { ArrowLeft, BadgeCheck, CircleCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { ExamInfoTiles, ExamRules } from '@/components/exam/exam-info';
import { formatExamDate } from '@/components/exam/exam-format';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

/**
 * The test card (Elice provided/07). Before an attempt it offers 응시하기;
 * during one, 이어서 응시하기; after, the green "테스트 응시 완료" box with
 * 성적 비공개 or the released score.
 */
export function TestCard({ academyId, initial }: { academyId: string; initial: ExamStudentTest }) {
  const { t } = useTranslation('exam');
  const slug = useAcademySlug();
  const router = useRouter();
  const errorText = useErrorText();
  const [starting, setStarting] = React.useState(false);
  const [consent, setConsent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const test = initial;
  const latest = test.latestAttempt;
  const ended = Boolean(latest && !latest.open);
  const classQuery = { classId: test.classId };
  // As of the server's answer; the server refuses a late start either way.
  const entryClosed = test.periodState === 'OPEN' && Boolean(test.schedule.entryClosesAt
    && new Date(test.serverNow).getTime() >= new Date(test.schedule.entryClosesAt).getTime());

  // Without the preparation steps, consent is one checkbox on this card.
  const startDirectly = async () => {
    setStarting(true);
    setError(null);
    try {
      const { attemptId } = await orpc.exam.start({ academyId, classId: test.classId, lectureId: test.lectureId, consent: true, clockDriftMs: null });
      router.replace(routes.academyLearnTestAttempt(slug, test.lectureId, attemptId));
    } catch (caught) {
      setError(errorText(caught));
      setStarting(false);
    }
  };
  const begin = () => {
    if (test.settings.usePreparation) router.push(routes.academyLearnTestPrepare(slug, test.lectureId, classQuery));
    else void startDirectly();
  };

  return (
    <main className="min-h-screen bg-canvas px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-[880px]">
        <Link
          href={routes.academyLearnCourse(slug, test.courseId, classQuery)}
          className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand"
        >
          <ArrowLeft aria-hidden className="size-4" /> {t('back')}
        </Link>
        <section className="mt-5 rounded-2xl border border-border bg-card p-6 sm:p-8">
          <h1 className="flex items-center gap-2.5 text-[22px] font-bold text-ink">
            <BadgeCheck aria-hidden className="size-7 shrink-0 text-brand" />
            <span className="min-w-0 break-words">{test.title}</span>
          </h1>
          {test.settings.summary ? <p className="mt-2 text-[14px] text-sub">{test.settings.summary}</p> : null}

          {ended && latest ? (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 px-5 py-4">
              <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-success" />
              <div className="text-[13px] font-semibold text-success">
                <div>{t('card.done_title')}</div>
                <div className="mt-1 font-medium">{t('card.done_at', { date: formatExamDate(latest.endedAt ?? latest.startedAt) })}</div>
                <div className="mt-2">
                  {!test.resultsVisible
                    ? t('card.results_hidden')
                    : test.score && test.score.pending > 0
                      ? t('card.results_pending')
                      : test.score
                        ? t('card.results_score', { earned: formatPoints(test.score.earnedHundredths), possible: formatPoints(test.score.possibleHundredths) })
                        : null}
                </div>
              </div>
            </div>
          ) : null}

          {latest?.open ? (
            <div className="mt-6 rounded-xl border border-brand/40 bg-brand-soft px-5 py-4 text-[13px] font-semibold text-brand">
              {t('card.in_progress')}
            </div>
          ) : null}

          <div className="mt-6">
            <ExamInfoTiles schedule={test.schedule} timeLimitMinutes={test.settings.timeLimitMinutes} itemCount={test.itemCount} icons />
          </div>
          {test.schedule.entryClosesAt || test.schedule.exitOpensAt ? (
            <ul className="mt-3 space-y-1 text-[13px] text-sub">
              {test.schedule.entryClosesAt ? <li>{t('card.entry_until', { date: formatExamDate(test.schedule.entryClosesAt) })}</li> : null}
              {test.schedule.exitOpensAt ? <li>{t('card.exit_from', { date: formatExamDate(test.schedule.exitOpensAt) })}</li> : null}
            </ul>
          ) : null}
          <div className="mt-4">
            <ExamRules guide={test.settings.guide} compact />
          </div>

          {!test.settings.usePreparation && (test.canStart || test.canRetake) ? (
            <label className="mt-5 flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              {t('prepare.consent')}
            </label>
          ) : null}

          {error ? <p role="alert" className="mt-4 text-[13px] font-semibold text-danger">{error}</p> : null}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
            {test.periodState === 'BEFORE' && test.schedule.opensAt ? (
              <span className="text-[13px] font-semibold text-sub">{t('card.opens_at', { date: formatExamDate(test.schedule.opensAt) })}</span>
            ) : null}
            {test.periodState === 'AFTER' && !ended ? <span className="text-[13px] font-semibold text-sub">{t('card.closed')}</span> : null}
            {entryClosed && !latest?.open ? <span className="text-[13px] font-semibold text-sub">{t('card.entry_closed')}</span> : null}
            {test.itemCount === 0 ? <span className="text-[13px] font-semibold text-sub">{t('card.no_problems')}</span> : null}
            {ended && latest && test.settings.reviewAfterEnd ? (
              <Link href={routes.academyLearnTestAttempt(slug, test.lectureId, latest.id)}
                className="inline-flex h-11 items-center rounded-lg border border-border px-5 text-[14px] font-semibold text-ink hover:bg-surface">
                {t('card.review')}
              </Link>
            ) : null}
            {latest?.open ? (
              <Link href={routes.academyLearnTestAttempt(slug, test.lectureId, latest.id)}
                className="inline-flex h-11 items-center rounded-lg bg-brand px-6 text-[14px] font-bold text-on-brand hover:bg-brand-deep">
                {t('card.continue')}
              </Link>
            ) : test.canStart || test.canRetake ? (
              <button type="button" onClick={begin}
                disabled={starting || (!test.settings.usePreparation && !consent)}
                className="inline-flex h-11 items-center rounded-lg bg-brand px-6 text-[14px] font-bold text-on-brand hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40">
                {starting ? t('prepare.starting') : test.canRetake ? t('card.retake') : t('card.start')}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
