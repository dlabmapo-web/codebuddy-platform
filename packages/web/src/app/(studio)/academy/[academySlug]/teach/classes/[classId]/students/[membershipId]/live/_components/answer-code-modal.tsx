'use client';

import type { ExerciseSolutionEntry } from '@cove/shared';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  Modal,
  ModalContent,
  ModalTrigger,
} from '@/components/studio/primitives';
import { orpc } from '@/lib/orpc';
import { SolutionAnswerBlock } from '@/components/workspace/solution-answer-block';


export function AnswerCodeModal(props: Parameters<typeof AnswerCodeModalSession>[0]) {
  return <AnswerCodeModalSession key={[props.academyId, props.classId, props.membershipId, props.materialId, props.visitId, props.hasSolution].join(':')} {...props} />;
}

function AnswerCodeModalSession({
  academyId,
  classId,
  membershipId,
  materialId,
  visitId,
  hasSolution,
  fontSize,
}: {
  academyId: string;
  classId: string;
  membershipId: string;
  materialId: string;
  visitId: string;
  hasSolution: boolean;
  fontSize: number;
}) {
  const { t } = useTranslation('monitoring');
  const [open, setOpen] = React.useState(false);
  const [solutions, setSolutions] = React.useState<ExerciseSolutionEntry[] | null>(null);
  const { t: ts } = useTranslation('solutions');
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const requestRef = React.useRef(0);

  const clear = React.useCallback(() => {
    requestRef.current += 1;
    setSolutions(null);
    setLoading(false);
    setFailed(false);
  }, []);

  React.useEffect(() => clear, [clear]);

  async function load() {
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLoading(true);
    setFailed(false);
    try {
      const answer = await orpc.monitoring.getExerciseSolution({
        academyId,
        classId,
        membershipId,
        materialId,
        visitId,
      });
      if (requestRef.current === request) setSolutions(answer.solutions);
    } catch {
      if (requestRef.current === request) setFailed(true);
    } finally {
      if (requestRef.current === request) setLoading(false);
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void load();
    else clear();
  }

  return (
    <Modal onOpenChange={handleOpenChange} open={open}>
      <ModalTrigger asChild>
        <button
          className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-[12.5px] font-bold text-ink transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!hasSolution}
          aria-label={
            hasSolution
              ? t('answer.show')
              : `${t('answer.show')}: ${t('answer.missing')}`
          }
          title={!hasSolution ? t('answer.missing') : undefined}
          type="button"
        >
          {t('answer.show')}
        </button>
      </ModalTrigger>

      <ModalContent
        className="max-w-4xl"
        description={t('answer.description')}
        title={t('answer.title')}
      >
        <div className="max-h-[65vh] min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {loading ? (
            <div className="grid h-[min(56vh,520px)] place-items-center rounded-xl border border-border bg-canvas text-[14px] font-semibold text-sub">
              {t('answer.loading')}
            </div>
          ) : failed || !solutions?.length ? (
            <div
              className="grid h-[min(56vh,520px)] place-items-center rounded-xl border border-danger/25 bg-danger/5 px-6 text-center text-[14px] font-semibold text-danger"
              role="alert"
            >
              {t('answer.failed')}
            <button type="button" onClick={() => void load()}>{ts('retry')}</button>
            </div>
          ) : (
            <div className="space-y-6">
              {solutions.map((solution, index) => <SolutionAnswerBlock key={index} solution={solution} index={index} fontSize={fontSize} />)}
            </div>
          )}

        </div>

        <div className="flex justify-end border-t border-border px-5 py-4 sm:px-6">
          <button
            className="inline-flex h-10 items-center rounded-lg bg-ink px-5 text-[14px] font-bold text-canvas transition-opacity hover:opacity-85"
            onClick={() => handleOpenChange(false)}
            type="button"
          >
            {t('answer.close')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
