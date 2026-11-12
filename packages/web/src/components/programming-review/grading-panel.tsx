'use client';
import { useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import type { ProgrammingAssessment } from '@cove/shared';
import { formatDateTime } from '@cove/i18n/format';
import { useLocale } from '@/i18n';
import { orpc } from '@/lib/orpc';
import { useErrorText } from '@/i18n/client/use-error-text';
import { ProgrammingAssessmentResult } from './assessment-result';
import { useReviewTranslation } from './use-review-translation';

const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

/** Parse authored decimal points without rounding a floating point score. */
export function pointsToHundredths(value: string, signed = false): number | null {
  const text = value.trim();
  if (!(signed ? /^[+-]?\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,2})?$/).test(text)) return null;
  const negative = text.startsWith('-'), [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.');
  const result = Number(whole)*100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? (negative ? -result : result) : null;
}
export function ProgrammingGradingPanel({academyId, classId, submissionId, initial, canPublish}: {
  academyId: string; classId: string; submissionId: string; initial: ProgrammingAssessment; canPublish: boolean;
}) {
  const t = useReviewTranslation(), locale = useLocale(), errorText = useErrorText();
  const router = useRouter();
  // Server-rendered score controls must not accept edits before React owns them.
  // Otherwise hydration can replace a fast edit with the saved score.
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydrated, serverHydrated);
  const [assessment, setAssessment] = useState(initial);
  const [score, setScore] = useState(initial.scoreHundredths === null ? '' : String(initial.scoreHundredths/100));
  const [adjust, setAdjust] = useState(''), [adjusting, setAdjusting] = useState(false);
  const [feedback, setFeedback] = useState(initial.feedback), [completed, setCompleted] = useState(initial.completed ?? false);
  const [reason, setReason] = useState(''), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [saved, setSaved] = useState(false);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof orpc.teacherProgress.getProgrammingReview>>['reviews'] | null>(null);
  const request = useRef<{signature: string; id: string} | null>(null);
  const finalScore = adjusting ? (assessment.scoreHundredths ?? 0) + (pointsToHundredths(adjust, true) ?? NaN) : pointsToHundredths(score);
  const target = {academyId, classId, submissionId};
  async function reload() {
    try { const value = await orpc.teacherProgress.getProgrammingReview(target); setAssessment(value.assessment); setHistory(value.reviews); }
    catch (caught) {setError(errorText(caught));}
  }
  async function publish(event: React.FormEvent) {
    event.preventDefault(); if (saving) return;
    setSaved(false);
    if (finalScore === null || !Number.isSafeInteger(finalScore) || finalScore < 0 || finalScore > assessment.maximumHundredths) {setError(t('invalid')); return;}
    if (assessment.reviewVersion > 0 && !reason.trim()) {setError(t('reason_required')); return;}
    const value = {...target, expectedVersion: assessment.reviewVersion, scoreHundredths: finalScore, completed, feedback, reason: reason.trim()};
    const signature = JSON.stringify(value);
    request.current = request.current?.signature === signature ? request.current : {signature, id: crypto.randomUUID()};
    setSaving(true); setError('');
    try {
      const published = await orpc.teacherProgress.publishProgrammingReview({...value, requestId: request.current.id});
      setAssessment(published.assessment); setHistory(published.reviews); setScore(String(published.assessment.scoreHundredths! / 100));
      setAdjust(''); setAdjusting(false); setReason(''); setSaved(true); request.current = null;
      router.refresh();
      window.dispatchEvent(new CustomEvent('cove:assessment-changed', {detail: {...target}}));
    } catch (caught) { setError(`${errorText(caught)} ${t('conflict')}`); }
    finally {setSaving(false);}
  }
  return <div className="space-y-4" data-testid="programming-grading-panel">
    <ProgrammingAssessmentResult assessment={canPublish ? assessment : initial} onRefresh={canPublish ? () => void reload() : () => router.refresh()}/>
    {canPublish ? <form onSubmit={publish} className="rounded-xl border border-border bg-card p-4">
      <fieldset disabled={!hydrated || saving} className="space-y-4">
      <h3 className="font-bold">{t(assessment.reviewVersion ? 'correct' : 'mode')}</h3>
      {assessment.reviewVersion > 0 ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={adjusting} onChange={e => setAdjusting(e.target.checked)}/>{t('adjust')}</label> : null}
      <label className="block text-sm font-semibold">{t(adjusting ? 'adjust' : 'final')}
        <input aria-label={t(adjusting ? 'adjust' : 'final')} inputMode="decimal" value={adjusting ? adjust : score} disabled={saving}
          onChange={e => adjusting ? setAdjust(e.target.value) : setScore(e.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2"/>
      </label>
      <p className="text-sm tabular-nums">{assessment.scoreHundredths === null ? '—' : assessment.scoreHundredths/100} → {finalScore === null || !Number.isFinite(finalScore) ? '—' : finalScore/100} / {assessment.maximumHundredths/100}</p>
      <label className="block text-sm font-semibold">{t('feedback')}<textarea maxLength={10000} value={feedback} disabled={saving} onChange={e => setFeedback(e.target.value)} className="mt-1 block min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2"/></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={completed} disabled={saving} onChange={e => setCompleted(e.target.checked)}/>{t('complete')}</label>
      {assessment.reviewVersion > 0 ? <label className="block text-sm font-semibold">{t('reason')}<textarea required maxLength={1000} value={reason} disabled={saving} onChange={e => setReason(e.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2"/></label> : null}
      {error ? <div role="alert" className="space-y-2 text-sm text-danger"><p>{error}</p><button type="button" onClick={() => void reload()} className="underline">{t('reload')}</button></div> : null}
      {saved ? <p role="status" className="text-sm text-success">{t('saved')}</p> : null}
      <button type="submit" disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{t(saving ? 'applying' : 'apply')}</button>
      </fieldset>
    </form> : null}
    {canPublish ? <button type="button" className="text-sm underline" onClick={() => void reload()}>{t('history')}</button> : null}
    {history ? <ol className="space-y-3 text-sm">{history.map(review => <li key={review.version} className="rounded-lg border border-border p-3">
      <p className="font-semibold">{t('version', {version: review.version, name: review.reviewerName, time: formatDateTime(review.createdAt, locale, true)})}</p>
      <p>{review.previousScoreHundredths === null ? '—' : review.previousScoreHundredths/100} → {review.scoreHundredths/100} · {t(review.completed ? 'complete' : 'incomplete')}</p>
      <p className="whitespace-pre-wrap break-words">{review.feedback}</p><p className="whitespace-pre-wrap break-words opacity-70">{review.reason}</p>
    </li>)}</ol> : null}
  </div>;
}
