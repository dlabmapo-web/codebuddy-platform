'use client';
import { useState, useRef, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ObservedMaterial, ObservationWork } from '@cove/shared';
import { PdfReader } from '@/components/pdf/pdf-reader';
import { VideoPlayer } from '@/components/video/video-player';
import { videoApi } from '@/lib/video-api';
import { BookOpen, ListChecks, FileCode2, Play, Square, Terminal, Turtle, Expand } from 'lucide-react';
import { RichTextFrame } from '@/components/studio/rich-text-frame';
import { WrittenAnswerCard } from '@/components/manual/assessment-ui';
import { DrawingLayoutControl, DrawingIconButton } from '@/components/manual/drawing-panel-controls';
import { WorkspaceResizeHandle } from '@/components/manual/workspace-resize-handle';
import { useManualTranslation } from '@/components/manual/use-manual-translation';
import { executionTranslationKey } from '@/components/manual/execution-state';
import { surfaceProps, anchorProps } from '@/lib/monitoring/awareness/surfaces';
import styles from '@/components/manual/manual-workspace.module.css';
import { ObservedSourceEditor } from './observed-source-editor';
import { TerminalLines } from '@/components/manual/terminal-lines';
import { ChoiceOptions, ChoiceRich } from '@/components/manual/choice-options';
import { useObservationTranslation } from './use-observation-translation';

export function ObservedMaterialView({ academyId, classId, material, work, live, alignRevision, lastSeen }: {
  academyId: string; classId: string; membershipId: string; material: ObservedMaterial;
  work: ObservationWork | null; live: boolean; alignRevision: number; lastSeen?: boolean;
}) {
  const state = work ?? material.saved ?? (material.type === 'TURTLE_EXERCISE' && material.files ? { files: material.files, entryPoint: material.entryPoint } : null);
  if (material.type === 'PDF_DOCUMENT') return <ObservedPdf academyId={academyId} materialId={material.materialId} work={work} alignRevision={alignRevision} lastSeen={lastSeen ?? false} />;
  if (material.type === 'VIDEO_LESSON') return <ObservedVideo academyId={academyId} classId={classId} materialId={material.materialId} work={work} alignRevision={alignRevision} lastSeen={lastSeen ?? false} />;
  // Coding always uses the full LiveWorkspace, including saved previews.
  if (material.type === 'PROGRAMMING_EXERCISE') return null;
  return <ObservedManual material={material} work={state} live={Boolean(work && live)} alignRevision={alignRevision} lastSeen={lastSeen ?? false} academyId={academyId} classId={classId} />;

}

function ObservedPdf({ academyId, materialId, work, alignRevision, lastSeen }: { academyId: string; materialId: string; work: ObservationWork | null; alignRevision: number; lastSeen: boolean }) {
  const { t } = useObservationTranslation();
  const [alignment, setAlignment] = useState({ revision: alignRevision, page: lastSeen ? undefined : work?.pdfPage, pending: lastSeen || !work?.pdfPage });
  if (!lastSeen && work?.pdfPage && (alignment.revision !== alignRevision || alignment.pending)) setAlignment({ revision: alignRevision, page: work.pdfPage, pending: false });
  return <div className="flex h-full flex-col"><p className="shrink-0 px-4 py-2 text-sm" data-testid="student-pdf-position">{lastSeen ? <span className="mr-2 text-sub">{t('observation.last_response')} ·</span> : null}{t('observation.pdf_page', { page: work?.pdfPage ?? '—' })}</p>
    <div className="min-h-0 flex-1"><PdfReader academyId={academyId} materialId={materialId} observing initialPage={alignment.page} alignmentRevision={alignment.revision} /></div></div>;
}

