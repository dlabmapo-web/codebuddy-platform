'use client';

import { languageReferenceUrl, meaningfulChoiceHtml, type ExamItemContent, type ExamShellItem, type ExerciseLanguage, type LearnExercise, type LearnSampleTestCase } from '@cove/shared';
import { BookOpen, Lightbulb, RotateCcw, Send } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { CodeEditor } from '@/components/editor/code-editor';
import { FontSizeControls } from '@/components/workspace/font-size-controls';
import { LanguageTag } from '@/components/workspace/language-tag';
import { ProblemStatement } from '@/components/workspace/problem-statement';
import { ResetConfirmDialog } from '@/components/workspace/reset-confirm-dialog';
import { RunControls } from '@/components/workspace/run-controls';
import { TerminalPanel } from '@/components/workspace/terminal-panel';
import { useLayoutTranslation } from '@/i18n';
import { languageLabelKey, monacoLanguageFor } from '@/lib/workspace/exercise-language';
import { STATEMENT_PANE } from '@/lib/workspace/statement-canvas';
import { useEditorPreferences } from '@/lib/workspace/use-editor-preferences';
import { useSplitPane } from '@/lib/workspace/use-split-pane';
import { ChoiceRich } from '@/components/manual/choice-options';
import { RichTextFrame } from '@/components/studio/rich-text-frame';
import { formatExamDate } from '@/components/exam/exam-format';
import { useErrorText } from '@/i18n/client/use-error-text';
import { toApiError } from '@/lib/api-errors';
import { orpc } from '@/lib/orpc';
import { usePythonRunner } from '@/lib/workspace/use-python-runner';
import { useSampleRunner } from '@/lib/workspace/use-sample-runner';
import { useStudentPresence } from '@/lib/monitoring/student-presence';
import { useStudentMonitoring } from '@/lib/monitoring/use-student-monitoring';
import { surfaceProps } from '@/lib/monitoring/awareness/surfaces';
import { RemotePointer } from '@/components/monitoring/remote-pointer';
import { MonitoringIndicator } from '../../../exercises/[materialId]/_components/monitoring-indicator';

type Props = {
  academyId: string;
  attemptId: string;
  classId: string;
  courseId: string;
  item: ExamShellItem;
  readOnly: boolean;
  /** Code problems link to the language reference (a test setting). */
  languageReference?: boolean;
  onSubmitted: (materialId: string, submittedAt: Date) => void;
  onEnded: () => void;
};

/** One problem inside an attempt: its content from `exam.item`, its own 제출. */
export function ExamItemView(props: Props) {
  const { t } = useTranslation('exam');
  const [content, setContent] = React.useState<ExamItemContent | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    orpc.exam.item({ academyId: props.academyId, attemptId: props.attemptId, materialId: props.item.materialId })
      .then((value) => { if (active) { setContent(value); setFailed(false); } })
      .catch((error: unknown) => {
        if (!active) return;
        if (toApiError(error).code === 'EXAM_ENDED') props.onEnded();
        setFailed(true);
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.academyId, props.attemptId, props.item.materialId, attempt]);

  if (failed) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-[14px] font-semibold text-sub">{t('mode.load_failed')}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-3 rounded-lg border border-border px-4 py-2 text-[13px] font-semibold hover:bg-surface">{t('mode.retry')}</button>
        </div>
      </div>
    );
  }
  if (!content) return <div className="grid h-full place-items-center text-[13px] text-sub">{t('mode.loading')}</div>;
  if (content.type === 'CODE') return <CodeItem {...props} content={content} />;
  return <AnswerItem {...props} content={content} />;
}

/**
 * Multiple choice and short answer. There is no editor to share, so live
 * monitoring is the open-problem report alone: the teacher's roster shows
 * which problem the student is on.
 */
function AnswerItem(props: Props & { content: Exclude<ExamItemContent, { type: 'CODE' }> }) {
  const { content } = props;
  const { setOpenMaterial } = useStudentPresence();
  React.useEffect(() => {
    if (props.readOnly) return;
    return setOpenMaterial({ materialId: content.materialId, courseId: props.courseId, classId: props.classId }) ?? undefined;
  }, [content.materialId, props.classId, props.courseId, props.readOnly, setOpenMaterial]);
  return (
    <div className="h-full overflow-y-auto px-4 py-6 sm:px-8">
      <div className="mx-auto w-full max-w-[760px]">
        {content.type === 'SHORT_ANSWER' ? <ShortAnswerItem {...props} content={content} /> : <ChoiceItem {...props} content={content} />}
      </div>
    </div>
  );
}

