'use client';
import { isFileBundle, formatPoints } from '@cove/shared';
import { MultiFileEditor } from '@/components/editor/multi-file-editor';
import { ProgrammingGradingPanel } from '@/components/programming-review/grading-panel';
import { monacoLanguageFor } from '@/lib/workspace/exercise-language';
import { QuizFeedback } from '@/components/workspace/quiz-feedback';

import type { TeacherReviewCase, TeacherSubmissionReview } from '@cove/shared';
import type { TFunction } from 'i18next';
import { formatDateTime } from '@cove/i18n/format';
import { ChevronRight, Lock, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { AiText } from '@/components/ai/ai-text';
import { useLocale } from '@/i18n';
import { EDITOR_FONT_FAMILY, registerPaircodeTheme } from '@/lib/monaco/theme';
import type { MonacoCodeEditor } from '@/lib/monitoring/yjs-monaco';
import { cn } from '@/lib/utils';

import { durationDisplay } from '../../../../../progress/_lib/progress-view';

const MonacoEditor = dynamic(() => import('@/lib/monaco/editor'), {
  ssr: false,
  loading: () => <span className="block h-full bg-editor-bg" />,
});

/**
 * One immutable attempt, in a workspace built for reading it.
 *
 * Read-only is structural rather than a flag: there is no draft, no session,
 * no submit path, and no mutation in this component's reach, so there is
 * nothing here that could be re-enabled by mistake. The editor takes a string.
 *
 * The header carries the frozen labels the attempt was submitted under, so a
 * course renamed last term still reads correctly, and Back returns to the
 * exact Solution status state that opened this — filters, page, and selection
 * included.
 *
 * Hidden cases contribute a count and nothing else. Their inputs and outputs
 * are absent from the payload, not hidden by the markup.
 */
export function SubmissionReview({
  review, academyId, classId,
}: {
  academyId: string; classId: string;
  review: TeacherSubmissionReview;
}) {
  const { t } = useTranslation('teach');
  const { t: ta } = useTranslation('learning-help');
  const locale = useLocale();
  const samples = review.cases.filter((item) => item.isSample);
  // What the AI teacher said, each answer with its simpler version, newest first.
  const attempt = React.useMemo(() => groupAnswers(review.aiReplies ?? []), [review.aiReplies]);
  const fromCode = React.useMemo(() => groupAnswers(review.aiCodeReplies ?? []), [review.aiCodeReplies]);
  const hasAi = attempt.length + fromCode.length > 0;
  // A reviewer opens on what the student was told about this attempt, when
  // they were told anything; otherwise on the tests.
  const [tab, setTab] = React.useState<ReviewTab>(attempt.length ? 'ai' : 'tests');
  // The line an answer names, marked in the submitted code on the left.
  const editorRef = React.useRef<MonacoCodeEditor | null>(null);
  const [editorReady, setEditorReady] = React.useState(false);
  const [focusLine, setFocusLine] = React.useState<{ line: number; seq: number } | null>(null);
  React.useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !editorReady || !focusLine) return;
    return markLine(editor, focusLine.line);
  }, [editorReady, focusLine]);
  const showLine = (line: number) => setFocusLine((current) => ({ line, seq: (current?.seq ?? 0) + 1 }));

  if (review.manualAssessment) return <div className="grid gap-5 p-4 lg:grid-cols-2">
    <section className="min-w-0 space-y-3"><h1 className="text-lg font-bold">{review.problemTitle}</h1><p className="text-sm text-sub">{review.studentName} · {formatDateTime(review.createdAt, locale, true)}</p>
      <div className="flex h-[32rem] flex-col overflow-hidden rounded-xl border border-border">{isFileBundle(review.code) && (review.language === 'C' || review.language === 'CPP') ? <MultiFileEditor code={review.code} fontSize={14} language={review.language} /> : <MonacoEditor beforeMount={registerPaircodeTheme} height="100%" language={monacoLanguageFor(review.language)} theme="paircode-dark" value={review.code} options={{readOnly: true, domReadOnly: true, minimap: {enabled: false}, automaticLayout: true, fontSize: 14}}/>}</div>
    </section>
    <ProgrammingGradingPanel key={review.submissionId} academyId={academyId} classId={classId} submissionId={review.submissionId} initial={review.manualAssessment} canPublish={review.canPublishManualReview ?? false}/>
  </div>;
  return (
    <div className="flex flex-col gap-4">
      {/* The way back is the page's `back` slot, above the heading, where
          every other detail page keeps it. */}
      <header className="rounded-card border border-border bg-card px-4 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[17px] font-extrabold leading-tight">
              {review.outlineNumber ? (
                <span className="mr-2 font-mono text-[13px] text-sub">
                  {review.outlineNumber}
                </span>
              ) : null}
              {review.problemTitle}
            </h1>
            <p className="mt-1 truncate text-[12.5px] text-sub">
              {[review.courseTitle, review.moduleTitle, review.lectureTitle].join(
                ' › ',
              )}
            </p>
            <p className="mt-1 text-[13px] font-semibold">
              {review.studentName}
            </p>
          </div>

          {/* The verdict and what the reviewer may do with it, together, so
              the panes below get the height a separate row used to take. */}
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span
              className={cn(
                'rounded-full px-3 py-1 text-[13px] font-bold',
                review.accepted
                  ? 'bg-success/10 text-success'
                  : 'bg-danger/10 text-danger',
              )}
              data-testid="review-verdict"
            >
              {review.accepted
                ? t('progress.result.accepted')
                : t('progress.result.not_accepted')}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-sub" title={t('progress.review.read_only')}>
              <Lock aria-hidden className="size-3" />
              {t('progress.review.read_only')}
            </span>
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-3 sm:grid-cols-5">
          {/* In a test the score that matters is the test's points, as its
              results count them; the problem's own 0–100 would disagree. */}
          {review.test ? (
            <Fact
              label={t('progress.review.test_points')}
              value={
                review.test.counted && review.test.scoreHundredths !== null
                  ? `${formatPoints(review.test.scoreHundredths)} / ${formatPoints(review.test.pointsHundredths)}`
                  : t('progress.review.test_not_counted')
              }
            />
          ) : (
            <Fact label={t('progress.review.score')} value={String(review.score)} />
          )}
          <Fact
            label={t('progress.review.tests')}
            value={`${review.passedCount}/${review.totalCount}`}
          />
          <Fact
            label={t('progress.review.runtime')}
            value={
              review.runtimeMs === null
                ? '—'
                : t('progress.review.runtime_value', { ms: review.runtimeMs })
            }
          />
          <Fact
            label={t('progress.review.solve_time')}
            value={durationText(review.solveElapsedSec, t)}
          />
          <Fact
            label={t('progress.review.submitted')}
            value={formatDateTime(review.createdAt, locale)}
          />
        </dl>
      </header>

      {/* Two panes of one height, each scrolling inside itself: the code stays
          beside whatever is being read about it, and the page never grows a
          column of answers below the fold. */}
      <div className="grid gap-4 lg:h-[calc(100dvh-21.5rem)] lg:min-h-[24rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {review.quiz ? <QuizFeedback quiz={review.quiz} /> : <section
          aria-label={t('progress.review.editor_label')}
          className="flex h-[26rem] flex-col overflow-hidden rounded-card border border-border lg:h-full"
        >
          <h2 className="shrink-0 border-b border-border bg-card px-4 py-2.5 text-[13px] font-bold">
            {t('progress.review.code_heading')}
          </h2>
          <div className="flex min-h-0 flex-1 flex-col">
            {isFileBundle(review.code) && (review.language === 'C' || review.language === 'CPP') ? (
              <MultiFileEditor code={review.code} fontSize={13} language={review.language} />
            ) : <MonacoEditor
              beforeMount={registerPaircodeTheme}
              height="100%"
              language={monacoLanguageFor(review.language)}
              onMount={(editor) => { editorRef.current = editor; setEditorReady(true); }}
              options={{
                automaticLayout: true,
                // Read-only and announced as such, but still focusable and
                // scrollable by keyboard: reading code is the whole task.
                domReadOnly: true,
                readOnly: true,
                ariaLabel: t('progress.review.editor_label'),
                fontFamily: EDITOR_FONT_FAMILY,
                fontSize: 13,
                lineNumbers: 'on',
                minimap: { enabled: false },
                padding: { bottom: 12, top: 12 },
                scrollBeyondLastLine: false,
                tabSize: 4,
                wordWrap: 'on',
              }}
              theme="paircode-dark"
              value={review.code}
            />}
          </div>
        </section>}

        <section className="flex min-h-[26rem] flex-col overflow-hidden rounded-card border border-border bg-card lg:min-h-0">
          <div aria-label={t('progress.review.title')} className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-2 pt-2" role="tablist">
            {hasAi ? (
              <ReviewTabButton active={tab === 'ai'} id="ai" onSelect={setTab}>
                <Sparkles aria-hidden className="size-3.5 text-brand" />{ta('teacher.tab')}
                <Count>{attempt.length + fromCode.length}</Count>
              </ReviewTabButton>
            ) : null}
            <ReviewTabButton active={tab === 'tests'} id="tests" onSelect={setTab}>
              {t('progress.review.tab_tests')}
              <Count tone={review.passedCount === review.totalCount ? 'success' : 'danger'}>{review.passedCount}/{review.totalCount}</Count>
            </ReviewTabButton>
            <ReviewTabButton active={tab === 'problem'} id="problem" onSelect={setTab}>
              {t('progress.review.statement_heading')}
            </ReviewTabButton>
          </div>
          <div aria-labelledby={`review-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4" id="review-panel" role="tabpanel">
            {tab === 'ai' && hasAi ? (
              <AiAnswers attempt={attempt} fromCode={fromCode} onShowLine={review.quiz ? undefined : showLine} submittedCode={review.code} />
            ) : tab === 'problem' ? (
              review.statement ? (
                <div
                  className="tiptap-render text-[13.5px] leading-[1.6]"
                  // The authored statement, rendered the same way the student's
                  // own workspace renders it.
                  dangerouslySetInnerHTML={{ __html: review.statement }}
                />
              ) : (
                <p className="text-[12.5px] text-sub">{t('progress.review.statement_missing')}</p>
              )
            ) : (
              <div className="space-y-3">
                {review.compileFailed ? <CompileFailure diagnostics={review.compileDiagnostics ?? null} /> : null}
                {review.hiddenTotal > 0 ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold">{t('progress.review.hidden_summary', { passed: review.hiddenPassed, total: review.hiddenTotal })}</p>
                      <p className="mt-0.5 text-[12px] text-sub">{t('progress.review.hidden_note')}</p>
                    </div>
                    <Count tone={review.hiddenPassed === review.hiddenTotal ? 'success' : 'danger'}>{review.hiddenPassed}/{review.hiddenTotal}</Count>
                  </div>
                ) : null}
                <h3 className="text-[12px] font-bold uppercase tracking-[0.05em] text-sub">{t('progress.review.cases_heading')}</h3>
                {samples.length === 0 ? (
                  <p className="text-[13px] text-sub">{t('progress.review.hidden_note')}</p>
                ) : (
                  <ul className="space-y-2">
                    {samples.map((sample) => (
                      <SampleCase item={sample} key={sample.position} />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

type ReviewTab = 'ai' | 'tests' | 'problem';

function ReviewTabButton({ id, active, onSelect, children }: { id: ReviewTab; active: boolean; onSelect: (tab: ReviewTab) => void; children: React.ReactNode }) {
  return (
    <button
      aria-controls="review-panel"
      aria-selected={active}
      className={cn(
        '-mb-px inline-flex shrink-0 items-center gap-1.5 rounded-t-lg border border-b-0 px-3 py-2 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
        active ? 'border-border bg-card text-ink' : 'border-transparent text-sub hover:text-ink',
      )}
      data-testid={`review-tab-${id}`}
      id={`review-tab-${id}`}
      onClick={() => onSelect(id)}
      role="tab"
      type="button"
    >
      {children}
    </button>
  );
}

function Count({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'danger'; children: React.ReactNode }) {
  return (
    <span className={cn(
      'rounded-full px-1.5 py-px text-[11.5px] font-bold tabular-nums',
      tone === 'success' ? 'bg-success/10 text-success' : tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-accent text-sub',
    )}>
      {children}
    </span>
  );
}

/** Marks one line of the submitted code and brings it to the middle of the editor. */
function markLine(editor: MonacoCodeEditor, line: number): () => void {
  const target = Math.min(line, editor.getModel()?.getLineCount() ?? line);
  let decorations = editor.deltaDecorations([], [{
    range: { startLineNumber: target, startColumn: 1, endLineNumber: target, endColumn: 1 },
    options: { isWholeLine: true, className: 'cove-warning-line', glyphMarginClassName: 'cove-warning-glyph' },
  }]);
  editor.revealLineInCenter(target);
  return () => { decorations = editor.deltaDecorations(decorations, []); };
}

/**
 * One public case. A failed one opens, a passed one folds to its title, so the
 * failures are what a reviewer reads first; what it should print and what it
 * printed sit side by side.
 */
function SampleCase({ item }: { item: TeacherReviewCase }) {
  const { t } = useTranslation('teach');
  const passed = item.outcome === 'PASSED';

  return (
    <li className={cn('rounded-lg border', passed ? 'border-border' : 'border-danger/30')}>
      <details className="group" open={!passed}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-1.5 text-[12.5px] font-bold">
            <ChevronRight aria-hidden className="size-4 text-sub transition-transform group-open:rotate-90" />
            {t('progress.review.case', { position: item.position })}
          </span>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11.5px] font-bold',
              passed ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
            )}
          >
            {t(`progress.review.outcome.${item.outcome}`)}
          </span>
        </summary>
        <div className="space-y-2 border-t border-border px-3 py-3">
          <CaseBlock label={t('progress.review.case_input')} value={item.input} />
          <div className="grid gap-2 sm:grid-cols-2">
            <CaseBlock label={t('progress.review.case_expected')} value={item.expectedOutput} />
            <CaseBlock label={t('progress.review.case_actual')} value={item.actualOutput} wrong={!passed} />
          </div>
          <ProgramEnding item={item} />
        </div>
      </details>
    </li>
  );
}

type ReviewAiReply = NonNullable<TeacherSubmissionReview['aiReplies']>[number] & { source?: 'RUN' | 'TEST_RUN'; code?: string };

type AnswerGroup = { key: string; analysis: ReviewAiReply; simpler: ReviewAiReply | null };

/**
 * Each analysis with the simpler version written after it about the same code,
 * newest first. A simpler version whose analysis is not in the list stands alone.
 */
function groupAnswers(replies: readonly ReviewAiReply[]): AnswerGroup[] {
  const groups: AnswerGroup[] = [];
  const ordered = [...replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const [index, reply] of ordered.entries()) {
    let owner: AnswerGroup | undefined;
    for (let at = groups.length - 1; reply.level !== 1 && !owner && at >= 0; at -= 1) {
      const group = groups[at]!;
      if (!group.simpler && (group.analysis.code ?? null) === (reply.code ?? null)) owner = group;
    }
    if (owner) owner.simpler = reply;
    else groups.push({ key: `${reply.createdAt}:${index}`, analysis: reply, simpler: null });
  }
  return groups.reverse();
}

/**
 * What the AI teacher told the student: about this attempt, or after Run and
 * Test run on this problem (the campus courses design, §6), one list at a
 * time. Each answer folds to one line; the newest is open.
 */
function AiAnswers({ attempt, fromCode, submittedCode, onShowLine }: {
  attempt: AnswerGroup[]; fromCode: AnswerGroup[]; submittedCode: string;
  /** Marks a line of the submitted code; absent where there is no editor. */
  onShowLine?: (line: number) => void;
}) {
  const { t } = useTranslation('learning-help');
  const [list, setList] = React.useState<'attempt' | 'code'>(attempt.length ? 'attempt' : 'code');
  const groups = list === 'attempt' ? attempt : fromCode;
  const [open, setOpen] = React.useState<string | null>(groups[0]?.key ?? null);
  const choose = (next: 'attempt' | 'code') => {
    setList(next);
    setOpen((next === 'attempt' ? attempt : fromCode)[0]?.key ?? null);
  };
  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg bg-accent p-0.5" role="group">
        {(['attempt', 'code'] as const).map((name) => (
          <button
            aria-pressed={list === name}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
              list === name ? 'bg-card text-ink shadow-card' : 'text-sub hover:text-ink',
            )}
            data-testid={`review-ai-list-${name}`}
            key={name}
            onClick={() => choose(name)}
            type="button"
          >
            {t(name === 'attempt' ? 'teacher.this_attempt' : 'teacher.run_test')}
            <Count>{(name === 'attempt' ? attempt : fromCode).length}</Count>
          </button>
        ))}
      </div>
      <p className="text-[12.5px] text-sub">{t(list === 'attempt' ? 'teacher.body' : 'teacher.code_body')}</p>
      {groups.length ? (
        <ol className="space-y-2" data-testid={list === 'attempt' ? 'review-ai-replies' : 'review-ai-code-replies'}>
          {groups.map((group) => (
            <AnswerItem
              group={group}
              key={group.key}
              onShowLine={group.analysis.code ? undefined : onShowLine}
              onToggle={() => setOpen((current) => current === group.key ? null : group.key)}
              open={open === group.key}
              submittedCode={submittedCode}
            />
          ))}
        </ol>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-[13px] text-sub">
          {t(list === 'attempt' ? 'teacher.none_attempt' : 'teacher.none_code')}
        </p>
      )}
    </div>
  );
}

function AnswerItem({ group, open, onToggle, submittedCode, onShowLine }: {
  group: AnswerGroup; open: boolean; onToggle: () => void; submittedCode: string; onShowLine?: (line: number) => void;
}) {
  const { t } = useTranslation('learning-help');
  const locale = useLocale();
  const { analysis, simpler } = group;
  const reported = analysis.reported || simpler?.reported === true;
  // The code the answer is about: what the server checked, or this submission.
  const code = analysis.code ?? submittedCode;
  const preview = (analysis.analysis?.result ?? analysis.text).replace(/\*\*|`/g, '');
  return (
    <li className={cn('overflow-hidden rounded-lg border', open ? 'border-brand/40' : 'border-border')}>
      <button
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
        onClick={onToggle}
        type="button"
      >
        <ChevronRight aria-hidden className={cn('mt-0.5 size-4 shrink-0 text-sub transition-transform', open && 'rotate-90')} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-sub">
            {analysis.source
              ? <span className="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand">{t(`ai.from.${analysis.source}`)}</span>
              : <span className="font-bold text-ink">{t('teacher.analysis')}</span>}
            <span className="tabular-nums">{formatDateTime(analysis.createdAt, locale, true)}</span>
            {simpler ? <span className="rounded-full bg-accent px-2 py-0.5 font-semibold">{t('teacher.has_simpler')}</span> : null}
            {reported ? <span className="rounded-full bg-danger/10 px-2 py-0.5 font-semibold text-danger">{t('teacher.reported')}</span> : null}
          </span>
          {open ? null : <span className="mt-1 block truncate text-[13px]">{preview}</span>}
        </span>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <AnswerBody code={code} onShowLine={onShowLine} reply={analysis} />
          {simpler ? (
            <div className="rounded-lg bg-accent/60 px-3 py-2.5">
              <p className="mb-1.5 text-[12px] font-bold text-sub">{t('teacher.simpler')}</p>
              <AnswerBody code={code} onShowLine={onShowLine} reply={simpler} />
            </div>
          ) : null}
          {analysis.code ? <CheckedCode code={analysis.code} line={analysis.analysis?.line ?? null} /> : null}
        </div>
      ) : null}
    </li>
  );
}

