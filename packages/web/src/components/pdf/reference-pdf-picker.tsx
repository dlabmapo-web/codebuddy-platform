'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { orpc } from '@/lib/orpc';
import { courseTreeQueryKey } from '@/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_lib/course-tree';
import { PdfAuthorDialog } from './pdf-author-dialog';

export function ReferencePdfPicker({ target, value, disabled, onChange }: {
  target: { academyId: string; courseId: string; lectureId: string };
  value?: string | null; disabled: boolean; onChange: (id: string | null) => void;
}) {
  const { t } = useTranslation(['content', 'pdf-practice']);
  const [adding, setAdding] = useState(false);
  const [retained, setRetained] = useState(false);
  const [editing, setEditing] = useState<string>();
  const query = useQuery({ queryKey: courseTreeQueryKey(target.academyId, target.courseId),
    queryFn: () => orpc.academyCourses.getTree({ academyId: target.academyId, courseId: target.courseId }) });
  const materials = query.data?.modules.flatMap(m => m.lectures).find(l => l.id === target.lectureId)?.materials ?? [];
  const documents = materials.filter(m => m.pdfDocument);
  const edit = documents.find(m => m.id === editing);
  return <section className="space-y-3 rounded-xl border border-border bg-card p-5">
    <label className="block space-y-2 text-sm font-bold">
      <span>{t('pdf-practice:label')}</span>
      <select className="block w-full rounded-lg border border-border bg-canvas p-3"
        disabled={disabled || query.isPending || query.isError} value={value ?? ''}
        onChange={event => onChange(event.target.value || null)}>
        <option value="">{t('pdf-practice:none')}</option>
        {documents.map(m => <option key={m.id} value={m.id} disabled={m.pdfDocument!.placement === 'MAIN'}>
          {m.title} · {m.pdfDocument!.originalFilename} · {m.pdfDocument!.pageCount}p · {(m.pdfDocument!.byteSize / 1e6).toFixed(2)} MB · {t(`pdf.placements.${m.pdfDocument!.placement}`)}
          {m.pdfDocument!.placement === 'MAIN' ? ` · ${t('pdf-practice:main_only')}` : !m.isVisible ? ` · ${t('pdf-practice:hidden')}` : ''}
        </option>)}
        {value && !documents.some(m => m.id === value) ? <option value={value}>{t('pdf-practice:unavailable')}</option> : null}
      </select>
    </label>
    <p className="text-sm text-sub">{t('pdf-practice:description')}</p>
    <p className="text-xs text-sub">{t('pdf-practice:same_lecture')}</p>
    {query.isError ? <button type="button" className="text-sm text-brand" onClick={() => void query.refetch()}>{t('pdf-practice:retry')}</button> : null}
    {!disabled ? <div className="flex flex-wrap gap-3">
      <button type="button" className="text-sm font-semibold text-brand" onClick={() => setAdding(true)}>{t('pdf-practice:add')}</button>
      {documents.filter(m => m.pdfDocument!.placement === 'MAIN').map(m => <button key={m.id} type="button" className="text-sm text-brand" onClick={() => setEditing(m.id)}>{t('pdf.edit')} · {m.title}</button>)}
    </div> : null}
    {retained ? <p role="status" className="text-xs text-sub">{t('pdf-practice:retained')}</p> : null}
    {adding ? <PdfAuthorDialog target={target} editable initialPlacement="SUPPLEMENTARY" onClose={() => setAdding(false)}
      onSaved={async result => { await query.refetch(); onChange(result.materialId); setRetained(true); }} /> : null}
    {edit ? <PdfAuthorDialog target={target} material={edit} referringExercises={materials.filter(m => m.programmingExercise?.referencePdfMaterialId === edit.id)} editable onClose={() => setEditing(undefined)}
      onSaved={async () => { await query.refetch(); }} /> : null}
  </section>;
}
