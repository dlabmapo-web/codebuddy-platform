'use client';

import type { AiAnalysis, AiHelpReply } from '@cove/shared';
import { CheckCircle2, LoaderCircle, RotateCcw, Sparkles } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { RunReading } from '@/lib/workspace/ai-help-target';
import { shortOutput } from '@/lib/workspace/ai-help-target';

import type { AiHelp } from '../_hooks/use-ai-help';
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
 * The AI teacher's answer, under the output, for whichever button it came
 * from. Mounted before the answer arrives, so a reader hears it.
 */
export function AiHelpPanel({
  academyId, classId, userId, help, code, onFocusLine, source,
}: {
  academyId: string; classId: string; userId: string; help: AiHelp;
  /** The code the answer is about, while the editor still holds it, to show the line it names. */
  code: string | null;
  onFocusLine?: (line: number, column: number) => void;
  source: 'RUN' | 'TEST_RUN' | 'SUBMIT' | null;
}) {
  const { t } = useTranslation('learning-help');
  const blocked = help.state !== null && help.state !== 'AVAILABLE' ? help.state : null;
  const nothing = !help.asking && !help.analysis && !help.fallback && !blocked && !help.failed && !help.examplesPassed;
  if (nothing) return null;
  return (
    <section aria-live="polite" className="mx-3 mb-3 space-y-2.5 rounded-xl border border-[#3b82f6]/30 bg-[#3b82f6]/[0.06] px-3.5 py-3" data-testid="ai-help-panel">
      {help.asking ? (
        <p className="flex items-center gap-2 text-[12.5px] text-[#93c5fd]" role="status">
          <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
          {t(help.asking === 'simpler' ? 'ai.simplifying' : help.subject?.kind === 'code' ? 'ai.checking' : 'ai.reading')}
        </p>
      ) : null}
      {help.failed ? <p className="text-[12.5px] text-[#fda4af]" role="alert">{t('ai.failed')}</p> : null}
      {help.examplesPassed && !help.asking ? (
        <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[#86efac]" data-testid="ai-examples-passed" role="status">
          <CheckCircle2 aria-hidden className="size-4" />{t('ai.examples_passed')}
        </p>
      ) : null}
      {help.analysis ? <AnalysisCard code={code} onFocusLine={onFocusLine} onReport={help.report} reply={help.analysis} source={source} /> : null}
      {help.simpler ? <AnalysisCard code={code} onFocusLine={onFocusLine} onReport={help.report} reply={help.simpler} simpler source={source} /> : null}
      {help.fallback ? <p className="text-[12.5px] leading-6 text-[#d4d4d4]" data-testid="ai-fallback">{t(`ai.fallback.${help.fallback}`)}</p> : null}
      {blocked && !help.asking ? <p className="text-[12.5px] leading-6 text-[#94a3b8]" data-testid="ai-state">{t(`ai.state.${blocked}`)}</p> : null}
      {help.analysis || help.fallback || blocked || help.failed ? (
        <div className="flex flex-wrap items-center gap-2">
          {help.failed ? (
            <button className={quietButtonClass} data-testid="ai-retry" disabled={help.asking !== null} onClick={() => help.ask(help.failed!)} type="button">
              <RotateCcw aria-hidden className="size-3.5" />{t('ai.retry')}
            </button>
          ) : null}
          {help.analysis && !help.simpler && help.state === 'AVAILABLE' ? (
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
    </section>
  );
}

/** One answer, in the sections of the Analyze design. Plain text only: an answer can never become markup. */
function AnalysisCard({
  reply, simpler = false, code, onFocusLine, onReport, source,
}: {
  reply: AiHelpReply; simpler?: boolean; code: string | null; onFocusLine?: (line: number, column: number) => void; onReport: (id: string) => Promise<void>;
  source: 'RUN' | 'TEST_RUN' | 'SUBMIT' | null;
}) {
  const { t } = useTranslation('learning-help');
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const [report, setReport] = React.useState<'idle' | 'sending' | 'failed'>('idle');
  // The answer arrived: a keyboard or screen-reader user is taken to it.
  React.useEffect(() => { headingRef.current?.focus(); }, []);
  const analysis: AiAnalysis | null = reply.analysis;
  const line = analysis?.line ?? null;
  const quoted = line !== null && code ? code.split('\n')[line - 1]?.trim() : null;

  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5" data-testid={simpler ? 'ai-simpler' : 'ai-analysis'}>
      <h4 className="flex items-center gap-2 text-[12.5px] font-bold text-[#93c5fd] focus:outline-none" ref={headingRef} tabIndex={-1}>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#2563eb]/25 px-2 py-0.5">
          <Sparkles aria-hidden className="size-3" />{t('ai.label')}
        </span>
        {simpler ? t('ai.simpler_heading') : source ? <span className="font-medium text-[#94a3b8]">{t(`ai.from.${source}`)}</span> : null}
      </h4>
      {analysis ? (
        <dl className="mt-2 grid gap-x-3 gap-y-2 text-[13px] leading-6 sm:grid-cols-[6.5rem_1fr]">
          <Section label={t('ai.section.result')}>{analysis.result}</Section>
          {line !== null ? (
            <Section label={t('ai.section.where')}>
              <span className="flex flex-wrap items-center gap-2" data-testid="analysis-line">
                <span className="font-semibold">{t('ai.line', { number: line })}</span>
                {quoted ? <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[12px] text-[#fde68a]">{quoted}</code> : null}
                {onFocusLine ? (
                  <button className="rounded text-[12px] text-[#93c5fd] underline underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa]" onClick={() => onFocusLine(line, 1)} type="button">
                    {t('ai.show_line')}
                  </button>
                ) : null}
              </span>
            </Section>
          ) : null}
          <Section label={t('ai.section.why')}>{analysis.why}</Section>
          <Section label={t('ai.section.think')}>{analysis.think}</Section>
          {analysis.tryIt ? <Section label={t('ai.section.try_it')}>{analysis.tryIt}</Section> : null}
          {analysis.alsoCheck ? <Section label={t('ai.section.also_check')}>{analysis.alsoCheck}</Section> : null}
        </dl>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-[#e5e7eb]">{reply.text}</p>
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

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[11.5px] font-bold uppercase tracking-wide text-[#94a3b8] sm:pt-0.5">{label}</dt>
      <dd className="whitespace-pre-wrap text-[#e5e7eb]">{children}</dd>
    </>
  );
}

