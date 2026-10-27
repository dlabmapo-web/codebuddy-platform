'use client';

import { FileText } from 'lucide-react';
import { ChoiceSelector } from '@/components/studio/choice-selector';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { orpc } from '@/lib/orpc';
import { courseOutlineQueryKey } from '@/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/_lib/course-tree';
import { PdfAuthorDialog } from './pdf-author-dialog';

export function ReferencePdfPicker({ target, value, disabled, onChange, onTitleAvailable }: {
  target: { academyId: string; courseId: string; lectureId: string };
  value?: string | null; disabled: boolean; onChange: (id: string | null) => void;
  onTitleAvailable?: (title: string) => void;
}) {
  const { t, i18n } = useTranslation(['content', 'pdf-practice']);
  const [adding, setAdding] = useState(false);
  const [retained, setRetained] = useState(false);
  const [editing, setEditing] = useState<string>();
  const query = useQuery({ queryKey: courseOutlineQueryKey(target.academyId, target.courseId),
    queryFn: () => orpc.academyCourses.getOutline({ academyId: target.academyId, courseId: target.courseId }) });
  const materials = query.data?.modules.flatMap(m => m.lectures).find(l => l.id === target.lectureId)?.materials ?? [];
  const documents = materials.filter(m => m.pdfDocument);
  const edit = documents.find(m => m.id === editing);
  const selected = documents.find((material) => material.id === value);
  useEffect(() => {
    if (selected?.title) onTitleAvailable?.(selected.title);
  }, [selected?.title, onTitleAvailable]);
  function fileSize(bytes: number) {
    const format = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
    return bytes < 1024 ? `${format.format(bytes)} B` : bytes < 1024 * 1024 ? `${format.format(bytes / 1024)} KB` : `${format.format(bytes / (1024 * 1024))} MB`;
  }
  const options = [
    { id: '', name: t('pdf-practice:none'), disabled: false, description: '' },
    ...documents.map((material) => ({ id: material.id, name: material.title,
      disabled: material.pdfDocument!.placement === 'MAIN',
      description: [material.pdfDocument!.originalFilename,
        t('pdf-practice:page_count', { count: material.pdfDocument!.pageCount }),
        fileSize(material.pdfDocument!.byteSize),
        t(`pdf.placements.${material.pdfDocument!.placement}`),
        material.pdfDocument!.placement === 'MAIN' ? t('pdf-practice:main_only') : !material.isVisible ? t('pdf-practice:hidden') : '',
      ].filter(Boolean).join(' · '),
    })),
    ...(value && !selected ? [{ id: value, name: t('pdf-practice:unavailable'), disabled: true, description: '' }] : []),
  ];
  return <section className="space-y-4 rounded-xl border border-border bg-card p-5">
    <div className="flex items-center gap-2 text-sm font-bold"><FileText aria-hidden className="size-4 text-brand" /><h2>{t('pdf-practice:label')}</h2></div>
    {disabled ? selected?.pdfDocument ? <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-border bg-canvas p-4">
      <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-brand/15 bg-brand-soft text-brand"><FileText aria-hidden className="size-5" /></div>
      <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-ink">{selected.title}</p><p className="mt-1 break-all text-xs text-sub">{selected.pdfDocument.originalFilename}</p></div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-sub"><span>{t('pdf-practice:page_count', { count: selected.pdfDocument.pageCount })}</span><span aria-hidden>·</span><span>{fileSize(selected.pdfDocument.byteSize)}</span><span className="rounded-md border border-border bg-card px-2 py-1 font-medium">{t(`pdf.placements.${selected.pdfDocument.placement}`)}</span></div>
    </div> : <p className="text-sm text-sub">{query.isPending ? t('pdf-practice:loading') : value ? t('pdf-practice:unavailable') : t('pdf-practice:none')}</p>
      : <ChoiceSelector label={t('pdf-practice:label')} list={options} selectedId={value ?? ''} disabled={query.isPending || query.isError} onSelect={(item) => onChange(item.id || null)}
        renderItem={(item) => <span className="block min-w-0"><span className="block break-words font-semibold">{item.name}</span>{item.description ? <span className="mt-1 block break-words text-xs font-normal leading-5 text-sub">{item.description}</span> : null}</span>} />}
    {!disabled ? <p className="text-xs leading-5 text-sub">{t('pdf-practice:same_lecture')}</p> : null}
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
