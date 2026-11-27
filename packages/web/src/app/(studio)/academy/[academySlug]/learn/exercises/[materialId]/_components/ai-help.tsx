'use client';

import type { AiAnalysis, AiHelpMode, AiHelpReply } from '@cove/shared';
import { Check, CheckCircle2, ChevronDown, Circle, LoaderCircle, RotateCcw, Sparkles } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { RunReading } from '@/lib/workspace/ai-help-target';
import { shortOutput } from '@/lib/workspace/ai-help-target';
import { AiText } from '@/components/ai/ai-text';
import { useLocale } from '@/i18n';
import { revealInRegion, revealRegionAttribute } from '@/lib/workspace/reveal-in-region';

import type { AiAnswer, AiHelp } from '../_hooks/use-ai-help';
import { AskTeacher } from './learner-help';

const quietButtonClass =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/20 px-2.5 text-[12px] font-semibold text-[#dbe2ee] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa] disabled:opacity-50';

/**
 * The toolbar's **AI help** button, after Submit (the campus courses design,
 * §6). It shows only where the AI teacher works on this problem, and can be
 * pressed only when the latest Run, Test run or Submit showed something wrong.
 * Pressing it sends nothing the browser decided: the server checks the code.
 */
export function AiHelpButton({
  enabled, busy, reason, onPress,
}: {
  enabled: boolean;
  busy: boolean;
  /** Why it is off, as a tooltip. */
  reason: 'off' | 'own-input' | null;
  onPress: () => void;
}) {
  const { t } = useTranslation('learning-help');
  const title = enabled ? undefined : t(reason === 'own-input' ? 'ai.button_own_input' : 'ai.button_off');
  return (
    <button
      aria-describedby={title ? 'ai-help-off' : undefined}
      className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#2563eb] px-2 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-[#1d4ed8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa] disabled:bg-white/10 disabled:text-white/50"
      data-testid="ai-help"
      disabled={!enabled || busy}
      onClick={onPress}
      title={title}
      type="button"
    >
      {busy ? <LoaderCircle aria-hidden className="size-3 motion-safe:animate-spin" /> : <Sparkles aria-hidden className="size-3" />}
      {t('ai.button')}
      {title ? <span className="sr-only" id="ai-help-off">{title}</span> : null}
    </button>
  );
}

/** What a Run with an example's input showed, free and at once. */
export function RunExampleNote({ reading }: { reading: RunReading | null }) {
  const { t } = useTranslation('learning-help');
  if (!reading || reading.kind !== 'mismatch') return null;
  return (
    <p className="mx-3 mb-2 rounded-lg border border-[#f87171]/30 bg-[#f87171]/[0.08] px-3 py-2 text-[12.5px] leading-6 text-[#fecaca]" data-testid="run-example" role="status">
      {t('ai.run_example', { number: reading.number, expected: shortOutput(reading.expected), actual: shortOutput(reading.actual) })}
    </p>
  );
}

/**
 * The AI teacher's box: every answer the student was given on this problem,
 * oldest first and newest last, as a chat reads, and the teacher at work on
 * the next one. One box above the output, whichever tab: it scrolls inside
 * itself, takes at most part of the pane, and folds to its title bar, so the
 * test results and the terminal always keep a place of their own below it.
 */
export function AiHelpPanel({
  academyId, classId, userId, help, currentCode, onFocusLine,
}: {
  academyId: string; classId: string; userId: string; help: AiHelp;
  /** The editor's code now, to offer the line an answer names while it still reads the same. */
  currentCode: string;
  onFocusLine?: (line: number, column: number) => void;
}) {
  const { t } = useTranslation('learning-help');
  const listRef = React.useRef<HTMLOListElement>(null);
  const [open, setOpen] = React.useState(true);
  // A new question opens the box again: its answer is what the student asked for.
  const [wasAsking, setWasAsking] = React.useState(help.asking);
  if (wasAsking !== help.asking) {
    setWasAsking(help.asking);
    if (help.asking) setOpen(true);
  }
  // The newest answer is where the box opens, on a reload or another problem;
  // earlier ones are a scroll up inside it.
  const newest = help.answers.at(-1)?.analysis.id ?? null;
  React.useEffect(() => {
    if (newest && open) revealInRegion(listRef.current?.lastElementChild ?? null, 'start', 'instant');
  }, [newest, open]);
  const blocked = help.state !== null && help.state !== 'AVAILABLE' ? help.state : null;
  const nothing = !help.answers.length && !help.asking && !help.fallback && !blocked && !help.failed && !help.examplesPassed;
  if (nothing) return null;
  const last = help.answers.length - 1;
  const actions = help.live || help.fallback || blocked || help.failed;
  return (
    <section
      aria-label={t('ai.label')}
      className="mx-3 mt-2 flex max-h-[60%] min-h-0 shrink-0 flex-col overflow-hidden rounded-xl border border-[#3b82f6]/35 bg-[#0b1220]"
      data-testid="ai-help-panel"
    >
      <button
        aria-expanded={open}
        className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2 text-left text-[12.5px] font-bold text-[#93c5fd] hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#60a5fa]"
        data-testid="ai-help-toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Sparkles aria-hidden className="size-4" />
        {t('ai.label')}
        {help.answers.length ? <span className="font-medium text-[#94a3b8]" data-testid="ai-thread-count">{t('ai.thread', { count: help.answers.length })}</span> : null}
        {help.asking && !open ? <span className="cove-ai-shimmer font-medium">{t('ai.thinking.title')}</span> : null}
        <ChevronDown aria-hidden className={`ml-auto size-4 text-[#94a3b8] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <>
          <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain px-3 py-3" data-testid="ai-help-scroll" {...{ [revealRegionAttribute]: '' }}>
            <ol aria-live="polite" className="space-y-3" ref={listRef}>
              {help.answers.map((answer, index) => (
                <li className="space-y-2" key={answer.key}>
                  <AnswerCard answer={answer} currentCode={currentCode} fresh={freshness(help, answer.analysis.id)} latest={index === last && !answer.simpler} onFocusLine={onFocusLine} onReport={help.report} reply={answer.analysis} />
                  {answer.simpler ? (
                    <AnswerCard answer={answer} currentCode={currentCode} fresh={freshness(help, answer.simpler.id)} latest={index === last} onFocusLine={onFocusLine} onReport={help.report} reply={answer.simpler} simpler />
                  ) : null}
                </li>
              ))}
            </ol>
            {help.asking ? <AiThinking kind={help.subject?.kind ?? 'submission'} mode={help.asking} /> : null}
            {help.failed ? <p className="text-[12.5px] text-[#fda4af]" role="alert">{t('ai.failed')}</p> : null}
            {help.examplesPassed && !help.asking ? (
              <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[#86efac]" data-testid="ai-examples-passed" role="status">
                <CheckCircle2 aria-hidden className="size-4" />{t('ai.examples_passed')}
              </p>
            ) : null}
            {help.fallback ? <p className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[12.5px] leading-6 text-[#d4d4d4]" data-testid="ai-fallback">{t(`ai.fallback.${help.fallback}`)}</p> : null}
            {blocked && !help.asking ? <p className="text-[12.5px] leading-6 text-[#94a3b8]" data-testid="ai-state">{t(`ai.state.${blocked}`)}</p> : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2">
              {help.failed ? (
                <button className={quietButtonClass} data-testid="ai-retry" disabled={help.asking !== null} onClick={() => help.ask(help.failed!)} type="button">
                  <RotateCcw aria-hidden className="size-3.5" />{t('ai.retry')}
                </button>
              ) : null}
              {help.live && !help.live.simpler && help.state === 'AVAILABLE' ? (
                <button className={quietButtonClass} data-testid="explain-simpler" disabled={help.asking !== null} onClick={() => help.ask('simpler')} type="button">
                  {t('ai.simpler')}
                </button>
              ) : null}
              <AskTeacher academyId={academyId} classId={classId} userId={userId} />
              {help.remaining !== null && help.state === 'AVAILABLE' ? (
                <span className="text-[11.5px] text-[#94a3b8]">{t('ai.left', { count: help.remaining })}</span>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/** Which arrival this reply is, if it is the one that just arrived; 0 otherwise. */
function freshness(help: AiHelp, id: string): number {
  return help.fresh?.id === id ? help.fresh.seq : 0;
}

/**
 * The teacher at work, as a chat shows its assistant thinking: the steps the
 * server really takes, in order, the current one shimmering, and the seconds
 * so far. The steps move on a clock, and the last stays open until the answer
 * is in, so nothing claims to be finished before it is.
 */
function AiThinking({ mode, kind }: { mode: AiHelpMode; kind: 'submission' | 'code' }) {
  const { t } = useTranslation('learning-help');
  const ref = React.useRef<HTMLDivElement>(null);
  const [started] = React.useState(() => Date.now());
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    revealInRegion(ref.current);
    const timer = setInterval(() => setElapsed(Date.now() - started), 400);
    return () => clearInterval(timer);
  }, [started]);
  const steps: readonly ('simpler' | 'run' | 'read' | 'find' | 'write')[] = mode === 'simpler'
    ? ['simpler']
    : kind === 'code' ? ['run', 'find', 'write'] : ['read', 'find', 'write'];
  const current = Math.min(steps.length - 1, Math.floor(elapsed / THINKING_STEP_MS));
  return (
    <div className="rounded-xl border border-[#3b82f6]/30 bg-[#3b82f6]/[0.06] px-3.5 py-3" data-testid="ai-thinking" ref={ref} role="status">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <Sparkles aria-hidden className="size-4 text-[#93c5fd] motion-safe:animate-pulse" />
        <span className="cove-ai-shimmer">{t('ai.thinking.title')}</span>
        <span className="text-[11.5px] font-normal tabular-nums text-[#94a3b8]">{t('ai.thinking.seconds', { count: Math.floor(elapsed / 1000) })}</span>
      </p>
      <ol className="mt-2 space-y-1.5 pl-1 text-[12.5px]">
        {steps.map((step, index) => (
          <li className="flex items-center gap-2" key={step}>
            {index < current ? <Check aria-hidden className="size-3.5 text-[#86efac]" />
              : index === current ? <LoaderCircle aria-hidden className="size-3.5 text-[#93c5fd] motion-safe:animate-spin" />
                : <Circle aria-hidden className="size-3.5 text-[#475569]" />}
            <span className={index === current ? 'cove-ai-shimmer font-medium' : index < current ? 'text-[#94a3b8]' : 'text-[#64748b]'}>{t(`ai.thinking.${step}`)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
/** How long each step of the thinking card shows before the next. */
const THINKING_STEP_MS = 1_600;

/** One answer, in the sections of the Analyze design. Text only: an answer can never become markup. */
function AnswerCard({
  answer, reply, simpler = false, latest, fresh, currentCode, onFocusLine, onReport,
}: {
  answer: AiAnswer; reply: AiHelpReply; simpler?: boolean; latest: boolean;
  /** Which arrival this is when it just arrived (then the reader is taken to it), 0 otherwise. */
  fresh: number;
  currentCode: string; onFocusLine?: (line: number, column: number) => void; onReport: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation('learning-help');
  const locale = useLocale();
  const cardRef = React.useRef<HTMLElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const [report, setReport] = React.useState<'idle' | 'sending' | 'failed'>('idle');
  // The answer just arrived: the output scrolls to its top, and a keyboard or
  // screen-reader user is taken to it. Answers already there stay put.
  React.useEffect(() => {
    if (!fresh) return;
    headingRef.current?.focus({ preventScroll: true });
    revealInRegion(cardRef.current, 'start');
  }, [fresh]);
  const analysis: AiAnalysis | null = reply.analysis;
  const line = analysis?.line ?? null;
  const quoted = line === null ? null : answer.code !== null ? answer.code.split('\n')[line - 1]?.trim() || null : answer.quoted;
  // The editor still has that line where the answer says: it can show it.
  const canShow = line !== null && quoted !== null && currentCode.split('\n')[line - 1]?.trim() === quoted;
  const rise = fresh ? 'cove-ai-rise' : '';
  let order = 0;
  const section = (label: string, text: string) => (
    <Section label={label} rise={rise} delay={order++ * 90}><AiText text={text} /></Section>
  );

  return (
    <article
      className={`rounded-xl border px-3.5 py-3 ${latest ? 'border-[#3b82f6]/45 bg-[#3b82f6]/[0.07]' : 'border-white/10 bg-white/[0.03]'} ${rise}`}
      data-testid={simpler ? 'ai-simpler' : 'ai-analysis'}
      ref={cardRef}
    >
      <h4 className="flex flex-wrap items-center gap-2 text-[12.5px] font-bold text-[#93c5fd] focus:outline-none" ref={headingRef} tabIndex={-1}>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#2563eb]/25 px-2 py-0.5">
          <Sparkles aria-hidden className="size-3" />{simpler ? t('ai.simpler_heading') : t(`ai.from.${answer.source}`)}
        </span>
        <time className="ml-auto text-[11px] font-normal tabular-nums text-[#64748b]" dateTime={reply.createdAt}>{timeOf(reply.createdAt, locale)}</time>
      </h4>
      {analysis ? (
        <dl className="mt-2 grid gap-x-3 gap-y-2.5 text-[13px] leading-6 sm:grid-cols-[6.5rem_1fr]">
          {section(t('ai.section.result'), analysis.result)}
          {line !== null ? (
            <Section label={t('ai.section.where')} rise={rise} delay={order++ * 90}>
              <span className="flex flex-wrap items-center gap-2" data-testid="analysis-line">
                <span className="font-semibold">{t('ai.line', { number: line })}</span>
                {quoted ? <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[12px] text-[#fde68a]">{quoted}</code> : null}
                {onFocusLine && canShow ? (
                  <button className="rounded text-[12px] text-[#93c5fd] underline underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]" onClick={() => onFocusLine(line, 1)} type="button">
                    {t('ai.show_line')}
                  </button>
                ) : null}
              </span>
            </Section>
          ) : null}
          {section(t('ai.section.why'), analysis.why)}
          {section(t('ai.section.think'), analysis.think)}
          {analysis.tryIt ? section(t('ai.section.try_it'), analysis.tryIt) : null}
          {analysis.alsoCheck ? section(t('ai.section.also_check'), analysis.alsoCheck) : null}
        </dl>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-[#e5e7eb]"><AiText text={reply.text} /></p>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#94a3b8]">
        <span>{t('ai.note')}</span>
        {reply.reported ? <span role="status">{t('ai.reported')}</span> : (
          <button
            className="rounded underline underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa] disabled:opacity-50"
            disabled={report === 'sending'}
            onClick={() => {
              setReport('sending');
              onReport(reply.id).then(() => setReport('idle'), () => setReport('failed'));
            }}
            type="button"
          >
            {t(report === 'failed' ? 'ai.report_failed' : 'ai.report')}
          </button>
        )}
      </p>
    </article>
  );
}

/** "오전 10:27", or with the date when it was another day. */
function timeOf(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date().toDateString() === date.toDateString();
  return new Intl.DateTimeFormat(language === 'ko' ? 'ko-KR' : 'en-US', today
    ? { hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function Section({ label, children, rise, delay }: { label: string; children: React.ReactNode; rise: string; delay: number }) {
  const style = rise ? { animationDelay: `${delay}ms` } : undefined;
  return (
    <>
      <dt className={`text-[11.5px] font-bold uppercase tracking-wide text-[#94a3b8] sm:pt-0.5 ${rise}`} style={style}>{label}</dt>
      <dd className={`whitespace-pre-wrap text-[#e5e7eb] ${rise}`} style={style}>{children}</dd>
    </>
  );
}
