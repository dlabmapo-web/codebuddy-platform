'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ObservedMaterial, ObservationWork } from '@cove/shared';
import { PdfReader } from '@/components/pdf/pdf-reader';
import { VideoPlayer } from '@/components/video/video-player';
import { videoApi } from '@/lib/video-api';
import { ChoiceRich } from '@/components/manual/choice-options';
import { orpc } from '@/lib/orpc';
import { useObservationTranslation } from './use-observation-translation';

export function ObservedMaterialView({ academyId, classId, membershipId, material, work, live, alignRevision }: {
  academyId: string; classId: string; membershipId: string; material: ObservedMaterial;
  work: ObservationWork | null; live: boolean; alignRevision: number;
}) {
  const { t } = useObservationTranslation();
  const state = work ?? material.saved;
  if (material.type === 'PDF_DOCUMENT') return <ObservedPdf academyId={academyId} materialId={material.materialId} work={work} alignRevision={alignRevision} />;
  if (material.type === 'VIDEO_LESSON') return <ObservedVideo academyId={academyId} classId={classId} materialId={material.materialId} work={work} alignRevision={alignRevision} />;
  if (material.type === 'PROGRAMMING_EXERCISE') return <ObservedCode academyId={academyId} classId={classId} membershipId={membershipId} materialId={material.materialId} />;
  return <div className="grid gap-5 p-5 lg:grid-cols-2">
    <section className="rounded-xl border border-border bg-card p-5"><ChoiceRich content={material.description} scope={{ academyId, classId, materialId: material.materialId }} />
      {material.question ? <h2 className="mt-5 font-semibold">{material.question}</h2> : null}
      {material.choice ? <fieldset disabled className="mt-4 grid gap-3" aria-label={t('observation.student_answer')}>
        {material.choice.options.map(option => <label key={option.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
          <input type={material.choice!.selectionMode === 'SINGLE' ? 'radio' : 'checkbox'} checked={state?.choices?.includes(option.id) ?? false} readOnly />
          <ChoiceRich content={option.content} scope={{ academyId, classId, materialId: material.materialId }} /></label>)}
      </fieldset> : material.type !== 'TURTLE_EXERCISE' ? <textarea className="mt-4 min-h-40 w-full rounded-lg border border-border bg-canvas p-3" aria-label={t('observation.student_answer')} readOnly value={state?.answer ?? ''} /> : null}
      <p role="status" className="mt-3 text-xs text-sub">{t(work && live ? 'observation.live_response' : state ? 'observation.saved_response' : 'observation.waiting_response')}</p>
    </section>
    {material.type === 'TURTLE_EXERCISE' ? <section className="min-w-0 space-y-3" aria-label={t('observation.turtle')}>
      <p role="status" data-testid="student-execution-state">{state?.execution ?? t('observation.waiting_response')}</p>
      {Object.entries(state?.files ?? {}).map(([name, source]) => <div key={name}><h3 className="text-sm font-semibold">{name}</h3><pre className="max-h-64 overflow-auto rounded-lg bg-editor-bg p-4 text-sm text-white" data-testid="student-source">{source}</pre></div>)}
      {/* Live raster frames are in-memory data URLs and must bypass image optimization. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {state?.drawing ? <img src={state.drawing} alt={t('observation.student_drawing')} className="w-full rounded-lg border border-border bg-white" data-testid="student-drawing" /> : <p>{t('observation.waiting_drawing')}</p>}
      <pre aria-label={t('observation.student_output')} className="max-h-64 overflow-auto rounded-lg bg-editor-bg p-4 text-white">{state?.output ?? ''}</pre>
    </section> : null}
  </div>;
}

function ObservedPdf({ academyId, materialId, work, alignRevision }: { academyId: string; materialId: string; work: ObservationWork | null; alignRevision: number }) {
  const { t } = useObservationTranslation();
  const [alignment, setAlignment] = useState({ revision: alignRevision, page: work?.pdfPage });
  if (alignment.revision !== alignRevision) setAlignment({ revision: alignRevision, page: work?.pdfPage });
  return <div className="flex h-full flex-col"><p className="shrink-0 px-4 py-2 text-sm" data-testid="student-pdf-position">{t('observation.pdf_page', { page: work?.pdfPage ?? '—' })}</p>
    <div className="min-h-0 flex-1"><PdfReader academyId={academyId} materialId={materialId} observing initialPage={alignment.page} alignmentRevision={alignment.revision} /></div></div>;
}

function ObservedVideo({ academyId, classId, materialId, work, alignRevision }: {
  academyId: string; classId: string; materialId: string; work: ObservationWork | null; alignRevision: number;
}) {
  const { t } = useObservationTranslation();
  const query = useQuery({ queryKey: ['observed-video', academyId, classId, materialId], queryFn: () => videoApi.read({ academyId, materialId, classId }), retry: false });
  // Only explicit Return to live changes the staff player's position.
  const [alignment, setAlignment] = useState<{ position: number; revision: number }>();
  if (alignRevision && alignment?.revision !== alignRevision) setAlignment({ position: work?.videoPosition ?? 0, revision: alignRevision });
  return <section className="mx-auto w-full max-w-6xl space-y-4 p-5">
    <p role="status" data-testid="student-video-state">{t('observation.video_state', { position: Math.round(work?.videoPosition ?? 0), state: work?.videoState ? t(`observation.${work.videoState}`) : '—' })}</p>
    {query.data ? <VideoPlayer data={query.data} academyId={academyId} classId={classId} observing alignTo={alignment} /> : <p role={query.isError ? 'alert' : 'status'}>{t(query.isError ? 'observation.load_failed' : 'observation.loading')}</p>}
  </section>;
}
function ObservedCode(scope: { academyId: string; classId: string; membershipId: string; materialId: string }) {
  const { t } = useObservationTranslation();
  const query = useQuery({ queryKey: ['observed-code', scope], queryFn: () => orpc.monitoring.getExercisePreview(scope), retry: false });
  return <section className="p-5"><p>{t('observation.saved_response')}</p><pre className="overflow-auto rounded-lg bg-editor-bg p-5 text-white">{query.data?.studentCode ?? query.data?.exercise.starterCode ?? ''}</pre></section>;
}
