'use client';

import { CheckCheck, MessageSquareText, Send, PenLine, X, ListChecks, CircleCheck, CircleX, Clock3 } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useId, type FormEvent, type ReactNode } from 'react';
import { useManualTranslation } from './use-manual-translation';

const assessmentBase = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50';
export const assessmentAction = `${assessmentBase} border-border bg-card text-ink hover:bg-accent`;
export const assessmentPrimary = `${assessmentBase} border-transparent bg-brand text-on-brand hover:bg-brand-deep`;

export function AssessmentDrawer({ title, trigger, children, open, onOpenChange }: {
  title: string; trigger: ReactNode; children: ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useManualTranslation();
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40" />
      <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(360px,calc(100vw-24px))] flex-col border-r border-border bg-card text-ink shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <Dialog.Title className="flex items-center gap-2 font-bold"><ListChecks aria-hidden className="size-5 text-brand" />{title}</Dialog.Title>
          <Dialog.Close className={assessmentAction} aria-label={t('ui.close_panel')}><X aria-hidden className="size-4" /></Dialog.Close>
        </div>
        <Dialog.Description className="sr-only">{title}</Dialog.Description>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function AssessmentStatus({ label, completed }: { label: string; completed?: boolean | null }) {
  const Icon = completed === true ? CircleCheck : completed === false ? CircleX : Clock3;
  return <span role="status" className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${completed === true ? 'border-success/20 bg-success/10 text-success' : completed === false ? 'border-warning/20 bg-warning/10 text-warning' : 'border-brand/20 bg-brand-soft text-brand'}`}><Icon aria-hidden className="size-4 shrink-0" />{label}</span>;
}

export function WrittenAnswerCard({ question, hint, answer, disabled, onChange }: {
  question?: string; hint?: string; answer: string; disabled?: boolean; onChange: (answer: string) => void;
}) {
  const { t } = useManualTranslation();
  const id = useId();
  return <div className="p-5 sm:p-6">
    <h2 id={`${id}-question`} className="mb-6 flex items-start gap-3 text-base font-bold leading-7"><span aria-hidden className="text-lg font-extrabold text-brand">Q.</span>{question || t('your_answer')}</h2>
    <label htmlFor={id} className="mb-2 flex items-center gap-2 text-xs font-semibold text-sub"><PenLine aria-hidden className="size-3.5" />{t('ui.write_answer')}</label>
    {hint ? <p id={`${id}-hint`} className="mb-3 text-sm leading-relaxed text-sub">{hint}</p> : null}
    <textarea id={id} aria-label={t('your_answer')} aria-describedby={hint ? `${id}-hint` : undefined}
      className="min-h-44 w-full resize-y rounded-md border border-border bg-canvas p-4 text-base leading-7 outline-none transition-shadow placeholder:text-sub/60 focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:opacity-60 sm:min-h-48"
      placeholder={hint || t('ui.answer_placeholder')} maxLength={10000} disabled={disabled} value={answer} onChange={e => onChange(e.target.value)} />
    <p className="mt-2 text-right text-xs tabular-nums text-sub">{t('ui.characters', { count: answer.length, maximum: 10000 })}</p>
  </div>;
}

export function ReviewGradingPanel({ score, maximum, completed, feedback, busy, saved, dirty, onScore, onCompleted, onFeedback, onSubmit }: {
  score: number; maximum: number; completed: boolean; feedback: string; busy: boolean; saved: boolean; dirty: boolean;
  onScore: (score: number) => void; onCompleted: (completed: boolean) => void; onFeedback: (feedback: string) => void; onSubmit: () => void;
}) {
  const { t } = useManualTranslation();
  return <form className="grid gap-5 rounded-lg border border-border bg-card p-5 sm:p-6" aria-label={t('ui.grading_panel')}
    onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit(); }}>
    <div className="flex items-center gap-2 border-b border-border pb-4"><MessageSquareText aria-hidden className="size-4 text-brand" /><h2 className="text-base font-bold">{t('ui.grade_feedback')}</h2></div>
    <label className="grid gap-2 text-sm font-semibold">{t('score')}
      <span className="flex items-baseline gap-2"><input aria-label={t('score')} type="number" step="0.01" min={0} max={maximum} required disabled={busy}
        className="w-28 rounded-xl border border-border bg-canvas px-3 py-2 text-3xl font-bold tabular-nums outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        value={score} onChange={e => onScore(Number(e.target.value))} /><span className="text-base font-medium text-sub">/ {maximum}</span></span>
    </label>
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-canvas/50 p-3.5">
      <input type="checkbox" checked={completed} disabled={busy} onChange={e => onCompleted(e.target.checked)} className="mt-1 size-4 accent-brand" />
      <span><span className="block text-sm font-semibold">{t('completed')}</span><span className="mt-1 block text-xs leading-relaxed text-sub">{t('ui.completion_help')}</span></span>
    </label>
    <label className="grid gap-2 text-sm font-semibold">{t('feedback')}
      <textarea aria-label={t('feedback')} placeholder={t('ui.feedback_placeholder')} disabled={busy} maxLength={10000}
        className="min-h-36 w-full resize-y rounded-xl border border-border bg-canvas/50 p-3 text-sm font-normal leading-6 outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        value={feedback} onChange={e => onFeedback(e.target.value)} />
    </label>
    <div className="grid gap-2 border-t border-border pt-4">
      <button type="submit" disabled={busy || !Number.isFinite(score) || score < 0 || score > maximum} className={assessmentPrimary}>
        <Send aria-hidden className="size-4" />{t(busy ? 'ui.publishing' : 'publish_review')}
      </button>
      <p role="status" className={`flex min-h-5 items-center justify-center gap-1.5 text-center text-xs ${saved && !dirty ? 'text-success' : 'text-sub'}`}>
        {saved && !dirty ? <CheckCheck aria-hidden className="size-3.5" /> : null}{t(dirty ? 'ui.review_unsaved' : saved ? 'ui.review_published' : 'ui.publish_help')}
      </p>
    </div>
  </form>;
}
