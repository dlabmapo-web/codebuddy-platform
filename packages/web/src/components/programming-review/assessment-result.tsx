'use client';
import type { ProgrammingAssessment } from '@cove/shared';
import { formatDateTime } from '@cove/i18n/format';
import { useLocale } from '@/i18n';
import { useReviewTranslation } from './use-review-translation';
export function ProgrammingAssessmentResult({assessment, dark = false, onRefresh}: {assessment?: ProgrammingAssessment | null; dark?: boolean; onRefresh?: () => void}) {
  const t = useReviewTranslation(), locale = useLocale();
  const number = new Intl.NumberFormat(locale, {maximumFractionDigits: 2});
  return <section role="status" data-testid="programming-assessment" className={`space-y-3 rounded-xl border p-4 text-sm ${dark ? 'border-white/15 bg-white/5 text-white/85' : 'border-border bg-card text-ink'}`}>
    <h3 className="font-bold">{t(!assessment ? 'practice' : assessment.state === 'GRADED' ? 'graded' : 'submitted')}</h3>
    {assessment ? <>
      <p>{t('notice')}</p>
      {assessment.state === 'AWAITING_REVIEW' ? <p className="font-semibold">{t('pending')}</p> : <>
        <p className="text-xl font-bold tabular-nums">{number.format(assessment.scoreHundredths! / 100)} / {number.format(assessment.maximumHundredths / 100)}</p>
        <p>{t(assessment.completed ? 'complete' : 'incomplete')}</p>
        <p className="whitespace-pre-wrap break-words">{assessment.feedback || t('no_feedback')}</p>
        <p className="text-xs opacity-70">{t('reviewer', {name: assessment.reviewerName})} · {t('reviewed_at', {time: formatDateTime(assessment.reviewedAt!, locale, true)})}</p>
      </>}
      <p className="text-xs opacity-70">{t(assessment.includeInScore ? 'included' : 'excluded')}</p>
      <button type="button" className="text-xs underline underline-offset-2" onClick={onRefresh ?? (() => window.dispatchEvent(new Event('cove:assessment-changed')))}>{t('refresh')}</button>
    </> : null}
  </section>;
}
