'use client';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { History, RefreshCw, CheckCircle2, Clock3 } from 'lucide-react';
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
export function ProgrammingGradingPanel({academyId, classId, submissionId, initial, canPublish, variant = 'card', onDirtyChange, onSavingChange}: {
  academyId: string; classId: string; submissionId: string; initial: ProgrammingAssessment; canPublish: boolean;
  variant?: 'card' | 'sidebar'; onDirtyChange?: (dirty: boolean) => void; onSavingChange?: (saving: boolean) => void;
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
  const [showHistory, setShowHistory] = useState(false), [historyLoading, setHistoryLoading] = useState(false);
  const formId = useId();
  const dirty = canPublish && (score !== (assessment.scoreHundredths === null ? '' : String(assessment.scoreHundredths / 100)) ||
    feedback !== assessment.feedback || completed !== (assessment.completed ?? false) || reason.trim() !== '' || (adjusting && adjust !== ''));
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onSavingChange?.(saving); return () => onSavingChange?.(false); }, [saving, onSavingChange]);
  const request = useRef<{signature: string; id: string} | null>(null);
  const finalScore = adjusting ? (assessment.scoreHundredths ?? 0) + (pointsToHundredths(adjust, true) ?? NaN) : pointsToHundredths(score);
  const target = {academyId, classId, submissionId};
  async function reload() {
    setHistoryLoading(true); setSaved(false);
    try { const value = await orpc.teacherProgress.getProgrammingReview(target); setAssessment(value.assessment); setHistory(value.reviews); setError(''); }
    catch (caught) {setError(errorText(caught));}
    finally {setHistoryLoading(false);}
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
  const validScore = finalScore !== null && Number.isSafeInteger(finalScore) && finalScore >= 0 && finalScore <= assessment.maximumHundredths;
  const currentAssessment = canPublish ? assessment : initial;
  if (variant === 'sidebar') return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-card text-sm text-ink" data-testid="programming-grading-panel">
      <div className="shrink-0 border-b border-border px-5 py-3" role="status" data-testid="programming-assessment">
        <div className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold ${currentAssessment.state === 'GRADED' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
          {currentAssessment.state === 'GRADED' ? <CheckCircle2 aria-hidden className="size-4 text-success" /> : <Clock3 aria-hidden className="size-4 text-warning" />}
          <span>{t(currentAssessment.state === 'GRADED' ? 'graded' : 'pending')}</span>
          {currentAssessment.scoreHundredths !== null ? <strong className="ml-1 font-mono tabular-nums">{currentAssessment.scoreHundredths / 100} / {currentAssessment.maximumHundredths / 100}</strong> : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-sub">
          <span className="mr-auto">{t(currentAssessment.includeInScore ? 'included' : 'excluded')}</span>
          {canPublish ? <button type="button" onClick={() => {setShowHistory(value => !value); if (!showHistory) void reload();}} aria-pressed={showHistory} className="inline-flex items-center gap-1.5 rounded hover:text-brand focus-visible:outline-2 focus-visible:outline-brand"><History aria-hidden className="size-3.5" />{t(showHistory ? 'back_grading' : 'history')}</button> : null}
          <button type="button" aria-label={t('refresh')} disabled={historyLoading || saving} onClick={() => canPublish ? void reload() : router.refresh()} className="rounded p-1 hover:text-brand disabled:opacity-40"><RefreshCw aria-hidden className="size-3.5" /></button>
        </div>
      </div>
      <div hidden={!showHistory} className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {historyLoading ? <p role="status" className="text-sub">{t('loading_history')}</p> : !history?.length ? <p className="text-sub">{t('no_review')}</p> : <ol className="space-y-4">{history.map(review => <li key={review.version} className="border-l-2 border-border pl-3 text-xs">
          <p className="font-semibold">{t('version', {version:review.version, name:review.reviewerName, time:formatDateTime(review.createdAt,locale,true)})}</p>
          <p className="mt-1 font-mono text-sub">{review.previousScoreHundredths === null ? '—' : review.previousScoreHundredths / 100} → {review.scoreHundredths / 100} · {t(review.completed ? 'complete' : 'incomplete')}</p>
          <p className="mt-2 whitespace-pre-wrap break-words">{review.feedback}</p><p className="mt-1 whitespace-pre-wrap break-words text-sub">{review.reason}</p>
        </li>)}</ol>}
      </div>
      {canPublish ? <form style={{display:showHistory ? 'none' : 'flex'}} id={formId} onSubmit={publish} className="min-h-0 min-w-0 flex-1 flex-col">
        <fieldset disabled={!hydrated || saving} className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-auto overscroll-y-contain px-5 py-4">
            <div className="rounded-xl border border-border bg-canvas/60 p-3.5">
              <label className="block text-xs font-semibold">{t(adjusting ? 'adjust' : 'final')}
                <span className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-background px-3 focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
                  <input aria-label={t(adjusting ? 'adjust' : 'final')} inputMode="decimal" autoComplete="off" aria-invalid={(adjusting ? adjust : score) !== '' && !validScore} value={adjusting ? adjust : score}
                    onChange={e => {if (adjusting) setAdjust(e.target.value); else setScore(e.target.value); setSaved(false);}}
                    placeholder="—" className="h-14 min-w-0 flex-1 bg-transparent font-mono text-3xl font-semibold tabular-nums outline-none" />
                  <span className="shrink-0 font-mono text-sub">/ {assessment.maximumHundredths / 100}</span>
                </span>
              </label>
              <p className="mt-2 text-xs text-sub">{t('score_hint', {maximum:assessment.maximumHundredths / 100})}</p>
              {assessment.reviewVersion > 0 ? <label className="mt-3 flex items-center gap-2 text-xs text-sub"><input type="checkbox" checked={adjusting} onChange={e => {setAdjusting(e.target.checked); setSaved(false);}} className="accent-brand" />{t('adjust')}</label> : null}
            </div>
            <fieldset className="min-w-0">
              <legend className="text-xs font-semibold">{t('learning_progress')}</legend>
              <p className="mt-1 text-[11px] text-sub">{t('completion_help')}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[true, false].map(value => <label key={String(value)} className={`flex min-w-0 cursor-pointer items-start gap-2 rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${completed === value ? 'border-brand bg-brand-soft/70' : 'border-border bg-card hover:bg-canvas'}`}>
                  <input type="radio" name={`${formId}-completed`} aria-label={t(value ? 'complete' : 'needs_work')} checked={completed === value} onChange={() => {setCompleted(value); setSaved(false);}} className="mt-0.5 size-3.5 shrink-0 accent-brand" />
                  <span className="min-w-0"><span className="block text-xs font-semibold leading-5">{t(value ? 'complete' : 'needs_work')}</span><span className="mt-1 block text-[11px] leading-4 text-sub">{t(value ? 'complete_help' : 'needs_work_help')}</span></span>
                </label>)}
              </div>
            </fieldset>
            <label className="block text-xs font-semibold">{t('feedback')}
              <textarea rows={3} maxLength={10000} value={feedback} onChange={e => {setFeedback(e.target.value); setSaved(false);}}
                className="mt-2 block min-h-24 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal leading-6 outline-none focus:border-brand focus:ring-1 focus:ring-brand" />
            </label>
            {assessment.reviewVersion > 0 ? <label className="block text-xs font-semibold">{t('reason')}<textarea rows={2} required maxLength={1000} value={reason} onChange={e => {setReason(e.target.value); setSaved(false);}} className="mt-2 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-brand focus:ring-1 focus:ring-brand" /></label> : null}
            {assessment.reviewVersion > 0 && validScore && finalScore !== assessment.scoreHundredths ? <p className="font-mono text-sm text-sub">{assessment.scoreHundredths! / 100} → {finalScore! / 100} / {assessment.maximumHundredths / 100}</p> : null}
            {error ? <div role="alert" className="text-sm text-danger"><p>{error}</p><button type="button" onClick={() => void reload()} className="mt-2 underline">{t('reload')}</button></div> : null}
          </div>
          <footer className="shrink-0 space-y-3 border-t border-border bg-card px-5 py-4">
            {saved ? <p role="status" className="flex items-center gap-1.5 text-xs font-semibold text-success"><CheckCircle2 aria-hidden className="size-3.5" />{t('saved')}</p> : <p className="text-[11px] leading-4 text-sub">{t('publish_help')}</p>}
            <button type="submit" disabled={!hydrated || saving || !validScore || (assessment.reviewVersion > 0 && !reason.trim())} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 aria-hidden className="size-4" />{t(saving ? 'applying' : assessment.reviewVersion ? 'update' : 'publish')}</button>
          </footer>
        </fieldset>
      </form> : <div className="min-h-0 flex-1 overflow-auto p-5"><p className="text-sub">{t('readonly_hint')}</p><p className="mt-3 whitespace-pre-wrap">{currentAssessment.feedback || t('no_feedback')}</p></div>}
    </section>
  );
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
