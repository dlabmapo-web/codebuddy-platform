import { Code2, ListChecks } from 'lucide-react';
import type { SubmissionPolicy } from '@cove/shared';
import { useTranslation } from 'react-i18next';
import type { ExerciseDraft } from '../_lib/exercise-draft';

export function SubmissionPolicyEditor({ draft, editable, onChange }: { draft: ExerciseDraft; editable: boolean; onChange: (policy: SubmissionPolicy) => void }) {
  const { t } = useTranslation('pdf-practice');
  return <section className="space-y-4 rounded-xl border border-border bg-card p-5">
    <h2 className="text-base font-bold">{t('grading_title')}</h2>
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={t('grading_title')}>
      {(['PRACTICE_ONLY', 'AUTOMATIC'] as const).map(policy => {
        const selected = (draft.submissionPolicy ?? 'AUTOMATIC') === policy;
        const Icon = policy === 'PRACTICE_ONLY' ? Code2 : ListChecks;
        return <button key={policy} type="button" role="radio" aria-checked={selected} disabled={!editable} tabIndex={selected ? 0 : -1}
          onKeyDown={event => { if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return; event.preventDefault(); const next = event.key === "Home" ? "PRACTICE_ONLY" : event.key === "End" ? "AUTOMATIC" : policy === "AUTOMATIC" ? "PRACTICE_ONLY" : "AUTOMATIC"; onChange(next); const radios = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]'); radios?.[next === "AUTOMATIC" ? 1 : 0]?.focus(); }}
          className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${selected ? 'border-brand bg-brand-soft/50' : 'border-border hover:border-brand/40'}`}
          onClick={() => { onChange(policy); if (policy === 'AUTOMATIC') requestAnimationFrame(() => document.querySelectorAll<HTMLTextAreaElement>('[data-testid="grading-cases"] textarea')[1]?.focus()); }}>
          <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${selected ? 'text-brand' : 'text-sub'}`} />
          <span><span className="block text-sm font-bold">{t(policy === 'PRACTICE_ONLY' ? 'practice_only' : 'automatic')}</span><span className="mt-1 block text-sm leading-5 text-sub">{t(policy === 'PRACTICE_ONLY' ? 'practice_only_help' : 'automatic_help')}</span></span>
        </button>;
      })}
    </div>
    {draft.submissionPolicy === 'PRACTICE_ONLY' ? <p className="text-sm leading-6 text-sub">{t('retained_grading')}</p> : null}
  </section>;
}