function ObservedVideo({ academyId, classId, materialId, work, alignRevision, lastSeen }: {
  academyId: string; classId: string; materialId: string; work: ObservationWork | null; alignRevision: number; lastSeen: boolean;
}) {
  const { t } = useObservationTranslation();
  const query = useQuery({ queryKey: ['observed-video', academyId, classId, materialId], queryFn: () => videoApi.read({ academyId, materialId, classId }), retry: false });
  // Only explicit Return to live changes the staff player's position.
  const [alignment, setAlignment] = useState<{ position: number; revision: number }>();
  if (!lastSeen && work && alignRevision && alignment?.revision !== alignRevision) setAlignment({ position: work?.videoPosition ?? 0, revision: alignRevision });
  return <section className="mx-auto w-full max-w-6xl space-y-4 p-5">
    <p role="status" data-testid="student-video-state">{lastSeen ? <span className="mr-2 text-sub">{t('observation.last_response')} ·</span> : null}{t('observation.video_state', { position: Math.round(work?.videoPosition ?? 0), state: work?.videoState ? t(`observation.${work.videoState}`) : '—' })}</p>
    {query.data ? <VideoPlayer data={query.data} academyId={academyId} classId={classId} observing alignTo={alignment} /> : <p role={query.isError ? 'alert' : 'status'}>{t(query.isError ? 'observation.load_failed' : 'observation.loading')}</p>}
  </section>;
}
function ObservedManual({ material, work, live, alignRevision, academyId, classId, lastSeen }: {
  material: ObservedMaterial; work: ObservationWork | null; live: boolean;
  alignRevision: number; academyId: string; classId: string; lastSeen: boolean;
}) {
  const { t } = useObservationTranslation(); const { t: mt } = useManualTranslation();
  const drawing = material.type === 'TURTLE_EXERCISE';
  const instructions = drawing || Boolean(material.description.replace(/<[^>]*>/g, '').trim() || /<(?:img|video|iframe)\b/i.test(material.description));
  return <div className="flex min-h-0 flex-1 flex-col" data-testid="observed-manual-workspace">
    <div role="status" className="flex shrink-0 items-center gap-2 border-b border-border bg-brand-soft/40 px-4 py-1.5 text-xs font-semibold text-brand">
      <ListChecks aria-hidden className="size-4" />{mt(material.automaticallyGraded ? 'automatic_graded' : 'teacher_graded').replace(/\s*·\s*$/, '')} · {mt(material.includeInScore ? 'included_in_score' : 'excluded_from_score')}
    </div>
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${drawing ? 'md:flex-row' : 'gap-4 overflow-y-auto p-4 sm:p-6 md:flex-row md:overflow-hidden md:p-8'}`}>
      {instructions ? <aside {...surfaceProps('statement')} className={drawing ? 'max-h-[25dvh] shrink-0 overflow-auto border-b border-border bg-card p-5 md:max-h-none md:w-[32%] md:max-w-xl md:resize-x md:border-r md:border-b-0 sm:p-7' : 'min-h-48 min-w-0 shrink-0 rounded-lg border border-border bg-card p-6 md:min-h-0 md:w-[calc(50%-8px)] md:overflow-y-auto'}>
        <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sub"><BookOpen aria-hidden className="size-4" />{mt('activity_instructions')}</h2>
        {material.choice ? <ChoiceRich content={material.description} scope={{ academyId, classId, materialId: material.materialId }} /> : <div {...anchorProps('statement:instructions')}><RichTextFrame content={material.description} title={mt('activity_instructions')} /></div>}
      </aside> : null}
      {drawing ? <ObservedTurtle work={work} material={material} alignRevision={alignRevision} live={live} lastSeen={lastSeen} /> : <section className={`flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-border bg-card ${instructions ? '' : 'mx-auto w-full max-w-3xl'}`} aria-label={mt('ui.answer_workspace')}>
        <div {...surfaceProps('answer')} className="min-h-0 flex-1 overflow-y-auto">
          {material.choice ? <ChoiceOptions definition={material.choice} selected={work?.choices ?? []} disabled onChange={() => {}} scope={{ academyId, classId, materialId: material.materialId }} /> : <WrittenAnswerCard question={material.question ?? undefined} hint={material.hint} answer={work?.answer ?? ''} readOnly answerLabel={t('observation.student_answer')} onChange={() => {}} />}
        </div>
        <p role="status" className="shrink-0 border-t border-border bg-canvas/30 px-5 py-4 text-xs text-sub">{t(live ? 'observation.live_response' : lastSeen ? 'observation.last_response' : work ? 'observation.saved_response' : 'observation.waiting_response')}</p>
      </section>}
    </div>
  </div>;
}

function ObservedTurtle({ material, work, alignRevision, live, lastSeen }: { material: ObservedMaterial; work: ObservationWork | null; alignRevision: number; live: boolean; lastSeen: boolean }) {
  const { t } = useObservationTranslation(); const { t: mt } = useManualTranslation();
  const [selection, setSelection] = useState<{ revision: number; file: string | null }>({ revision: alignRevision, file: null });
  if (selection.revision !== alignRevision) setSelection({ revision: alignRevision, file: null });
  const files = work?.files ?? {};
  const current = selection.file ?? work?.activeFile ?? work?.entryPoint ?? material.entryPoint ?? Object.keys(files)[0] ?? 'main.py';
  const [layout, setLayout] = useState('below'); const [share, setShare] = useState(40);
  const [tab, setTab] = useState('code'); const drawing = useRef<HTMLDivElement>(null);
  return <section aria-label={mt('ui.answer_workspace')} data-testid="observed-turtle-workspace" data-layout={layout} data-tab={tab}
    style={{ '--editor-track': `${share}fr`, '--result-track': `${100 - share}fr` } as CSSProperties} className={styles.workspace}>
    <div className={`${styles.files} flex min-h-11 items-center overflow-x-auto border-b border-border bg-editor-bg text-sm text-white/70`}>
      {Object.keys(files).map(file => <button key={file} type="button" aria-pressed={current === file} onClick={() => setSelection({ revision: alignRevision, file })}
        className="inline-flex h-11 shrink-0 items-center gap-2 border-r border-b-2 border-r-white/10 border-b-transparent px-4 text-sm aria-pressed:border-b-brand aria-pressed:bg-white/5 aria-pressed:text-white">
        <FileCode2 aria-hidden className="size-4 text-brand" />{file}{file === work?.activeFile && current !== file ? <span aria-hidden className="size-1.5 rounded-full bg-peer" /> : null}
      </button>)}
      <span className="ml-auto px-3 text-xs">{t('observation.read_only')}</span>
    </div>
    <div className={styles.editor}><ObservedSourceEditor code={files[current] ?? ''} file={current} /></div>
    <div className={`${styles.controls} flex min-h-12 flex-wrap items-center gap-2 border-y border-border bg-card px-3 py-1.5`}>
      <button disabled type="button" className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand opacity-50"><Play aria-hidden className="size-3.5" />{mt('run')}</button>
      <button disabled type="button" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm opacity-50"><Square aria-hidden className="size-3.5" />{mt('stop')}</button>
      <span role="status" data-testid="student-execution-state" className="ml-auto text-xs text-sub">{lastSeen ? t('observation.last_response') : live && work?.execution && work.execution !== 'READY' ? mt(executionTranslationKey(work.execution)) : t('observation.waiting_response')}</span>
    </div>
    <div role="tablist" aria-label={mt('workspace_panels')} className={`${styles.tabs} flex gap-4 border-b border-border p-2 md:hidden`}>
      {(['code', 'drawing', 'terminal'] as const).map(item => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{mt(item)}</button>)}
    </div>
    <WorkspaceResizeHandle value={share} onChange={setShare} />
    <div className={styles.results}>
      <div ref={drawing} {...surfaceProps('drawing')} className={`${styles.drawing} bg-white`}>
        <div className="flex min-h-11 shrink-0 items-center gap-1 border-b border-border bg-card px-3 text-xs">
          <strong className="mr-auto font-semibold">{mt('drawing')}</strong><DrawingLayoutControl value={layout} onChange={setLayout} />
          <DrawingIconButton label={mt('expand_drawing')} onClick={() => void drawing.current?.requestFullscreen?.().catch(() => {})}><Expand aria-hidden /></DrawingIconButton>
        </div>
        <div className="grid min-h-0 flex-1 place-items-center overflow-hidden">
          {/* Actual transient raster frames bypass image optimization. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {work?.drawing ? <img {...anchorProps('drawing:canvas')} src={work.drawing} alt={t('observation.student_drawing')} data-testid="student-drawing" className="max-h-full max-w-full object-contain" /> : <div className="grid justify-items-center gap-3 p-4 text-center text-slate-500"><Turtle aria-hidden className="size-9 text-slate-300" /><p className="text-xs">{t('observation.waiting_drawing')}</p></div>}
        </div>
      </div>
      <section {...surfaceProps('terminal')} className={`${styles.terminal} bg-editor-bg text-white`} aria-label={t('observation.student_output')}>
        <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-white/10 px-3 text-xs font-semibold text-white/65"><Terminal aria-hidden className="size-3.5" />{mt('terminal')}</div>
        <pre data-testid="turtle-terminal" className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed"><TerminalLines output={work?.output || (work?.execution === 'READY' ? mt('code_not_run') : '')} /></pre>
        <input readOnly disabled aria-label={mt('terminal_input')} placeholder={mt('terminal_input')} className="w-full border-t border-white/15 bg-transparent px-3 py-2.5 text-xs opacity-40" />
      </section>
    </div>
  </section>;
}
