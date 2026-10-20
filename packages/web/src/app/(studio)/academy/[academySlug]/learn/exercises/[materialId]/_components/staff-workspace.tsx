'use client';
import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Code2, LogOut, Maximize2, Pencil, Users, History } from 'lucide-react';
import { workspaceMaterialSequence, type LearnExerciseBootstrap } from '@cove/shared';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { RichTextFrame } from '@/components/studio/rich-text-frame';
import { ExerciseReferencePane } from '@/components/pdf/exercise-reference-pane';
import { WorkspaceCurriculumNavigator } from '@/components/workspace/curriculum-navigator';
import { CurriculumTrigger } from '@/components/workspace/curriculum-trigger';
import { ProblemStatement } from '@/components/workspace/problem-statement';
import { usePythonRunner } from '@/lib/workspace/use-python-runner';
import { useSampleRunner, type SampleRun } from '@/lib/workspace/use-sample-runner';
import { useSplitPane } from '@/lib/workspace/use-split-pane';
import { useNavigatorPanel } from '@/lib/workspace/use-navigator-panel';
import { routes } from '@/lib/routes';
import { orpc } from '@/lib/orpc';
import type { ExerciseSolutionEntry } from '@cove/shared';
import { useDraftAutosave } from '../_hooks/use-draft-autosave';
import { usePracticeSubmission } from '../_hooks/use-practice-submission';
import { usePythonErrorLines } from '../_lib/python-error-lines';
import { EditorPane, type OutputTab } from './editor-pane';
import { NavButton } from './workspace-header';
import { ResultPanel } from './result-panel';

