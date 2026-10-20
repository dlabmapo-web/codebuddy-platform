'use client';

import { useState, type ReactNode } from 'react';
import type { LearnExercise } from '@cove/shared';
import { useTranslation } from 'react-i18next';
import { surfaceProps } from '@/lib/monitoring/awareness/surfaces';
import { PdfReader } from './pdf-reader';

/** Only this subtree changes when navigating; the editor and runner remain mounted. */
export function ExerciseReferencePane({ academyId, exercise, children, teacher = false, preview = false }: {
  academyId: string; exercise: Pick<LearnExercise, 'materialId' | 'referencePdf' | 'hasReferencePdf'>;
  children: ReactNode; teacher?: boolean; preview?: boolean;
}) {
  const { t } = useTranslation(['content', 'pdf-practice']);
  const linked = Boolean(exercise.hasReferencePdf || exercise.referencePdf);
  const [tab, setTab] = useState<'pdf' | 'statement'>(linked ? 'pdf' : 'statement');
  if (!linked) return <div {...surfaceProps('statement')}>{children}</div>;
  const pdf = exercise.referencePdf;
  return <div className="flex h-full min-h-0 flex-col" data-testid="exercise-reference-pane">
    <div className="shrink-0 border-b border-border bg-card px-3 py-2">
      <div className="flex gap-2" role="tablist" aria-label={t('pdf-practice:label')}>
        {(['pdf', 'statement'] as const).map(value => <button key={value} type="button" role="tab"
          id={`${exercise.materialId}-${value}-tab`} aria-controls={`${exercise.materialId}-${value}-panel`}
          aria-selected={tab === value} onClick={() => setTab(value)}
          className={`rounded-lg px-3 py-2 text-sm ${tab === value ? 'bg-brand-soft text-brand' : 'text-sub'}`}>
          {t(`pdf-practice:${value === 'pdf' ? 'pdf_tab' : 'statement_tab'}`)}
        </button>)}
      </div>
      {pdf ? <p className="mt-1 truncate text-xs text-sub" title={pdf.title}>{pdf.title}</p> : null}
      {teacher ? <p className="mt-1 text-xs text-sub">{t('pdf-practice:local_pages')}</p> : null}
    </div>
    <div role="tabpanel" id={`${exercise.materialId}-pdf-panel`} aria-labelledby={`${exercise.materialId}-pdf-tab`}
      className={`min-h-0 flex-1 ${tab === 'pdf' ? 'block' : 'hidden'}`}>
      {pdf ? <PdfReader key={`${exercise.materialId}:${pdf.materialId}`} academyId={academyId}
        materialId={pdf.materialId} exerciseMaterialId={exercise.materialId} preview={preview} />
        : <p role="status" className="p-4 text-sm text-sub">{t('pdf-practice:unavailable')}</p>}
    </div>
    {tab === 'statement' ? <div role="tabpanel" id={`${exercise.materialId}-statement-panel`}
      aria-labelledby={`${exercise.materialId}-statement-tab`} className="min-h-0 flex-1 overflow-auto"
      {...surfaceProps('statement')}>{children}</div> : null}
  </div>;
}
