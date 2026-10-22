'use client';
import { lessonAction } from '@/components/workspace/lesson-chrome';

import * as React from 'react';
import { CircleCheck } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Modal, ModalContent, ModalTrigger } from '@/components/studio/primitives';
import { orpc } from '@/lib/orpc';
import { SolutionAnswerBlock } from '@/components/workspace/solution-answer-block';

type Context = {
  academyId: string;
  courseId: string;
  materialId: string;
  userId: string;
};
const actionClass = lessonAction;

export function StaffSolutionDialog(props: Context & { lectureId: string }) {
  const { t } = useTranslation('practice');
  const { open, setOpen, portalContainer } = useWorkspaceDialog();
  return <Modal open={open} onOpenChange={setOpen}>
    <ModalTrigger className={actionClass} type="button"><CircleCheck aria-hidden className="size-4 shrink-0" />{t('solutions')}</ModalTrigger>
    <ModalContent title={t('solutions')} description={t('solution_description')} className="max-w-4xl" portalContainer={portalContainer}>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">{open ? <SolutionContents {...props} /> : null}</div>
      <DialogFooter close={() => setOpen(false)} />
    </ModalContent>
  </Modal>;
}

function SolutionContents({ academyId, courseId, lectureId, materialId, userId }: Context & { lectureId: string }) {
  const { t } = useTranslation('practice');
  const query = useQuery({
    queryKey: ['staff-solution-dialog', academyId, userId, courseId, lectureId, materialId],
    queryFn: () => orpc.academyCourses.getExerciseSolution({ academyId, courseId, lectureId, materialId }),
    retry: false,
    gcTime: 0,
  });
  if (query.isError) return <DialogError message={t('solution_error')} retry={() => void query.refetch()} />;
  if (!query.data) return <p role="status" className="text-sm text-sub">{t('dialog_loading')}</p>;
  return query.data.solutions.length ? <div className="space-y-5">{query.data.solutions.map((solution, index) => <SolutionAnswerBlock key={index} solution={solution} index={index} fontSize={14} />)}</div> : <p className="text-sm text-sub">{t('no_solutions')}</p>;
}

function DialogError({ message, retry }: { message: string; retry: () => void }) {
  const { t } = useTranslation('practice');
  return <div role="alert" className="space-y-3 text-sm"><p className="text-danger">{message}</p><button type="button" className={actionClass} onClick={retry}>{t('dialog_retry')}</button></div>;
}

function DialogFooter({ close }: { close: () => void }) {
  const { t } = useTranslation('practice');
  return <div className="flex shrink-0 justify-end border-t border-border px-6 py-4"><button type="button" onClick={close} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand hover:bg-brand-deep">{t('close')}</button></div>;
}

function useWorkspaceDialog() {
  const [open, changeOpen] = React.useState(false);
  const [portalContainer, setPortalContainer] = React.useState<HTMLElement | null>(null);
  const setOpen = (value: boolean) => {
    if (value) setPortalContainer(document.fullscreenElement as HTMLElement | null);
    changeOpen(value);
  };
  return { open, setOpen, portalContainer };
}