function useSubmit({ academyId, attemptId, item, onSubmitted, onEnded }: Props) {
  const { t } = useTranslation('exam');
  const errorText = useErrorText();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submit = async (answer: Parameters<typeof orpc.exam.submit>[0]['answer']) => {
    setBusy(true);
    setError(null);
    try {
      const { submittedAt } = await orpc.exam.submit({ academyId, attemptId, materialId: item.materialId, requestKey: crypto.randomUUID(), answer });
      onSubmitted(item.materialId, new Date(submittedAt));
    } catch (caught) {
      setError(errorText(caught));
      if (toApiError(caught).code === 'EXAM_ENDED') onEnded();
    } finally {
      setBusy(false);
    }
  };
  const status = item.lastSubmittedAt ? t('mode.last_submitted', { time: formatExamDate(item.lastSubmittedAt) }) : null;
  return { busy, error, submit, status };
}

function SubmitBar({ disabled, busy, error, status, onSubmit, readOnly }: {
  disabled: boolean; busy: boolean; error: string | null; status: string | null; onSubmit: () => void; readOnly: boolean;
}) {
  const { t } = useTranslation('exam');
  return (
    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border px-5 py-3">
      {error ? <span role="alert" className="mr-auto text-[12.5px] font-semibold text-danger">{error}</span>
        : status ? <span className="mr-auto text-[12.5px] text-sub">{status}</span> : null}
      {readOnly ? null : (
        <button type="button" onClick={onSubmit} disabled={disabled || busy}
          className="h-10 min-w-[80px] rounded-md bg-brand px-5 text-[14px] font-bold text-on-brand hover:bg-brand-deep disabled:cursor-not-allowed disabled:bg-border disabled:text-sub">
          {busy ? t('mode.submitting') : t('mode.submit')}
        </button>
      )}
    </div>
  );
}