/** Personal practice mounts no student sessions, presence, collaboration, feedback or points hooks. */
export function StaffWorkspace({ academyId, bootstrap, userId }: {
  academyId: string; bootstrap: LearnExerciseBootstrap; userId: string;
}) {
  const { t } = useTranslation('practice');
  const slug = useAcademySlug();
  const router = useRouter();
  const { workspace, access } = bootstrap;
  const { exercise, breadcrumb } = workspace;
  const preview = access?.preview ?? false;
  const [solutions, setSolutions] = React.useState<ExerciseSolutionEntry[] | null>(null);
  const [solutionError, setSolutionError] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [tab, setTab] = React.useState<OutputTab>('terminal');
  const [mobile, setMobile] = React.useState<'problem' | 'code'>('problem');
  const [hints, setHints] = React.useState(0);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [activeSample, setSample] = React.useState<number | null>(null);
  const [samples, setSamples] = React.useState<SampleRun[]>([]);
  const [testing, setTesting] = React.useState(false);
  const runningBatch = React.useRef(false);
  const [navigating, setNavigating] = React.useState(false);
  const formatError = usePythonErrorLines();
  const runner = usePythonRunner({ formatError });
  const sampleRunner = useSampleRunner(runner);
  const { open: panelOpen, toggle: togglePanel, close: closePanel, panelId, triggerRef } = useNavigatorPanel('staff-practice-curriculum', false);
  const { size, containerRef, dividerProps } = useSplitPane({
    axis: 'horizontal', initial: exercise.hasReferencePdf ? 45 : 40, min: 25, max: 65,
  });
  const draft = useDraftAutosave({
    academyId, materialId: exercise.materialId, classId: 'staff-practice',
    // Separate IndexedDB identity from the same person's student buffer.
    userId: `${userId}:staff-practice${preview ? `:preview:${exercise.gradingRevision}` : ""}`, serverDraft: workspace.draft,
    starterCode: exercise.quiz ? '' : exercise.starterCode, practice: true, preview, gradingRevision: exercise.gradingRevision,
  });
  const submission = usePracticeSubmission(academyId, exercise.materialId, preview, exercise.gradingRevision, access?.canSubmit);
  const busy = runner.running || submission.submitting || testing || navigating;
  const coursePath = `${routes.academy(slug)}/learn/courses/${breadcrumb.course.id}`;
  const editPath = `${routes.academy(slug)}/content/courses/${breadcrumb.course.id}/lectures/${breadcrumb.lecture.id}/exercises/${exercise.materialId}${preview ? "?practicePreview=true" : "?practice=true"}`;
  const ordered = workspaceMaterialSequence(bootstrap.navigator);
  const position = ordered.findIndex((item) => item.materialId === exercise.materialId) + 1;
  async function navigate(id: string) {
    if (busy) return;
    setNavigating(true);
    await draft.flushWithoutPromoting();
    const destination = ordered.find((item) => item.materialId === id);
    router.push(routes.academyLearnMaterial(slug, id, destination?.type ?? 'PROGRAMMING_EXERCISE', preview ? { preview: true } : undefined));
  }
  async function runSample(index: number) {
    const sample = exercise.sampleTestCases[index];
    if (!sample) return;
    setTab('terminal'); setSample(index);
    try {
      return await sampleRunner.runSample(draft.code, sample, index, {
        sampleCount: exercise.sampleTestCases.length,
        gradingMode: exercise.gradingMode, inputPromptPolicy: exercise.inputPromptPolicy,
      });
    } finally { setSample(null); }
  }
  async function runAll() {
    if (busy) return;
    setTesting(true); setSamples([]); runningBatch.current = true;
    try {
      for (let i = 0; i < exercise.sampleTestCases.length && runningBatch.current; i++) {
        const result = await runSample(i);
        if (result) setSamples((current) => [...current, result]);
      }
    } finally { setTesting(false); runningBatch.current = false; }
  }
  function submit() { draft.flushNow(); setTab('result'); void submission.submit(draft.code); }
  React.useEffect(() => () => { runningBatch.current = false; }, []);
  return <div ref={rootRef} className="relative flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
    <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <CurriculumTrigger compact ref={triggerRef} onToggle={togglePanel} open={panelOpen} panelId={panelId} path={bootstrap.navigator.path} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-sub">{breadcrumb.course.title} <span className="px-1 text-border">/</span> {breadcrumb.lecture.title}</p>
        <h1 className="truncate text-sm font-bold">{exercise.title}</h1>
      </div>
      <span className="hidden items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand sm:inline-flex"><Code2 className="size-3.5" />{t('label')}</span>
      <button type="button" aria-label={t('history')} aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)} className="inline-flex items-center gap-1.5 rounded-lg p-2 text-sub hover:bg-accent"><History className="size-4" />{submission.history[0]?.score != null ? <span className="hidden text-xs font-semibold tabular-nums sm:inline" title={t('last_score', { score: submission.history[0].score })}>{submission.history[0].score}/100</span> : null}</button>
      {access?.canParticipateAsStudent ? <Link href={routes.academyLearnExercise(slug, exercise.materialId, { mode: 'student' })} onClick={() => draft.flushNow()} className="rounded-lg border border-border px-2 py-1.5 text-xs font-semibold text-sub">{t('learn_as_student')}</Link> : null}
      {access?.canViewSolutions ? <button type="button" className="hidden rounded-lg px-2 py-1.5 text-xs font-semibold text-sub hover:text-brand lg:block" onClick={() => {
        setSolutionError(false);
        void orpc.academyCourses.getExerciseSolution({ academyId, courseId: breadcrumb.course.id, lectureId: breadcrumb.lecture.id, materialId: exercise.materialId }).then((result) => setSolutions(result.solutions)).catch(() => setSolutionError(true));
      }}>{t('solutions')}</button> : null}
      {access?.canReview && !access.canAuthor ? <Link href={editPath} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-sub hover:text-brand">{t('review')}</Link> : null}
      {access?.canAuthor ? <Link href={editPath} onClick={() => draft.flushNow()} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:border-brand hover:text-brand"><Pencil className="size-3.5" />{t('edit')}</Link> : null}
      {access?.canObserve ? <Link href={`${routes.academy(slug)}/teach/classes`} className="hidden items-center gap-1.5 px-2 text-xs text-sub hover:text-brand md:inline-flex"><Users className="size-4" />{t('observe')}</Link> : null}
      <Link href={coursePath} onClick={() => draft.flushNow()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand hover:bg-brand-deep"><LogOut className="size-3.5" />{t('leave')}</Link>
    </header>
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-brand/15 bg-brand-soft px-4 py-2 text-xs text-brand" role="note">
      <span className="font-bold sm:hidden">{t('label')}</span><span>{t('notice')}</span>
      <span className="ml-auto" aria-live="polite">{draft.saveState !== 'idle' ? t(`save.${draft.saveState}`) : null}</span>
      {(draft.saveState === 'error' || draft.saveState === 'conflict') ? <button className="underline" type="button" onClick={() => {
        const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([draft.code], { type: 'text/plain' })); link.download = 'practice.py'; link.click(); URL.revokeObjectURL(link.href);
      }}>{t('download')}</button> : null}
    </div>
    {workspace.draft?.gradingRevision !== undefined && workspace.draft.gradingRevision !== exercise.gradingRevision ? <p role="status" className="border-b border-warning/25 bg-warning/5 px-4 py-2 text-xs text-warning">{t('revision_changed')}</p> : null}
    {preview ? <p role="status" className="border-b border-warning/25 bg-warning/5 px-4 py-2 text-xs font-semibold text-warning">{t('preview')}</p> : null}
    {solutionError ? <p role="alert" className="p-3 text-sm text-danger">{t('solution_error')}</p> : null}
    {solutions ? <section className="max-h-64 shrink-0 overflow-auto border-b border-border bg-card p-4"><div className="flex justify-between"><h2 className="font-bold">{t('solutions')}</h2><button type="button" onClick={() => setSolutions(null)}>{t('close')}</button></div>{solutions.length ? solutions.map((solution, index) => <details key={index} className="mt-2 rounded-lg border border-border p-3"><summary>{solution.title ?? t('solution_n', { number: index + 1 })}</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap font-mono text-xs">{solution.code}</pre></details>) : <p className="mt-2 text-sm text-sub">{t('no_solutions')}</p>}</section> : null}
    {historyOpen ? <section className="max-h-44 shrink-0 overflow-auto border-b border-border bg-card px-4 py-3" aria-label={t('history')}>
      <h2 className="mb-2 text-xs font-bold">{t('history')}</h2>
      {!submission.history.length ? <p className="text-xs text-sub">{t('history_empty')}</p> : submission.history.map((attempt) => <button key={attempt.submissionId} type="button" disabled={busy} onClick={() => { void submission.select(attempt.submissionId); setTab('result'); }} className="mr-2 mb-2 rounded-lg border border-border px-3 py-2 text-xs hover:border-brand disabled:opacity-50">{new Date(attempt.createdAt).toLocaleString()} · {attempt.score ?? '—'}</button>)}
    </section> : null}
    <div className="flex shrink-0 border-b border-border bg-card p-1 md:hidden">{(['problem', 'code'] as const).map((value) => <button type="button" key={value} onClick={() => setMobile(value)} className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold ${mobile === value ? 'bg-brand-soft text-brand' : 'text-sub'}`}>{t(value)}</button>)}</div>
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <WorkspaceCurriculumNavigator context={bootstrap.navigator} displayedMaterialId={exercise.materialId} disabled={busy}
        busyMaterialId={null} error={false} footer={{ href: coursePath, label: t('course') }} onClose={closePanel}
        onRetry={() => router.refresh()} onSelect={(id) => void navigate(id)} open={panelOpen} panelId={panelId} />
      {exercise.quiz ? <main className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <RichTextFrame title={exercise.title} content={exercise.description} />
          <fieldset disabled={submission.submitting} className="space-y-3"><legend className="mb-3 text-sm font-semibold">{t('choose')}</legend>
            {exercise.quiz.choices.map((choice) => <label key={choice.id} className="flex cursor-pointer gap-3 rounded-xl border border-border bg-card p-4 has-checked:border-brand has-checked:bg-brand-soft"><input type="radio" name="practice-answer" value={choice.id} checked={draft.code === choice.id} onChange={() => draft.setCode(choice.id)} /><span>{choice.text}</span></label>)}
          </fieldset>
          <button type="button" disabled={!draft.code || submission.submitting || !access?.canSubmit} onClick={submit} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand disabled:opacity-50">{t('submit')}</button>
          <ResultPanel submission={submission} />
        </div>
      </main> : <div ref={containerRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <section className={`@container min-w-0 overflow-y-auto bg-card md:block md:flex-none ${mobile === 'problem' ? 'flex-1' : 'hidden'}`} style={{ flexBasis: `${size}%` }}>
          <ExerciseReferencePane key={exercise.materialId} academyId={academyId} exercise={exercise} teacher preview={preview}>
            <ProblemStatement exercise={exercise} revealedHints={hints} onRevealHint={() => setHints((count) => Math.min(count + 1, exercise.hints.length))} />
          </ExerciseReferencePane>
        </section>
        <div aria-hidden className="hidden w-1 shrink-0 cursor-col-resize bg-border hover:bg-brand/40 md:block" {...dividerProps} />
        <section className={`min-w-0 flex-1 flex-col ${mobile === 'code' ? 'flex' : 'hidden'} md:flex`}>
          <EditorPane code={draft.code} onCodeChange={draft.setCode} runner={runner} submission={submission}
            sampleTestCases={exercise.sampleTestCases} activeSample={activeSample} testingSamples={testing} sampleResults={samples} sampleRunFailed={false}
            onReset={() => { if (draft.code !== exercise.starterCode && window.confirm(t('reset_confirm'))) { draft.resetTo(exercise.starterCode); runner.clear(); submission.reset(); } }}
            onSubmit={submit} canSubmit={access?.canSubmit ?? false} onRun={() => { setTab('terminal'); setSamples([]); void runner.run(draft.code); }}
            onRunSample={(index) => { void runSample(index); }} onRunAll={() => { void runAll(); }}
            onStop={() => { runningBatch.current = false; runner.stop(); }} tab={tab} />
        </section>
      </div>}
    </div>
    <footer className="flex h-12 shrink-0 items-center justify-center gap-4 border-t border-border bg-card px-4">
      <NavButton direction="previous" disabled={busy || !workspace.neighbors.previous} label={t('previous')} onClick={() => { if (workspace.neighbors.previous) void navigate(workspace.neighbors.previous.materialId); }} />
      <span className="text-xs font-semibold tabular-nums text-sub">{position} / {ordered.length}</span>
      <NavButton direction="next" disabled={busy || !workspace.neighbors.next} label={t('next')} onClick={() => { if (workspace.neighbors.next) void navigate(workspace.neighbors.next.materialId); }} />
      <button type="button" className="absolute right-4 rounded-lg p-2 text-sub hover:bg-accent" aria-label={t('fullscreen')} onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void rootRef.current?.requestFullscreen(); }}><Maximize2 className="size-4" /></button>
    </footer>
  </div>;
}
