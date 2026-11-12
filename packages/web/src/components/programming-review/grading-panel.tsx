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
export function ProgrammingGradingPanel({academyId, classId, submissionId, initial, canPublish, variant = 'card', onDirtyChange}: {
  academyId: string; classId: string; submissionId: string; initial: ProgrammingAssessment; canPublish: boolean;
  variant?: 'card' | 'terminal'; onDirtyChange?: (dirty: boolean) => void;
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
  if (variant === 'terminal') return <section className="flex h-full min-h-0 min-w-0 flex-col bg-editor-bg text-sm text-white/85" data-testid="programming-grading-panel">
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 px-4 py-2.5" role="status" data-testid="programming-assessment">
      {currentAssessment.state === 'GRADED' ? <CheckCircle2 aria-hidden className="size-4 text-emerald-400"/> : <Clock3 aria-hidden className="size-4 text-amber-300"/>}
      <span className="font-semibold">{t(currentAssessment.state === 'GRADED' ? 'graded' : 'pending')}</span>
      {currentAssessment.scoreHundredths !== null ? <strong className="font-mono tabular-nums">{currentAssessment.scoreHundredths / 100} / {currentAssessment.maximumHundredths / 100}</strong> : null}
      <span className="text-xs text-white/50">{t(currentAssessment.includeInScore ? 'included' : 'excluded')}</span>
      <div className="ml-auto flex items-center gap-3">
        {canPublish ? <button type="button" onClick={() => {setShowHistory(value => !value); if (!showHistory) void reload();}} aria-pressed={showHistory} className="inline-flex items-center gap-1.5 text-xs text-white/65 hover:text-white focus-visible:outline-2 focus-visible:outline-brand"><History aria-hidden className="size-3.5"/>{t(showHistory ? 'back_grading' : 'history')}</button> : null}
        <button type="button" aria-label={t('refresh')} title={t('refresh')} disabled={historyLoading} onClick={() => canPublish ? void reload() : router.refresh()} className="rounded p-1 text-white/50 hover:text-white focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40"><RefreshCw aria-hidden className="size-3.5"/></button>
      </div>
    </div>
    <div hidden={!showHistory} className="min-h-0 flex-1 overflow-auto px-4 py-3">
      {historyLoading ? <p role="status" className="text-xs text-white/50">{t('loading_history')}</p> : !history?.length ? <p className="text-xs text-white/50">{t('no_review')}</p> : <ol className="space-y-3">{history.map(review => <li key={review.version} className="border-l-2 border-white/15 pl-3 text-xs">
        <p className="font-semibold">{t('version',{version:review.version,name:review.reviewerName,time:formatDateTime(review.createdAt,locale,true)})}</p>
        <p className="mt-1 font-mono text-white/70">{review.previousScoreHundredths === null ? '—' : review.previousScoreHundredths / 100} → {review.scoreHundredths / 100} · {t(review.completed ? 'complete' : 'incomplete')}</p>
        <p className="mt-1 whitespace-pre-wrap break-words text-white/70">{review.feedback}</p><p className="whitespace-pre-wrap break-words text-white/45">{review.reason}</p>
      </li>)}</ol>}
    </div>
    {canPublish ? <form style={{display:showHistory ? "none" : "flex"}} id={formId} onSubmit={publish} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <fieldset disabled={!hydrated || saving} className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3">
          <div className="grid items-start gap-4 sm:grid-cols-[148px_minmax(0,1fr)]">
            <div>
              <label className="block text-xs font-semibold text-white/70">{t(adjusting ? 'adjust' : 'final')}
                <span className="mt-1.5 flex items-center gap-2 rounded-md border border-white/20 bg-white/5 px-3 focus-within:border-brand focus-within:ring-1 focus-within:ring-brand">
                  <input aria-label={t(adjusting ? 'adjust' : 'final')} inputMode="decimal" autoComplete="off" aria-invalid={(adjusting ? adjust : score) !== '' && !validScore} value={adjusting ? adjust : score}
                    onChange={e => {if (adjusting) setAdjust(e.target.value); else setScore(e.target.value); setSaved(false);}}
                    className="h-10 min-w-0 flex-1 bg-transparent font-mono text-lg font-semibold tabular-nums text-white outline-none"/>
                  <span className="shrink-0 font-mono text-xs text-white/45">/ {assessment.maximumHundredths / 100}</span>
                </span>
              </label>
              <p className="mt-1.5 text-[11px] leading-4 text-white/40">{t('score_hint',{maximum:assessment.maximumHundredths / 100})}</p>
              {assessment.reviewVersion > 0 ? <label className="mt-2 flex items-center gap-2 text-xs text-white/60"><input type="checkbox" checked={adjusting} onChange={e => {setAdjusting(e.target.checked); setSaved(false);}} className="accent-brand"/>{t('adjust')}</label> : null}
            </div>
            <label className="block text-xs font-semibold text-white/70">{t('feedback')}
              <textarea rows={3} maxLength={10000} value={feedback} onChange={e => {setFeedback(e.target.value); setSaved(false);}}
                className="mt-1.5 block min-h-20 w-full resize-y rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm font-normal leading-5 text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand"/>
            </label>
          </div>
          {assessment.reviewVersion > 0 ? <label className="block text-xs font-semibold text-white/70">{t('reason')}<input required maxLength={1000} value={reason} onChange={e => {setReason(e.target.value); setSaved(false);}} className="mt-1.5 block h-9 w-full rounded-md border border-white/20 bg-white/5 px-3 text-sm font-normal text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand"/></label> : null}
          {assessment.reviewVersion > 0 && validScore && finalScore !== assessment.scoreHundredths ? <p className="font-mono text-xs text-white/60">{assessment.scoreHundredths! / 100} → {finalScore! / 100} / {assessment.maximumHundredths / 100}</p> : null}
          {error ? <div role="alert" className="text-xs text-red-300"><p>{error}</p><button type="button" onClick={() => void reload()} className="mt-1 underline">{t('reload')}</button></div> : null}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/10 px-4 py-2.5">
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={completed} onChange={e => {setCompleted(e.target.checked); setSaved(false);}} className="size-3.5 accent-brand"/>{t('complete')}</label>
          {saved ? <span role="status" className="text-xs text-emerald-400">{t('saved')}</span> : <span className="hidden text-[11px] text-white/40 xl:block">{t('teacher_hint')}</span>}
          <button type="submit" disabled={!hydrated || saving || !validScore || (assessment.reviewVersion > 0 && !reason.trim())} className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-md bg-brand px-4 py-2 text-xs font-semibold text-on-brand hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 aria-hidden className="size-3.5"/>{t(saving ? 'applying' : assessment.reviewVersion ? 'update' : 'publish')}</button>
        </footer>
      </fieldset>
    </form> : <div className="min-h-0 flex-1 overflow-auto px-4 py-3"><p className="text-xs text-white/50">{t('readonly_hint')}</p><p className="mt-3 whitespace-pre-wrap">{currentAssessment.feedback || t('no_feedback')}</p></div>}
  </section>;
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
