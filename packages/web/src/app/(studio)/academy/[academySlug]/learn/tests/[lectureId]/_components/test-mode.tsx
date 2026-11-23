'use client';

import { formatPoints, type ExamAttemptShell, type ExamItemType } from '@cove/shared';
import { ChevronLeft, ChevronRight, CircleCheck, Code2, FileQuestion, Info, PanelLeftClose, PanelLeftOpen, PenLine, Timer, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog } from '@/components/exam/exam-dialog';
import { ExamRules } from '@/components/exam/exam-info';
import { formatClock } from '@/components/exam/exam-format';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

import { ExamItemView } from './exam-items';
import { useServerClock } from './use-server-clock';

export function itemIcon(type: ExamItemType) {
  return type === 'CODE' ? Code2 : type === 'SHORT_ANSWER' ? PenLine : FileQuestion;
}

/**
 * Full-screen test mode (Elice provided/04–06): the problem rail with 제출
 * chips, the breadcrumb, 평가 안내, the countdown and 테스트 종료; the
 * problem in the middle; 이전 · n / N · 다음 at the bottom. No score or
 * verdict appears while the test runs.
 */
export function TestMode({ academyId, initial }: { academyId: string; initial: ExamAttemptShell }) {
  const { t } = useTranslation('exam');
  const slug = useAcademySlug();
  const router = useRouter();
  const search = useSearchParams();
  const [shell, setShell] = React.useState(initial);
  const [railOpen, setRailOpen] = React.useState(true);
  const [endOpen, setEndOpen] = React.useState(false);
  const [guideOpen, setGuideOpen] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const clock = useServerClock({ initialServerNow: initial.serverNow });
  const requested = Number(search.get('item') ?? '1');
  const [index, setIndex] = React.useState(() =>
    Number.isInteger(requested) && requested >= 1 && requested <= initial.items.length ? requested - 1 : 0);
  const item = shell.items[index];
  const cardHref = routes.academyLearnTest(slug, shell.lectureId, { classId: shell.classId });

  const showToast = React.useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? null : current)), 2500);
  }, []);

  const refresh = React.useCallback(async () => {
    try { setShell(await orpc.exam.attempt({ academyId, attemptId: shell.id })); } catch { /* keep the last state */ }
  }, [academyId, shell.id]);

  const endNow = React.useCallback(async () => {
    try { setShell(await orpc.exam.end({ academyId, attemptId: shell.id })); } catch { await refresh(); }
  }, [academyId, shell.id, refresh]);

  // A tab that slept past the deadline lands on the done screen when it wakes.
  React.useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const go = (next: number) => {
    setIndex(next);
    const params = new URLSearchParams(search.toString());
    params.set('item', String(next + 1));
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const markSubmitted = (materialId: string, submittedAt: Date) => {
    setShell((current) => ({
      ...current,
      items: current.items.map((row) => row.materialId === materialId ? { ...row, submitted: true, lastSubmittedAt: submittedAt } : row),
    }));
    showToast(t('mode.submitted_toast'));
  };

  if (!shell.open && !shell.review) return <TestDone shell={shell} onNext={() => router.push(cardHref)} />;

  return (
    <div className="flex h-dvh min-h-0 bg-canvas text-ink">
      {railOpen ? (
        <nav aria-label={shell.title} className="flex w-[300px] shrink-0 flex-col border-r border-border bg-card max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:shadow-modal">
          <div className="flex h-12 items-center gap-2 border-b border-border px-3">
            <button type="button" onClick={() => setRailOpen(false)} aria-label={t('mode.collapse')} className="grid size-8 place-items-center rounded-md text-sub hover:bg-surface hover:text-ink">
              <PanelLeftClose aria-hidden className="size-4" />
            </button>
            <span className="min-w-0 truncate text-[15px] font-bold">{shell.title}</span>
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto py-1">
            {shell.items.map((row, rowIndex) => (
              <li key={row.materialId}>
                <button type="button" onClick={() => { go(rowIndex); if (window.innerWidth < 768) setRailOpen(false); }}
                  aria-current={rowIndex === index ? 'step' : undefined}
                  className={`flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14px] font-semibold transition-colors ${rowIndex === index ? 'bg-brand-soft text-ink' : 'text-ink hover:bg-surface'}`}>
                  <span className="w-6 shrink-0 text-[15px] font-bold">{rowIndex + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{row.title}</span>
                  {shell.review && shell.resultsVisible && row.scoreHundredths != null ? (
                    <span className="shrink-0 text-[11px] font-bold text-sub">{formatPoints(row.scoreHundredths)}/{formatPoints(row.pointsHundredths)}</span>
                  ) : row.submitted ? (
                    <span className="shrink-0 rounded bg-success/15 px-1.5 py-0.5 text-[11px] font-bold text-success">{t('mode.submitted_chip')}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-3 sm:px-4">
          {!railOpen ? (
            <button type="button" onClick={() => setRailOpen(true)} aria-label={t('mode.expand')} className="grid size-8 place-items-center rounded-md text-sub hover:bg-surface hover:text-ink">
              <PanelLeftOpen aria-hidden className="size-4" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1 truncate text-[13px]">
            <span className="text-sub">{shell.title}</span>
            <span className="mx-2 text-sub">/</span>
            <span className="font-bold">{item?.title}</span>
          </div>
          <button type="button" onClick={() => setGuideOpen(true)} className="hidden items-center gap-1.5 text-[13px] font-semibold text-ink hover:text-brand sm:inline-flex">
            <Info aria-hidden className="size-4" /> {t('mode.guide')}
          </button>
          {shell.open ? <Countdown shell={shell} serverNow={clock.serverNow} onExpire={() => void endNow()} onWarn={showToast} /> : null}
          {shell.open ? (
            <button type="button" onClick={() => setEndOpen(true)} className="h-8 shrink-0 rounded-md bg-danger px-3 text-[13px] font-bold text-on-danger hover:opacity-90">
              {t('mode.end')}
            </button>
          ) : (
            <button type="button" onClick={() => router.push(cardHref)} className="h-8 shrink-0 rounded-md border border-border px-3 text-[13px] font-semibold hover:bg-surface">
              <X aria-hidden className="size-4" />
            </button>
          )}
        </header>

        {shell.review ? (
          <div className="border-b border-border bg-brand-soft px-4 py-2 text-[12.5px] font-semibold text-brand">{t('mode.review_banner')}</div>
        ) : null}

        <main className="min-h-0 flex-1 overflow-hidden">
          {item ? (
            <ExamItemView
              key={item.materialId}
              academyId={academyId}
              attemptId={shell.id}
              item={item}
              readOnly={!shell.open}
              onSubmitted={markSubmitted}
              onEnded={() => void refresh()}
            />
          ) : null}
        </main>

        <footer className="flex h-14 shrink-0 items-center justify-center gap-4 border-t border-border bg-card">
          {index > 0 ? (
            <button type="button" onClick={() => go(index - 1)} className="inline-flex h-9 items-center gap-1 rounded-md bg-surface px-3 text-[13px] font-semibold hover:bg-border">
              <ChevronLeft aria-hidden className="size-4" /> {t('mode.previous')}
            </button>
          ) : null}
          <span className="text-[14px] font-bold">{index + 1} / {shell.items.length}</span>
          {index < shell.items.length - 1 ? (
            <button type="button" onClick={() => go(index + 1)} className="inline-flex h-9 items-center gap-1 rounded-md bg-brand px-3 text-[13px] font-bold text-on-brand hover:bg-brand-deep">
              {t('mode.next')} <ChevronRight aria-hidden className="size-4" />
            </button>
          ) : null}
        </footer>
      </div>

      {endOpen ? (
        <EndTestDialog shell={shell} onCancel={() => setEndOpen(false)} onConfirm={async () => { await endNow(); setEndOpen(false); }} />
      ) : null}
      {guideOpen ? (
        <Dialog title={t('mode.guide')} onClose={() => setGuideOpen(false)}>
          <ExamRules guide={shell.guide} />
        </Dialog>
      ) : null}
      {toast ? (
        <div role="status" className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-[13px] font-semibold text-canvas shadow-modal">{toast}</div>
      ) : null}
    </div>
  );
}

function Countdown({ shell, serverNow, onExpire, onWarn }: {
  shell: ExamAttemptShell; serverNow: () => number; onExpire: () => void; onWarn: (message: string) => void;
}) {
  const { t } = useTranslation('exam');
  const deadline = shell.deadlineAt ? new Date(shell.deadlineAt).getTime() : null;
  const [left, setLeft] = React.useState(() => (deadline == null ? null : deadline - serverNow()));
  const warned = React.useRef({ five: false, one: false, done: false });
  React.useEffect(() => {
    if (deadline == null) return;
    const tick = () => {
      const remaining = deadline - serverNow();
      setLeft(remaining);
      if (remaining <= 5 * 60_000 && remaining > 60_000 && !warned.current.five) { warned.current.five = true; onWarn(t('mode.warn_5')); }
      if (remaining <= 60_000 && remaining > 0 && !warned.current.one) { warned.current.one = true; onWarn(t('mode.warn_1')); }
      if (remaining <= 0 && !warned.current.done) { warned.current.done = true; onExpire(); }
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [deadline, serverNow, onExpire, onWarn, t]);
  if (left == null) return <span className="hidden text-[13px] font-semibold text-sub sm:inline">{t('mode.no_deadline')}</span>;
  const tone = left <= 60_000 ? 'text-danger' : left <= 5 * 60_000 ? 'text-warning' : 'text-ink';
  return (
    <span role="timer" aria-live="off" className={`inline-flex shrink-0 items-center gap-1.5 font-mono text-[13px] font-semibold ${tone}`}>
      <Timer aria-hidden className="size-4" />
      <span className="hidden font-sans sm:inline">{t('mode.remaining', { time: '' }).trim()}</span>
      {formatClock(left)}
    </span>
  );
}

function SubmissionList({ shell }: { shell: ExamAttemptShell }) {
  const { t } = useTranslation('exam');
  return (
    <ul className="max-h-[50dvh] space-y-1 overflow-y-auto rounded-xl bg-surface px-4 py-3">
      {shell.items.map((row) => {
        const Icon = itemIcon(row.type);
        return (
          <li key={row.materialId} className="flex items-center gap-2 py-1 text-[13.5px]">
            <Icon aria-hidden className="size-4 shrink-0 text-sub" />
            <span className="min-w-0 flex-1 truncate font-semibold">{row.title}</span>
            <span className={`text-[12px] font-bold ${row.submitted ? 'text-success' : 'text-sub'}`}>
              {row.submitted ? t('mode.submitted_chip') : t('mode.not_submitted')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function EndTestDialog({ shell, onCancel, onConfirm }: { shell: ExamAttemptShell; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const { t } = useTranslation('exam');
  const [checked, setChecked] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog title={t('end_dialog.title')} onClose={onCancel} footer={
      <>
        <button type="button" disabled={!checked || busy} onClick={async () => { setBusy(true); await onConfirm(); }}
          className="h-10 rounded-lg bg-brand px-5 text-[14px] font-bold text-on-brand hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-40">
          {t('end_dialog.end')}
        </button>
        <button type="button" onClick={onCancel} className="h-10 px-3 text-[14px] font-semibold text-sub hover:text-ink">{t('end_dialog.cancel')}</button>
      </>
    }>
      <p className="mb-4 text-[14px] font-semibold">{t('end_dialog.warning')}</p>
      <SubmissionList shell={shell} />
      <label className="mt-5 flex items-center gap-2 text-[13.5px]">
        <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
        {t('end_dialog.confirm')}
      </label>
    </Dialog>
  );
}

function TestDone({ shell, onNext }: { shell: ExamAttemptShell; onNext: () => void }) {
  const { t } = useTranslation('exam');
  const reason = shell.endReason === 'TIME_UP' ? t('done.time_up') : shell.endReason === 'PERIOD_CLOSED' ? t('done.period_closed') : shell.endReason === 'STAFF' ? t('done.staff') : null;
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas p-4">
      <section className="w-full max-w-[560px] rounded-2xl border border-border bg-card p-8 text-center">
        <CircleCheck aria-hidden className="mx-auto size-14 text-success" />
        <h1 className="mt-4 text-[20px] font-bold">{t('done.title')}</h1>
        {reason ? <p className="mt-2 text-[13.5px] text-sub">{reason}</p> : null}
        <div className="mt-6 text-left"><SubmissionList shell={shell} /></div>
        <button type="button" onClick={onNext} className="mt-6 h-11 w-full rounded-lg bg-success text-[14px] font-bold text-on-success hover:opacity-90">{t('done.next')}</button>
      </section>
    </main>
  );
}
