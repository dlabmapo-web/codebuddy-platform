'use client';

import type { ExamItemContent, ExamShellItem } from '@cove/shared';
import { Copy, Play, Square } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { CodeEditor } from '@/components/editor/code-editor';
import { ChoiceRich } from '@/components/manual/choice-options';
import { RichTextFrame } from '@/components/studio/rich-text-frame';
import { formatExamDate } from '@/components/exam/exam-format';
import { useErrorText } from '@/i18n/client/use-error-text';
import { toApiError } from '@/lib/api-errors';
import { orpc } from '@/lib/orpc';
import { usePythonRunner } from '@/lib/workspace/use-python-runner';

type Props = {
  academyId: string;
  attemptId: string;
  item: ExamShellItem;
  readOnly: boolean;
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
        {content.description.trim() ? (
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
      <SubmitBar disabled={selected.length === 0} busy={busy} error={error} status={status} onSubmit={onSubmit} readOnly={readOnly} />
    </section>
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
        {content.description.trim() ? (
          <div className="mt-4"><RichTextFrame content={content.description.replace(/\n/g, '<br>')} title={content.title} minHeight={24} fallbackHeight={80} padding={0} /></div>
        ) : null}
        <textarea value={answer} readOnly={readOnly} maxLength={10_000}
          onChange={(event) => { setAnswer(event.target.value); writeDraft(draftKey, event.target.value); }}
          placeholder={content.placeholder || t('mode.answer_placeholder')}
          className="mt-6 h-48 w-full resize-y rounded-lg border border-border bg-surface px-4 py-3 text-[14px] outline-none focus:border-brand" />
      </div>
      <SubmitBar disabled={!answer.trim()} busy={busy} error={error} status={status} readOnly={readOnly}
        onSubmit={() => void submit({ kind: 'text', text: answer, contentRevision: content.contentRevision })} />
    </section>
  );
}

function CodeItem(props: Props & { content: Extract<ExamItemContent, { type: 'CODE' }> }) {
  const { t } = useTranslation('exam');
  const { content, readOnly } = props;
  const { busy, error, submit, status } = useSubmit(props);
  const draftKey = `cove-exam:${props.attemptId}:${content.materialId}`;
  const [code, setCode] = React.useState(() => readDraft(draftKey) ?? content.lastAnswer ?? content.starterCode);
  const [stdin, setStdin] = React.useState(content.samples[0]?.input ?? '');
  const python = content.language === 'PYTHON';
  const runner = usePythonRunner({ browserRuntime: python });
  const editorLanguage = content.language === 'C' ? 'c' : content.language === 'CPP' ? 'cpp' : 'python';
  const output = runner.lines.map((line) => line.text).join('\n');
  return (
    <div className="grid h-full min-h-0 grid-rows-[minmax(0,45%)_minmax(0,55%)] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:grid-rows-1">
      <article className="min-h-0 overflow-y-auto border-b border-border bg-card px-5 py-5 lg:border-b-0 lg:border-r">
        <h2 className="text-center text-[18px] font-bold">{content.title}</h2>
        {content.description.trim() ? (
          <div className="mt-4"><RichTextFrame content={content.description} title={content.title} minHeight={24} fallbackHeight={120} padding={0} /></div>
        ) : null}
        {content.inputFormat.trim() ? <Block title={t('mode.input')}>{content.inputFormat}</Block> : null}
        {content.outputFormat.trim() ? <Block title={t('mode.expected')}>{content.outputFormat}</Block> : null}
        {content.samples.map((sample, index) => (
          <div key={index} className="mt-5">
            <h3 className="text-[14px] font-bold">{t('mode.example', { n: index + 1 })}</h3>
            {sample.input ? <Sample label={t('mode.input')} value={sample.input} /> : null}
            <Sample label={t('mode.expected')} value={sample.output} />
          </div>
        ))}
      </article>
      <section className="flex min-h-0 flex-col">
        <div className="flex min-h-0 flex-[3] flex-col">
          <CodeEditor code={code} fontSize={14} language={editorLanguage} readOnly={readOnly}
            onChange={(value) => { setCode(value); writeDraft(draftKey, value); }} />
        </div>
        <div className="flex min-h-0 flex-[2] flex-col border-t border-border bg-card">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <span className="text-[13px] font-bold">{t('mode.output')}</span>
            <span className="flex-1" />
            {python ? (
              runner.running ? (
                <button type="button" onClick={() => runner.stop()} className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-[13px] font-semibold hover:bg-surface">
                  <Square aria-hidden className="size-3.5" /> {t('mode.stop')}
                </button>
              ) : (
                <button type="button" disabled={!runner.ready} onClick={() => void runner.run(code, { stdin })}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-[13px] font-semibold hover:bg-surface disabled:opacity-40">
                  <Play aria-hidden className="size-3.5" /> {runner.ready ? t('mode.run') : t('mode.running')}
                </button>
              )
            ) : null}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            {python ? (
              <textarea aria-label={t('mode.input')} value={stdin} onChange={(event) => setStdin(event.target.value)} placeholder={t('mode.input')}
                className="min-h-16 resize-none border-b border-border bg-surface px-3 py-2 font-mono text-[12.5px] outline-none sm:border-b-0 sm:border-r" />
            ) : null}
            <pre className={`min-h-0 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[12.5px] ${python ? '' : 'sm:col-span-2'}`}>
              {python ? output : t('mode.run_unavailable')}
            </pre>
          </div>
          <SubmitBar disabled={!code.trim()} busy={busy} error={error} status={status} readOnly={readOnly}
            onSubmit={() => void submit({ kind: 'code', code })} />
        </div>
      </section>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="text-[14px] font-bold">{title}</h3>
      <p className="mt-1.5 whitespace-pre-wrap text-[13.5px] leading-6 text-ink">{children}</p>
    </div>
  );
}

function Sample({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2">
      <div className="text-[12px] font-semibold text-sub">{label}</div>
      <div className="relative mt-1 rounded-lg bg-editor-bg">
        <button type="button" onClick={() => void navigator.clipboard?.writeText(value)} aria-label="Copy"
          className="absolute right-2 top-2 grid size-6 place-items-center rounded bg-white/10 text-white/70 hover:text-white">
          <Copy aria-hidden className="size-3.5" />
        </button>
        <pre className="overflow-auto px-4 py-3 font-mono text-[12.5px] text-[#F5B870]">{value}</pre>
      </div>
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
