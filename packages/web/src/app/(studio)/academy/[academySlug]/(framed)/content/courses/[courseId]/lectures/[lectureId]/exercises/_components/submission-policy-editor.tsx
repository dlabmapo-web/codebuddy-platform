import { useReviewTranslation } from "@/components/programming-review/use-review-translation";
import { Code2, ListChecks } from 'lucide-react';
import type { SubmissionPolicy } from '@cove/shared';
import { useTranslation } from 'react-i18next';
import type { ExerciseDraft } from '../_lib/exercise-draft';

export function SubmissionPolicyEditor({ draft, editable, onChange, onAssessmentChange }: { draft: ExerciseDraft; editable: boolean; onChange: (policy: SubmissionPolicy) => void; onAssessmentChange: (value: {maximumHundredths: number; includeInScore: boolean}) => void }) {
  const { t } = useTranslation('pdf-practice');
  const mt = useReviewTranslation();
  const assessment = draft.manualAssessment ?? {maximumHundredths: 10000, includeInScore: false};
  return <section className="space-y-4 rounded-xl border border-border bg-card p-5">
    <h2 className="text-base font-bold">{t('grading_title')}</h2>
    <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={t('grading_title')}>
      {(['PRACTICE_ONLY', 'AUTOMATIC', 'MANUAL_REVIEW'] as const).map(policy => {
        const selected = (draft.submissionPolicy ?? 'AUTOMATIC') === policy;
        const Icon = policy === 'PRACTICE_ONLY' ? Code2 : ListChecks;
        return <button key={policy} type="button" role="radio" aria-checked={selected} disabled={!editable} tabIndex={selected ? 0 : -1}
          onKeyDown={event => {
            const choices = ['PRACTICE_ONLY', 'AUTOMATIC', 'MANUAL_REVIEW'] as const;
            if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
            event.preventDefault(); const index = choices.indexOf(policy);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (['ArrowLeft','ArrowUp'].includes(event.key) ? 2 : 1)) % 3;
            onChange(choices[next]); event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
          }}
          className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${selected ? 'border-brand bg-brand-soft/50' : 'border-border hover:border-brand/40'}`}
          onClick={() => { onChange(policy); if (policy === 'AUTOMATIC') requestAnimationFrame(() => document.querySelectorAll<HTMLTextAreaElement>('[data-testid="grading-cases"] textarea')[1]?.focus()); }}>
          <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${selected ? 'text-brand' : 'text-sub'}`} />
          <span><span className="block text-sm font-bold">{policy === 'MANUAL_REVIEW' ? mt('mode') : t(policy === 'PRACTICE_ONLY' ? 'practice_only' : 'automatic')}</span><span className="mt-1 block text-sm leading-5 text-sub">{policy === 'MANUAL_REVIEW' ? mt('mode_help') : t(policy === 'PRACTICE_ONLY' ? 'practice_only_help' : 'automatic_help')}</span></span>
        </button>;
      })}
    </div>
    {draft.submissionPolicy === 'MANUAL_REVIEW' ? <div className="space-y-3">
      <label className="block text-sm font-semibold">{mt('maximum')}<input type="number" min="0.01" max="10000" step="0.01" disabled={!editable} value={assessment.maximumHundredths/100} onChange={e => onAssessmentChange({...assessment, maximumHundredths: Math.round(Number(e.target.value)*100)})} className="mt-1 block rounded-lg border border-border bg-card px-3 py-2"/></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={assessment.includeInScore} onChange={e => onAssessmentChange({...assessment, includeInScore: e.target.checked})}/>{mt('include')}</label>
      <p className="text-sm text-sub">{mt('policy_change')}</p>
    </div> : null}
    {draft.submissionPolicy === 'PRACTICE_ONLY'  ? <p className="text-sm leading-6 text-sub">{t('retained_grading')}</p> : null}
  </section>;
}
