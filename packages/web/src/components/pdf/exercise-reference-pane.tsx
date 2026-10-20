'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { FileText, Info, ListChecks } from 'lucide-react';
import type { LearnExercise } from '@cove/shared';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipProvider } from '@/components/studio/primitives';
import { surfaceProps } from '@/lib/monitoring/awareness/surfaces';
import { PdfReader } from './pdf-reader';

const views = ['pdf', 'statement'] as const;
type ReferenceView = typeof views[number];

/** Switching materials preserves the reader, statement scroll, and surrounding editor. */
export function ExerciseReferencePane({ academyId, exercise, children, teacher = false, preview = false }: {
  academyId: string; exercise: Pick<LearnExercise, 'materialId' | 'referencePdf' | 'hasReferencePdf'>;
  children: ReactNode; teacher?: boolean; preview?: boolean;
}) {
  const { t } = useTranslation(['content', 'pdf-practice']);
  const linked = Boolean(exercise.hasReferencePdf || exercise.referencePdf);
  const [tab, setTab] = useState<ReferenceView>(linked ? 'pdf' : 'statement');
  if (!linked) return <div {...surfaceProps('statement')}>{children}</div>;
  const pdf = exercise.referencePdf;
  function selectWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, value: ReferenceView) {
    const index = views.indexOf(value);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1
      : event.key === 'ArrowRight' ? (index + 1) % views.length
      : event.key === 'ArrowLeft' ? (index + views.length - 1) % views.length : null;
    if (next === null) return;
    event.preventDefault();
    setTab(views[next]!);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
  return <div className="flex h-full min-h-0 flex-col" data-testid="exercise-reference-pane">
    <div className="z-10 shrink-0 border-b border-border bg-card px-4 py-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-canvas p-1" role="tablist" aria-label={t('pdf-practice:materials_tab')}>
        {views.map(value => {
          const selected = tab === value;
          const Icon = value === 'pdf' ? FileText : ListChecks;
          return <button key={value} type="button" role="tab"
            id={`${exercise.materialId}-${value}-tab`} aria-controls={`${exercise.materialId}-${value}-panel`}
            aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={() => setTab(value)}
            onKeyDown={(event) => selectWithKeyboard(event, value)}
            className={`relative flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-lg border px-2 py-2 text-[13px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${selected ? 'border-brand/20 bg-card text-brand shadow-sm' : 'border-transparent text-sub hover:bg-card/70 hover:text-ink'}`}>
            <Icon aria-hidden className="size-4 shrink-0" />
            <span className="truncate">{t(`pdf-practice:${value === 'pdf' ? 'pdf_tab' : 'statement_tab'}`)}</span>
          </button>;
        })}
      </div>
      {tab === 'pdf' && pdf ? <div className="mt-2.5 flex min-w-0 items-center gap-2 px-1" data-testid="reference-pdf-details">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-sub" title={pdf.title}>{pdf.title}</p>
        {pdf.pageCount ? <span className="shrink-0 text-[11px] tabular-nums text-sub">{t('pdf-practice:page_count', { count: pdf.pageCount })}</span> : null}
        {teacher ? <TooltipProvider><Tooltip content={t('pdf-practice:local_pages')} side="bottom"><button type="button" aria-label={t('pdf-practice:local_pages')} className="grid size-6 shrink-0 place-items-center rounded-md text-sub hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"><Info aria-hidden className="size-3.5" /></button></Tooltip></TooltipProvider> : null}
      </div> : null}
    </div>
    <div role="tabpanel" tabIndex={0} id={`${exercise.materialId}-pdf-panel`} aria-labelledby={`${exercise.materialId}-pdf-tab`}
      hidden={tab !== 'pdf'} className={`min-h-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 ${tab === 'pdf' ? 'block' : 'hidden'}`}>
      {pdf ? <PdfReader key={`${exercise.materialId}:${pdf.materialId}`} academyId={academyId}
        materialId={pdf.materialId} exerciseMaterialId={exercise.materialId} preview={preview} />
        : <div className="space-y-3 p-5"><p role="status" className="text-sm text-sub">{t('pdf-practice:unavailable')}</p><button type="button" onClick={() => { setTab('statement'); document.getElementById(`${exercise.materialId}-statement-tab`)?.focus(); }} className="rounded-lg bg-brand-soft px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/15">{t('pdf-practice:open_statement')}</button></div>}
    </div>
    <div role="tabpanel" tabIndex={0} id={`${exercise.materialId}-statement-panel`}
      aria-labelledby={`${exercise.materialId}-statement-tab`} hidden={tab !== 'statement'}
      className={`min-h-0 flex-1 overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 ${tab === 'statement' ? 'block' : 'hidden'}`}
      {...(tab === 'statement' ? surfaceProps('statement') : {})}>{children}</div>
  </div>;
}