function ChoiceItem(props: Props & { content: Extract<ExamItemContent, { type: 'MULTIPLE_CHOICE' | 'QUIZ' }> }) {
  const { t } = useTranslation('exam');
  const { content, readOnly } = props;
  const { busy, error, submit, status } = useSubmit(props);
  const multiple = content.type === 'MULTIPLE_CHOICE' && content.selectionMode === 'MULTIPLE';
  const initial = content.type === 'MULTIPLE_CHOICE' ? content.lastAnswer ?? [] : content.lastAnswer ? [content.lastAnswer] : [];
  const [selected, setSelected] = React.useState<string[]>(initial);
  const options = content.type === 'MULTIPLE_CHOICE'
    ? content.options.map((option) => ({ id: option.id, html: option.content }))
    : content.choices.map((choice) => ({ id: choice.id, text: choice.text }));
  const question = content.type === 'MULTIPLE_CHOICE' ? content.question : content.title;
  const toggle = (id: string) => {
    if (readOnly) return;
    setSelected((current) => multiple ? (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]) : [id]);
  };
  const onSubmit = () => {
    if (content.type === 'MULTIPLE_CHOICE') {
      void submit({ kind: 'options', optionIds: selected, displayOrder: content.options.map((option) => option.id), contentRevision: content.contentRevision });
    } else {
      void submit({ kind: 'choice', choiceId: selected[0]! });
    }
  };
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="px-6 pb-6 pt-6">
        <h2 className="flex gap-2 text-[17px] font-bold leading-snug">
          <span className="text-brand">{t('mode.question_mark')}</span>
          <span className="min-w-0 whitespace-pre-wrap break-words">{question}</span>
        </h2>
        {meaningfulChoiceHtml(content.description) ? (
          <div className="mt-4"><RichTextFrame content={content.description} title={question} minHeight={24} fallbackHeight={80} padding={0} /></div>
        ) : null}
        <div role={multiple ? 'group' : 'radiogroup'} aria-label={question} className="mt-6 space-y-3">
          {options.map((option) => {
            const on = selected.includes(option.id);
            return (
              <button key={option.id} type="button" role={multiple ? 'checkbox' : 'radio'} aria-checked={on} onClick={() => toggle(option.id)} disabled={readOnly && !on}
                className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3.5 text-left text-[14px] transition-colors ${on ? 'border-brand bg-brand-soft' : 'border-transparent bg-surface hover:border-border'} disabled:opacity-60`}>
                <span className={`grid size-4 shrink-0 place-items-center border-2 ${multiple ? 'rounded' : 'rounded-full'} ${on ? 'border-brand' : 'border-sub'}`}>
                  {on ? <span className={`size-2 bg-brand ${multiple ? 'rounded-sm' : 'rounded-full'}`} /> : null}
                </span>
                <span className="min-w-0 flex-1">{'html' in option ? <ChoiceRich content={option.html ?? ''} /> : option.text}</span>
              </button>
            );
          })}
        </div>
      </div>
      {content.type === 'MULTIPLE_CHOICE' ? <Explanation html={content.explanation} title={question} /> : null}
      <SubmitBar disabled={selected.length === 0} busy={busy} error={error} status={status} onSubmit={onSubmit} readOnly={readOnly} />
    </section>
  );
}

/** The problem's explanation, in review after the test when the test shows them. */
function Explanation({ html, title }: { html: string | null; title: string }) {
  const { t } = useTranslation('exam');
  if (!html || !meaningfulChoiceHtml(html)) return null;
  return (
    <div className="mx-6 mb-6 rounded-xl border border-brand/30 bg-brand-soft px-5 py-4">
      <h3 className="flex items-center gap-1.5 text-[13.5px] font-bold text-brand"><Lightbulb aria-hidden className="size-4" />{t('mode.explanation')}</h3>
      <div className="mt-2"><RichTextFrame content={html} title={`${title} ${t('mode.explanation')}`} minHeight={24} fallbackHeight={80} padding={0} /></div>
    </div>
  );
}

function ShortAnswerItem(props: Props & { content: Extract<ExamItemContent, { type: 'SHORT_ANSWER' }> }) {
  const { t } = useTranslation('exam');
  const { content, readOnly } = props;
  const { busy, error, submit, status } = useSubmit(props);
  const draftKey = `cove-exam:${props.attemptId}:${content.materialId}`;
  const [answer, setAnswer] = React.useState(() => readDraft(draftKey) ?? content.lastAnswer ?? '');
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="px-6 py-6">
        <h2 className="flex gap-2 text-[17px] font-bold"><span className="text-brand">{t('mode.question_mark')}</span><span>{content.title}</span></h2>
        {meaningfulChoiceHtml(content.description) ? (
          <div className="mt-4"><RichTextFrame content={content.description.replace(/\n/g, '<br>')} title={content.title} minHeight={24} fallbackHeight={80} padding={0} /></div>
        ) : null}
        <textarea value={answer} readOnly={readOnly} maxLength={10_000}
          onChange={(event) => { setAnswer(event.target.value); writeDraft(draftKey, event.target.value); }}
          placeholder={content.placeholder || t('mode.answer_placeholder')}
          className="mt-6 h-48 w-full resize-y rounded-lg border border-border bg-surface px-4 py-3 text-[14px] outline-none focus:border-brand" />
      </div>
      <Explanation html={content.explanation} title={content.title} />
      <SubmitBar disabled={!answer.trim()} busy={busy} error={error} status={status} readOnly={readOnly}
        onSubmit={() => void submit({ kind: 'text', text: answer, contentRevision: content.contentRevision })} />
    </section>
  );
}

function CodeItem(props: Props & { content: Extract<ExamItemContent, { type: 'CODE' }> }) {
  const { t } = useLayoutTranslation(['learn', 'common']);
  const { t: te, i18n } = useTranslation('exam');
  const { content, readOnly } = props;
  const { busy, error, submit, status } = useSubmit(props);
  const draftKey = `cove-exam:${props.attemptId}:${content.materialId}`;
  const [code, setCode] = React.useState(() => readDraft(draftKey) ?? content.lastAnswer ?? content.starterCode);
  const [activeSample, setActiveSample] = React.useState<number | null>(null);
  const [resetOpen, setResetOpen] = React.useState(false);
  const language = (['PYTHON', 'C', 'CPP'].includes(content.language) ? content.language : 'PYTHON') as ExerciseLanguage;
  const python = language === 'PYTHON';
  const runner = usePythonRunner({ browserRuntime: python });
  const { runSample: checkSample } = useSampleRunner(runner);
  const { t: tm } = useTranslation('monitoring');
  const codeRef = React.useRef(code);
  React.useEffect(() => { codeRef.current = code; }, [code]);
  // Sent to a watching teacher so their statement lays out at this width and
  // both mouse arrows land on the same words.
  const [statementReadingWidth, setStatementReadingWidth] = React.useState<number | null>(null);
  // The same live monitoring as the normal workspace: the teacher sees this
  // problem in the roster, follows the editor and the terminal. Editing is
  // refused on the server for test problems, so a teacher can only watch.
  const monitoring = useStudentMonitoring({
    classId: props.classId,
    courseId: props.courseId,
    materialId: readOnly ? null : content.materialId,
    statementWidth: statementReadingWidth,
    ready: !readOnly,
    // The shared document is seeded from the server draft, so the buffer is
    // saved there before a teacher's view opens.
    onBeforeCollaborate: async () => {
      await orpc.learn.saveDraft({ academyId: props.academyId, materialId: content.materialId, code: codeRef.current }).catch(() => undefined);
    },
    onAfterCollaborate: (snapshot) => { setCode(snapshot.code); writeDraft(draftKey, snapshot.code); },
    teacherLabel: tm('peer.teacher'),
    terminal: { readTranscript: runner.readTranscript, subscribeTerminal: runner.subscribeTerminal },
  });
  const preferences = useEditorPreferences();
  // The same panes, proportions and dividers as the normal problem workspace.
  const { size: statementWidth, dragging: draggingStatement, containerRef: paneRef, dividerProps: statementDivider } =
    useSplitPane({ axis: 'horizontal', initial: STATEMENT_PANE.initialPercent, min: STATEMENT_PANE.minPercent, max: STATEMENT_PANE.maxPercent });
  const { size: outputHeight, dragging: draggingOutput, containerRef: editorRef, dividerProps: outputDivider } =
    useSplitPane({ axis: 'vertical', initial: 260, min: 80, max: 1_200 });
  const sampleTestCases: LearnSampleTestCase[] = content.samples.map((sample, index) => ({
    position: index + 1, input: sample.input, expectedOutput: sample.output, comparator: 'STDOUT',
  }));
  // ProblemStatement reads only these fields; hints and solutions never exist in a test.
  const exercise = {
    materialId: content.materialId, title: content.title, description: content.description,
    inputFormat: content.inputFormat, outputFormat: content.outputFormat, constraints: content.constraints,
    sampleTestCases, hiddenTestCaseCount: content.hiddenCount, hints: [],
  } as unknown as LearnExercise;
  const change = (value: string) => { monitoring.markActive(); setCode(value); writeDraft(draftKey, value); };
  // Each run is counted for the results' average runs; a lost count never blocks running.
  const countRun = () => {
    if (readOnly) return;
    void orpc.exam.recordRun({ academyId: props.academyId, attemptId: props.attemptId, materialId: content.materialId }).catch(() => undefined);
  };
  // The normal workspace's sample check: the run, then ✓ or ✕ against the
  // expected output, judged in the browser only where Submit grades the same way.
  const runSample = (index: number) => {
    const sample = sampleTestCases[index];
    if (!sample) return;
    setActiveSample(index);
    countRun();
    void checkSample(code, sample, index, {
      sampleCount: sampleTestCases.length,
      gradingMode: content.gradingMode,
      inputPromptPolicy: content.inputPromptPolicy,
    }).finally(() => setActiveSample(null));
  };
  return (
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden" ref={paneRef}>
      {/* Each watching teacher's mouse, as in the normal workspace. The panes
          below are marked as the same named surfaces, which is also what
          lets the student's own mouse show on the teacher's screen. */}
      {monitoring.peers.map((peer) => (
        <RemotePointer key={peer.peerId} name={peer.label ?? tm('peer.teacher')} materialId={content.materialId}
          sourceMaterialId={monitoring.pointerMaterialId} pointer={peer.pointer} />
      ))}
      <section className="@container hidden min-w-0 overflow-y-auto overflow-x-hidden bg-card md:block md:flex-none"
        style={{ flexBasis: `${statementWidth}%` }}>
        <div {...surfaceProps('statement')}>
          <ProblemStatement collaborating={monitoring.collaborating} exercise={exercise} onReadingWidth={setStatementReadingWidth} revealedHints={0} />
        </div>
      </section>
      <div aria-hidden className={`hidden w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-brand/40 md:block ${draggingStatement ? 'bg-brand/60' : ''}`}
        {...statementDivider} />
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" ref={editorRef}>
        <header className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#2d2d2d] px-3 py-1.5">
          <LanguageTag language={language} label={t(`workspace.${languageLabelKey(language)}`)} />
          <div className="ml-auto flex items-center gap-2">
            {/* Watch-only during a test, so the student is never told they are being helped. */}
            {props.languageReference ? (
              <a href={languageReferenceUrl(language, i18n.language)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-white/80 hover:bg-white/10 hover:text-white">
                <BookOpen aria-hidden className="size-3.5" />{te('mode.reference')}
              </a>
            ) : null}
            <MonitoringIndicator state={monitoring.indicator === 'HELPING' ? 'MONITORING' : monitoring.indicator} monitoringLabel={te('mode.teacher_watching')} />
            <FontSizeControls {...preferences} />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col" {...surfaceProps('editor')}>
          <CodeEditor code={code} fontSize={preferences.fontSize} language={monacoLanguageFor(language)} readOnly={readOnly} onChange={change}
            documentManaged={monitoring.collaborating} onMount={(editor) => monitoring.registerEditor(editor)} />
        </div>
        <div aria-label={t('workspace.resize_terminal')} role="separator" {...outputDivider}
          className={`relative h-3 shrink-0 touch-none select-none cursor-row-resize bg-transparent before:absolute before:inset-x-0 before:top-1/2 before:h-px before:-translate-y-1/2 before:bg-border before:transition-all hover:before:h-0.5 hover:before:bg-brand/60 ${draggingOutput ? 'before:h-0.5 before:bg-brand' : ''}`} />
        <div className="flex shrink-0 flex-col overflow-hidden bg-editor-bg" style={{ height: outputHeight }}>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 bg-[#2d2d2d] px-2 py-1">
            {readOnly ? (
              <span className="px-1 text-[12px] text-white/70">{status}</span>
            ) : (<>
              <button type="button" disabled={runner.running || busy} onClick={() => setResetOpen(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[12px] text-white disabled:opacity-50">
                <RotateCcw className="size-3" />{t('workspace.reset')}
              </button>
              {python ? (
                <RunControls activeSample={activeSample} onRun={() => { countRun(); void runner.run(code); }} onRunSample={runSample}
                  onStop={() => runner.stop()} ready={runner.ready && !busy} running={runner.running} sampleTestCases={sampleTestCases} />
              ) : null}
              <button type="button" disabled={!code.trim() || busy || runner.running} onClick={() => void submit({ kind: 'code', code })}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/20 px-2 py-1 text-[12px] text-white disabled:opacity-50">
                <Send className="size-3" />{busy ? te('mode.submitting') : t('workspace.submit')}
              </button>
              {error ? <span role="alert" className="text-[12px] text-red-300">{error}</span>
                : status ? <span className="text-[12px] text-white/70">{status}</span> : null}
            </>)}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto" role="region" aria-label={te('mode.output')} {...surfaceProps('terminal')}>
            {python ? (
              <TerminalPanel awaitingInput={runner.awaitingInput} lines={runner.lines} onEndInput={runner.endInput}
                onSubmitInput={runner.submitInput} supported={runner.supported} />
            ) : (
              <p className="p-3 font-mono text-[12px] text-[#d4d4d4]">{te('mode.run_unavailable')}</p>
            )}
          </div>
        </div>
      </section>
      <ResetConfirmDialog
        copy={{ title: t('workspace.reset'), body: t('workspace.reset_confirm'), cancel: t('common:action.cancel'), confirm: t('workspace.reset') }}
        onCancel={() => setResetOpen(false)}
        onConfirm={() => { setResetOpen(false); change(content.starterCode); }}
        open={resetOpen}
      />
    </div>
  );
}

/** Answers survive leaving the page (rule 3); the server keeps only submissions. */
function readDraft(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function writeDraft(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* private mode */ }
}
