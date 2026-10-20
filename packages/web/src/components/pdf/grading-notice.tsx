
'use client';
import type { LearnExercise } from '@cove/shared';
import { useTranslation } from 'react-i18next';
import { Code2, ListChecks } from 'lucide-react';
import { isPdfRunOnly } from './pdf-practice-mode';
export function GradingNotice({ exercise }: { exercise: LearnExercise }) {
  const { t } = useTranslation('pdf-practice');
  const practice = isPdfRunOnly(exercise);
  if (exercise.quiz) return null;
  const Icon = practice ? Code2 : ListChecks;
  return <div role="status" className="flex items-start gap-2 border-b border-brand/10 bg-brand-soft/40 px-4 py-3 text-xs leading-5 text-sub"><Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" /><p><span className="font-semibold text-brand">{t(practice ? 'ungraded' : exercise.submissionAvailability === 'INVALID_GRADING' ? 'grading_not_ready' : 'automatically_graded', { maximum: exercise.maximumPoints ?? 100 })}</span>{practice ? <span className="block">{t('ungraded_help')}</span> : null}</p></div>;
}
