'use client';

import { explainOutput, type AiAnalysis, type AiHelpReply, type SubmissionResult } from '@cove/shared';
import { skipToken, useQuery } from '@tanstack/react-query';
import { Hand, LoaderCircle, RotateCcw, Sparkles } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { askTeacherEvent, myHelpRequestKey } from '@/lib/monitoring/use-help-requests';

import { useAiHelp } from '../_hooks/use-ai-help';

const buttonClass =
  'inline-flex h-9 items-center gap-2 rounded-lg bg-[#2563eb] px-3 text-[12.5px] font-bold text-white transition-colors hover:bg-[#1d4ed8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa] disabled:opacity-50';
const quietButtonClass =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/20 px-2.5 text-[12px] font-semibold text-[#dbe2ee] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa] disabled:opacity-50';

/**
 * Help for one failed attempt, on the student's own result.
 *
 * A rule reads only the public outputs already on screen, so it shows at once
 * and makes no request. The AI teacher is asked only when the student presses
 * **Analyze my code**. Nothing renders when there is nothing to say.
 */
export function LearnerHelp({
  academyId,
  aiAssistant,
  classId,
  userId,
  result,
  code = null,
  onFocusLine,
}: {
  academyId: string;
  aiAssistant: boolean;
  classId: string;
  userId: string;
  result: SubmissionResult;
  /** The code that was graded, when the browser still has it, to show the line an analysis names. */
  code?: string | null;
  /** Present only while the editor still holds the graded code. */
  onFocusLine?: (line: number, column: number) => void;
}) {
  const { t } = useTranslation('learning-help');
  const explained = React.useMemo(() => explainOutput(result), [result]);
  const offersAi = aiAssistant && result.status === 'FAILED';
  if (!explained && !offersAi) return null;

  return (
    <section className="space-y-3 rounded-xl border border-[#3b82f6]/30 bg-[#3b82f6]/[0.06] px-3.5 py-3" data-testid="learner-help">
      {explained ? (
        <div className="space-y-1.5" data-testid="rule-explanation-box">
          <h4 className="text-[13px] font-bold text-[#dbe2ee]">
            {t('title')}
            <span className="font-medium text-[#94a3b8]"> · {t('case', { number: explained.position })}</span>
          </h4>
          <p className="text-[12.5px] leading-6 text-[#d4d4d4]" data-testid="rule-explanation">{t(`rule.${explained.rule}.what`)}</p>
          <p className="text-[12.5px] leading-6 text-[#93c5fd]">{t(`rule.${explained.rule}.next`)}</p>
        </div>
      ) : null}
      {offersAi ? (
        <AiTeacher academyId={academyId} classId={classId} code={code} onFocusLine={onFocusLine} submissionId={result.submissionId} userId={userId} />
      ) : (
        <AskTeacher academyId={academyId} classId={classId} userId={userId} />
      )}
    </section>
  );
}

function AiTeacher({
  academyId, classId, code, onFocusLine, submissionId, userId,
}: {
  academyId: string; classId: string; code: string | null; onFocusLine?: (line: number, column: number) => void; submissionId: string; userId: string;
}) {
  const { t } = useTranslation('learning-help');
  const help = useAiHelp({ academyId, submissionId });
  const blocked = help.state !== null && help.state !== 'AVAILABLE' ? help.state : null;
  const teacher = <AskTeacher academyId={academyId} classId={classId} userId={userId} />;

  return (
    // Mounted before the answer arrives, so a reader hears it.
    <div aria-live="polite" className="space-y-2.5">
      {!help.analysis && help.asking !== 'analyze' && !help.fallback && !blocked ? (
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5" data-testid="ai-invite">
          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[#dbe2ee]">
            <Sparkles aria-hidden className="size-4 text-[#93c5fd]" />{t('ai.invite')}
          </p>
          <button className={buttonClass} data-testid="analyze" disabled={help.asking !== null} onClick={() => help.ask('analyze')} type="button">
            {help.failed === 'analyze' ? <RotateCcw aria-hidden className="size-3.5" /> : <Sparkles aria-hidden className="size-3.5" />}
            {t(help.failed === 'analyze' ? 'ai.retry' : 'ai.analyze')}
          </button>
        </div>
      ) : null}
      {help.asking ? (
        <p className="flex items-center gap-2 text-[12.5px] text-[#93c5fd]" role="status">
          <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />{t(help.asking === 'simpler' ? 'ai.simplifying' : 'ai.reading')}
        </p>
      ) : null}
      {help.failed ? <p className="text-[12.5px] text-[#fda4af]" role="alert">{t('ai.failed')}</p> : null}
      {help.analysis ? <AnalysisCard code={code} onFocusLine={onFocusLine} onReport={help.report} reply={help.analysis} /> : null}
      {help.simpler ? <AnalysisCard code={code} onFocusLine={onFocusLine} onReport={help.report} reply={help.simpler} simpler /> : null}
      {help.fallback ? <p className="text-[12.5px] leading-6 text-[#d4d4d4]" data-testid="ai-fallback">{t(`ai.fallback.${help.fallback}`)}</p> : null}
      {blocked && !help.asking ? <p className="text-[12.5px] leading-6 text-[#94a3b8]" data-testid="ai-state">{t(`ai.state.${blocked}`)}</p> : null}
      {help.analysis || help.fallback || blocked || help.failed ? (
        <div className="flex flex-wrap items-center gap-2">
          {help.analysis && !help.simpler && help.state === 'AVAILABLE' ? (
            <button className={quietButtonClass} data-testid="explain-simpler" disabled={help.asking !== null} onClick={() => help.ask('simpler')} type="button">
              {help.failed === 'simpler' ? <RotateCcw aria-hidden className="size-3.5" /> : null}
              {t(help.failed === 'simpler' ? 'ai.retry' : 'ai.simpler')}
            </button>
          ) : null}
          {teacher}
          {help.remaining !== null && help.state === 'AVAILABLE' ? (
            <span className="text-[11.5px] text-[#94a3b8]">{t('ai.left', { count: help.remaining })}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** One answer, in the sections of the Analyze design. Plain text only: an answer can never become markup. */
function AnalysisCard({
  reply, simpler = false, code, onFocusLine, onReport,
}: {
  reply: AiHelpReply; simpler?: boolean; code: string | null; onFocusLine?: (line: number, column: number) => void; onReport: (id: string) => Promise<void>;
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
        {simpler ? t('ai.simpler_heading') : null}
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

/** The header's request control, offered where the student is reading. */
export function AskTeacher({ academyId, classId, userId }: { academyId: string; classId: string; userId: string }) {
  const { t } = useTranslation('monitoring');
  // Read from the control's own cache and never fetched twice.
  const { data } = useQuery<{ denied: boolean; request: { status: string } | null; teacherAssigned: boolean }>({
    queryKey: myHelpRequestKey(academyId, classId, userId),
    queryFn: skipToken,
  });
  if (!data || data.denied) return null;
  if (data.request) return <p className="text-[12px] font-semibold text-[#93c5fd]" role="status">{t('help.requested')}</p>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className={quietButtonClass} data-testid="ask-teacher" onClick={() => window.dispatchEvent(new Event(askTeacherEvent))} type="button">
        <Hand aria-hidden className="size-3.5" />
        {t('help.request')}
      </button>
      {data.teacherAssigned ? null : <span className="text-[12px] text-[#94a3b8]">{t('help.no_teacher')}</span>}
    </div>
  );
}