/** One answer's sections, the words to notice highlighted as the student saw them. */
function AnswerBody({ reply, code, onShowLine }: { reply: ReviewAiReply; code: string; onShowLine?: (line: number) => void }) {
  const { t } = useTranslation('learning-help');
  const analysis = reply.analysis;
  if (!analysis) return <p className="whitespace-pre-wrap text-[13.5px] leading-6" lang={reply.locale}><AiText text={reply.text} tone="light" /></p>;
  const line = analysis.line;
  const quoted = line === null ? null : code.split('\n')[line - 1]?.trim() || null;
  const sections = ([
    ['result', analysis.result], ['why', analysis.why], ['think', analysis.think], ['try_it', analysis.tryIt], ['also_check', analysis.alsoCheck],
  ] as const).filter(([, text]) => text);
  return (
    <dl className="grid gap-x-3 gap-y-2 text-[13.5px] leading-6 sm:grid-cols-[5.5rem_1fr]" lang={reply.locale}>
      {sections.slice(0, 1).map(([key, text]) => <Section key={key} label={t(`ai.section.${key}`)} text={text!} />)}
      {line !== null ? (
        <>
          <dt className="text-[12px] font-semibold text-sub sm:pt-0.5">{t('ai.section.where')}</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{t('ai.line', { number: line })}</span>
            {quoted ? <code className="rounded bg-[#fde68a]/60 px-1.5 py-0.5 font-mono text-[12.5px]">{quoted}</code> : null}
            {onShowLine ? (
              <button className="rounded text-[12.5px] font-semibold text-brand underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40" onClick={() => onShowLine(line)} type="button">
                {t('teacher.show_line')}
              </button>
            ) : null}
          </dd>
        </>
      ) : null}
      {sections.slice(1).map(([key, text]) => <Section key={key} label={t(`ai.section.${key}`)} text={text!} />)}
    </dl>
  );
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <>
      <dt className="text-[12px] font-semibold text-sub sm:pt-0.5">{label}</dt>
      <dd className="whitespace-pre-wrap"><AiText text={text} tone="light" /></dd>
    </>
  );
}

