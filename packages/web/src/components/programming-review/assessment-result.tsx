'use client';
import type { ProgrammingAssessment } from '@cove/shared';
import { formatDateTime } from '@cove/i18n/format';
import { CheckCircle2, ClipboardCheck, Clock3, Code2, MessageCircle, RefreshCw, UserRound } from 'lucide-react';
import { useLocale } from '@/i18n';
import { useReviewTranslation } from './use-review-translation';
export function ProgrammingAssessmentResult({assessment, dark = false, onRefresh}: {assessment?: ProgrammingAssessment | null; dark?: boolean; onRefresh?: () => void}) {
  const t = useReviewTranslation(), locale = useLocale();
  const number = new Intl.NumberFormat(locale, {maximumFractionDigits: 2});
  const graded = assessment?.state === 'GRADED';
  const Icon = !assessment ? Code2 : graded ? ClipboardCheck : Clock3;
  const muted = dark ? 'text-white/60' : 'text-sub';
  const blue = dark ? 'border-blue-400/20 bg-blue-400/10 text-blue-300' : 'border-brand/20 bg-brand-soft text-brand';
  const green = dark ? 'bg-emerald-400/10 text-emerald-300' : 'bg-success/10 text-success';
  const amber = dark ? 'bg-amber-400/10 text-amber-300' : 'bg-warning/10 text-warning';
  return <section role="status" data-testid="programming-assessment" className={`overflow-hidden rounded-xl border text-sm ${dark ? 'border-white/15 bg-white/[0.04] text-white/90' : 'border-border bg-card text-ink'}`}>
    <header className="flex items-center gap-3 px-4 pb-3 pt-4">
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${!assessment || graded ? blue : amber}`}><Icon aria-hidden className="size-5" /></span>
      <div className="min-w-0"><h3 className="font-bold">{t(!assessment ? 'practice' : graded ? 'graded' : 'pending')}</h3>
        {assessment && !graded ? <p className={`mt-0.5 text-xs ${muted}`}>{t('submitted')}</p> : null}
      </div>
    </header>
    {assessment ? <>
      <div className="space-y-3 px-4 pb-4">
        {graded ? <>
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 ${blue}`}>
            <div><p className="text-xs font-semibold">{t('score')}</p><p className="mt-1 font-mono font-bold tabular-nums" data-testid="assessment-score"><span className="text-3xl">{number.format(assessment.scoreHundredths! / 100)}</span><span className="text-base opacity-70"> / {number.format(assessment.maximumHundredths / 100)}</span></p></div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold ${green}`}><CheckCircle2 aria-hidden className="size-4 shrink-0" />{t('graded_short')}</span>
          </div>
          <div className={`rounded-lg p-3 ${dark ? 'bg-black/10' : 'bg-canvas'}`}>
            <p className={`mb-1 flex items-center gap-1.5 text-xs font-semibold ${muted}`}><MessageCircle aria-hidden className="size-3.5" />{t('teacher_feedback')}</p>
            <p className={`whitespace-pre-wrap break-words leading-6 ${assessment.feedback ? '' : muted}`}>{assessment.feedback || t('no_feedback')}</p>
          </div>
        </> : <p className={`leading-6 ${muted}`}>{t('notice')}</p>}
        <div className={`flex items-start gap-2.5 rounded-lg border p-3 ${blue}`} data-testid="assessment-next-step">
          {graded ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> : <MessageCircle aria-hidden className="mt-0.5 size-4 shrink-0" />}
          <div><p className="text-xs font-semibold">{t(graded ? 'ready_next' : 'talk_teacher')}</p><p className={`mt-1 text-xs leading-5 ${dark ? 'text-white/75' : 'text-ink/80'}`}>{t(graded ? 'graded_next_help' : 'talk_teacher_pending_help')}</p></div>
        </div>
        {graded ? <p className={`flex items-start gap-2 text-[11px] leading-5 ${muted}`}><UserRound aria-hidden className="mt-0.5 size-3.5 shrink-0" /><span>{t('reviewer', {name: assessment.reviewerName})}<br />{t('reviewed_at', {time: formatDateTime(assessment.reviewedAt!, locale, true)})}</span></p> : null}
      </div>
      <footer className={`flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 ${dark ? 'border-white/10' : 'border-border'}`}>
        <p className={`text-[11px] ${muted}`}>{t(assessment.includeInScore ? 'included' : 'excluded')}</p>
        <button type="button" className={`inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${dark ? 'text-blue-300 hover:bg-white/5' : 'text-brand hover:bg-brand-soft'}`} onClick={onRefresh ?? (() => window.dispatchEvent(new Event('cove:assessment-changed')))}><RefreshCw aria-hidden className="size-3.5" />{t('refresh')}</button>
      </footer>
    </> : null}
  </section>;
}
