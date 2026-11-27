'use client';

import { explainOutput, type SubmissionResult } from '@cove/shared';
import { useQuery } from '@tanstack/react-query';
import { Hand, Sparkles } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { askTeacherEvent, myHelpRequestQuery } from '@/lib/monitoring/use-help-requests';


const quietButtonClass =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/20 px-2.5 text-[12px] font-semibold text-[#dbe2ee] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#60a5fa] disabled:opacity-50';

/**
 * Help for one failed attempt, on the student's own result.
 *
 * A rule reads only the public outputs already on screen, so it shows at once
 * and makes no request. The AI teacher is asked from the **AI help** button
 * in the toolbar (the campus courses design, §6); here a failed attempt only
 * points at it. Nothing renders when there is nothing to say.
 */
export function LearnerHelp({
  academyId,
  aiAssistant,
  classId,
  userId,
  result,
}: {
  academyId: string;
  aiAssistant: boolean;
  classId: string;
  userId: string;
  result: SubmissionResult;
  /** Kept for callers; the answer itself is shown by the AI help panel. */
  code?: string | null;
  onFocusLine?: (line: number, column: number) => void;
}) {
  const { t } = useTranslation('learning-help');
  const explained = React.useMemo(() => explainOutput(result), [result]);
  const pointsAtAi = aiAssistant && result.status === 'FAILED';
  if (!explained && !pointsAtAi) return null;

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
      {pointsAtAi ? (
        <p className="flex items-center gap-2 text-[12.5px] font-semibold text-[#dbe2ee]" data-testid="ai-invite">
          <Sparkles aria-hidden className="size-4 text-[#93c5fd]" />{t('ai.invite_toolbar')}
        </p>
      ) : null}
      {/* With AI on, the teacher is offered beside the AI teacher's answer, once. */}
      {pointsAtAi ? null : <AskTeacher academyId={academyId} classId={classId} userId={userId} />}
    </section>
  );
}

/** The header's request control, offered where the student is reading. */
export function AskTeacher({ academyId, classId, userId }: { academyId: string; classId: string; userId: string }) {
  const { t } = useTranslation('monitoring');
  // The header's control reads and refreshes it; this only watches, with the
  // same definition, so a refresh started here or there runs the real read.
  const { data } = useQuery({ ...myHelpRequestQuery(academyId, classId, userId), enabled: false });
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