/** The code the server ran on the examples, numbered, the line the answer names marked. */
function CheckedCode({ code, line }: { code: string; line: number | null }) {
  const { t } = useTranslation('learning-help');
  return (
    <details className="group" open>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-semibold text-sub [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
        {t('teacher.checked_code')}
      </summary>
      <pre className="mt-1.5 max-h-72 overflow-auto rounded-lg bg-editor-bg py-2 font-mono text-[12.5px] leading-5 text-[#d4d4d4]">
        {code.split('\n').map((text, index) => (
          <div className={cn('flex px-3', index + 1 === line && 'bg-[#facc15]/15 shadow-[inset_3px_0_0_0_#f59e0b]')} key={index}>
            <span aria-hidden className="w-8 shrink-0 select-none pr-3 text-right text-[#6b7280]">{index + 1}</span>
            <span className="whitespace-pre">{text || ' '}</span>
          </div>
        ))}
      </pre>
    </details>
  );
}

/** How a public case's program ended: Python's own words, or a C/C++ ending as the student read it. */
function ProgramEnding({ item }: { item: TeacherReviewCase }) {
  const { t } = useTranslation('sample-check');
  if (item.outcome !== 'RUNTIME_ERROR') return null;
  const text = item.pythonError
    ? `${item.pythonError.type}${item.pythonError.message ? `: ${item.pythonError.message}` : ''}${item.pythonError.line ? ` (main.py:${item.pythonError.line})` : ''}`
    : item.exitSignal
    ? t(`workspace.exit.${item.exitSignal}`)
    : item.exitCode
      ? t('workspace.exit.code', { code: item.exitCode })
      : null;
  return text ? <p className="mt-2 text-[12px] text-danger">{text}</p> : null;
}

/** C/C++: the attempt did not compile, so no case ran. */
function CompileFailure({ diagnostics }: { diagnostics: string | null }) {
  const { t } = useTranslation('sample-check');
  return (
    <section className="rounded-card border border-danger/30 bg-danger/5 px-4 py-3.5" role="status">
      <h2 className="text-[13px] font-bold text-danger">{t('workspace.compile_error_title')}</h2>
      <p className="mt-1 text-[12.5px] leading-[1.5] text-sub">{t('workspace.compile_error_result')}</p>
      {diagnostics ? (
        <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-accent px-2 py-1.5 font-mono text-[12px]">
          {diagnostics}
        </pre>
      ) : null}
    </section>
  );
}

function CaseBlock({ label, value, wrong = false }: { label: string; value: string | null; wrong?: boolean }) {
  if (value === null) return null;
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-sub">{label}</p>
      <pre className={cn('mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded px-2 py-1.5 font-mono text-[12px]', wrong ? 'bg-danger/[0.06]' : 'bg-accent')}>
        {value}
      </pre>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-sub">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13.5px] font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function durationText(seconds: number | null, t: TFunction<'teach'>): string {
  const display = durationDisplay(seconds);
  switch (display.kind) {
    case 'hours':
      return t('progress.duration.hours', {
        hours: display.hours,
        minutes: display.minutes,
      });
    case 'minutes':
      return t('progress.duration.minutes', {
        minutes: display.minutes,
        seconds: display.seconds,
      });
    case 'seconds':
      return t('progress.duration.seconds', { seconds: display.seconds });
    default:
      return t('progress.duration.missing');
  }
}
