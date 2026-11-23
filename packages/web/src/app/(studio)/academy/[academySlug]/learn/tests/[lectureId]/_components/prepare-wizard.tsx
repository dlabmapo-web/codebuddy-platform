'use client';

import type { ExamStudentTest } from '@cove/shared';
import { ArrowLeft, Check, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { ExamInfoTiles, ExamRules } from '@/components/exam/exam-info';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

import { useServerClock } from './use-server-clock';

const WINDOWS_HELP = 'https://support.microsoft.com/windows/how-to-set-your-time-and-time-zone-dfaa7122-479f-5b98-2a7b-fa0b6e01b261';
const MAC_HELP = 'https://support.apple.com/guide/mac-help/set-the-date-and-time-automatically-mchlp2996/mac';

/**
 * 테스트 준비하기 (Elice provided/01–03): test info and consent, the PC clock
 * check, then the rules again and 테스트 시작. The left card tracks progress
 * 33 → 67 → 100%.
 */
export function PrepareWizard({ academyId, test, name }: { academyId: string; test: ExamStudentTest; name: string }) {
  const { t } = useTranslation('exam');
  const slug = useAcademySlug();
  const router = useRouter();
  const errorText = useErrorText();
  const [step, setStep] = React.useState(0);
  const [consent, setConsent] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const clock = useServerClock();
  const steps = [t('prepare.step_info'), t('prepare.step_clock'), t('prepare.step_ready')];
  const percent = Math.round(((step + 1) / steps.length) * 100);
  const done = step === steps.length - 1;

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const { attemptId } = await orpc.exam.start({
        academyId, classId: test.classId, lectureId: test.lectureId, consent: true,
        clockDriftMs: clock.driftMs == null ? null : Math.round(clock.driftMs),
      });
      router.replace(routes.academyLearnTestAttempt(slug, test.lectureId, attemptId));
    } catch (caught) {
      setError(errorText(caught));
      setStarting(false);
    }
  };

  return (
    <main className="min-h-screen bg-canvas px-4 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-[1040px]">
        <Link href={routes.academyLearnTest(slug, test.lectureId, { classId: test.classId })}
          className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand">
          <ArrowLeft aria-hidden className="size-4" /> {t('back')}
        </Link>
        <div className="mt-5 grid items-start gap-5 md:grid-cols-[280px_1fr]">
          <aside className="rounded-2xl border border-border bg-card">
            <div className="border-b border-border p-5">
              <h1 className="text-[18px] font-bold text-ink">{t('prepare.title')}</h1>
              <div className="mt-2 flex items-center justify-between gap-2 text-[12px] font-semibold">
                <span className="text-ink">{t('prepare.subtitle')}</span>
                <span className={done ? 'text-success' : 'text-brand'}>{percent}%</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-border" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
                <div className={`h-full rounded-full transition-[width] duration-300 ${done ? 'bg-success' : 'bg-brand'}`} style={{ width: `${percent}%` }} />
              </div>
            </div>
            <ol className="space-y-1 p-4">
              {steps.map((label, index) => (
                <li key={label} aria-current={index === step ? 'step' : undefined}
                  className={`flex items-center gap-3 rounded-lg px-2 py-2 text-[14px] ${index === step ? 'font-bold text-ink' : 'text-sub'}`}>
                  <span className={`grid size-6 place-items-center rounded-full border text-[12px] ${index < step ? 'border-success bg-success text-on-success' : index === step ? 'border-ink' : 'border-border'}`}>
                    {index < step ? <Check aria-hidden className="size-3.5" /> : index + 1}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
          </aside>

          <section className="rounded-2xl border border-border bg-card p-6 sm:p-7">
            {step === 0 ? (
              <>
                <h2 className="text-[20px] font-bold leading-snug text-ink">
                  {t('prepare.greeting', { name })}<br />{t('prepare.greeting_sub')}
                </h2>
                <div className="mt-6"><ExamInfoTiles schedule={test.schedule} timeLimitMinutes={test.settings.timeLimitMinutes} itemCount={test.itemCount} /></div>
                <div className="mt-4"><ExamRules guide={test.settings.guide} /></div>
                <label className="mt-6 flex items-center gap-2 text-[14px] text-ink">
                  <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                  {t('prepare.consent')}
                </label>
                <div className="mt-8 flex justify-end">
                  <button type="button" disabled={!consent} onClick={() => setStep(1)}
                    className="h-11 w-full max-w-[340px] rounded-lg bg-brand text-[14px] font-bold text-on-brand hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40">
                    {t('prepare.next')}
                  </button>
                </div>
              </>
            ) : step === 1 ? (
              <>
                <h2 className="text-[20px] font-bold text-ink">{t('prepare.step_clock')}</h2>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-surface px-5 py-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-bold text-ink">{t('prepare.server_time')}</span>
                      <button type="button" onClick={clock.resync} aria-label={t('prepare.resync')} title={t('prepare.resync')}
                        className="grid size-7 place-items-center rounded-md text-sub hover:bg-card hover:text-ink">
                        <RefreshCw aria-hidden className={`size-4 ${clock.syncing ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                    <div className="mt-2 font-mono text-[18px] text-ink" suppressHydrationWarning>{clock.serverText}</div>
                  </div>
                  <div className="rounded-xl bg-surface px-5 py-4">
                    <div className="text-[14px] font-bold text-ink">{t('prepare.pc_time')}</div>
                    <div className="mt-2 font-mono text-[18px] text-ink" suppressHydrationWarning>
                      {clock.pcText}{' '}
                      {clock.driftMs != null ? (
                        <span className={`text-[14px] font-semibold ${Math.abs(clock.driftMs) <= 1000 ? 'text-success' : 'text-danger'}`}>
                          {t('prepare.drift', { seconds: (clock.driftMs / 1000).toFixed(2) })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {clock.driftMs != null && Math.abs(clock.driftMs) > 60_000 ? (
                  <p role="alert" className="mt-3 text-[13px] font-semibold text-danger">{t('prepare.clock_warning')}</p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <a href={WINDOWS_HELP} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-4 py-2 text-[13px] font-semibold text-ink hover:bg-surface">{t('prepare.windows_help')}</a>
                  <a href={MAC_HELP} target="_blank" rel="noreferrer" className="rounded-lg border border-border px-4 py-2 text-[13px] font-semibold text-ink hover:bg-surface">{t('prepare.mac_help')}</a>
                </div>
                <ol className="mt-5 list-decimal space-y-2 rounded-xl bg-surface px-9 py-5 text-[13px] leading-relaxed text-ink">
                  {(t('prepare.clock_notes', { returnObjects: true }) as string[]).map((note) => <li key={note}>{note}</li>)}
                </ol>
                <div className="mt-8 flex justify-end gap-3">
                  <button type="button" onClick={() => setStep(0)} className="h-11 rounded-lg border border-border px-6 text-[14px] font-semibold text-ink hover:bg-surface">{t('prepare.previous')}</button>
                  <button type="button" onClick={() => setStep(2)} className="h-11 w-full max-w-[240px] rounded-lg bg-brand text-[14px] font-bold text-on-brand hover:bg-brand-deep">{t('prepare.next')}</button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-[20px] font-bold text-ink">{t('prepare.ready_title')}</h2>
                <div className="mt-6"><ExamRules guide={test.settings.guide} /></div>
                {error ? <p role="alert" className="mt-4 text-[13px] font-semibold text-danger">{error}</p> : null}
                <div className="mt-8 flex justify-end gap-3">
                  <button type="button" onClick={() => setStep(1)} className="h-11 rounded-lg border border-border px-6 text-[14px] font-semibold text-ink hover:bg-surface">{t('prepare.previous')}</button>
                  <button type="button" onClick={() => void start()} disabled={starting}
                    className="h-11 w-full max-w-[240px] rounded-lg bg-success text-[14px] font-bold text-on-success hover:opacity-90 disabled:opacity-40">
                    {starting ? t('prepare.starting') : t('prepare.start')}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
