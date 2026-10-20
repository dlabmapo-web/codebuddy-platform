'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { Modal, ModalContent, ModalTrigger } from '@/components/studio/primitives';
import { useClassPresence } from '@/lib/monitoring/use-class-presence';
import { orpc } from '@/lib/orpc';
import { activeProblemStudents } from '../_lib/active-problem-students';

type Context = {
  academyId: string;
  courseId: string;
  materialId: string;
  userId: string;
};
const actionClass = 'rounded-lg px-2 py-1.5 text-xs font-semibold text-sub hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40';

export function StaffSolutionDialog(props: Context & { lectureId: string }) {
  const { t } = useTranslation('practice');
  const { open, setOpen, portalContainer } = useWorkspaceDialog();
  return <Modal open={open} onOpenChange={setOpen}>
    <ModalTrigger className={actionClass} type="button">{t('solutions')}</ModalTrigger>
    <ModalContent title={t('solutions')} description={t('solution_description')} className="max-w-3xl" portalContainer={portalContainer}>
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
  return query.data.solutions.length ? <div className="space-y-4">{query.data.solutions.map((solution, index) => <section key={index} className="overflow-hidden rounded-lg border border-border">
    <h3 className="border-b border-border bg-brand-soft px-4 py-3 text-sm font-bold text-brand">{solution.title ?? t('solution_n', { number: index + 1 })}</h3>
    <pre className="overflow-x-auto p-4 font-mono text-sm leading-6"><code>{solution.code}</code></pre>
  </section>)}</div> : <p className="text-sm text-sub">{t('no_solutions')}</p>;
}

export function StaffObserveDialog(props: Context & { assignedTeacher: boolean }) {
  const { t } = useTranslation('practice');
  const { open, setOpen, portalContainer } = useWorkspaceDialog();
  return <Modal open={open} onOpenChange={setOpen}>
    <ModalTrigger type="button" className={`inline-flex items-center gap-1.5 ${actionClass}`}><Users aria-hidden className="size-4" />{t('observe')}</ModalTrigger>
    <ModalContent title={t('observe')} description={t('observe_description')} className="max-w-xl" portalContainer={portalContainer}>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {open ? props.assignedTeacher ? <ObservationContents {...props} /> : <p className="text-sm text-sub">{t('observe_no_classes')}</p> : null}
      </div>
      <DialogFooter close={() => setOpen(false)} />
    </ModalContent>
  </Modal>;
}

function ObservationContents({ academyId, courseId, materialId, userId }: Context) {
  const { t } = useTranslation('practice');
  const query = useQuery({
    queryKey: ['staff-observe-dialog', academyId, userId, courseId, materialId],
    queryFn: () => orpc.academyTeacherStudents.roster({ academyId, courseId }),
    // Recheck enrollment and assignment while open; presence itself is live.
    refetchInterval: 15_000,
    retry: false,
    gcTime: 0,
  });
  if (query.isError) return <DialogError message={t('observe_error')} retry={() => void query.refetch()} />;
  if (!query.data) return <p role="status" className="text-sm text-sub">{t('dialog_loading')}</p>;
  return <div className="space-y-4">
    {query.data.truncated ? <p role="status" className="text-sm text-warning">{t('observe_truncated')}</p> : null}
    {query.data.classes.length ? query.data.classes.map((entry) => <LiveClassStudents key={entry.classId} academyId={academyId} courseId={courseId} materialId={materialId} entry={entry} />) : <p className="text-sm text-sub">{t('observe_empty')}</p>}
  </div>;
}

function LiveClassStudents({ academyId, courseId, materialId, entry }: {
  academyId: string; courseId: string; materialId: string;
  entry: import('@cove/shared').TeacherRosterClass;
}) {
  const { t } = useTranslation('practice');
  const presence = useClassPresence({ academyId, classId: entry.classId });
  const students = presence.snapshotReady ? activeProblemStudents(entry.students, presence.entries, courseId, materialId) : [];
  return <section className="overflow-hidden rounded-lg border border-border">
    <h3 className="bg-brand-soft px-4 py-3 text-sm font-bold text-brand">{entry.name}</h3>
    {!presence.snapshotReady ? presence.state === 'connecting' || presence.state === 'resynchronizing' ? <p role="status" className="p-4 text-sm text-sub">{t('observe_connecting')}</p> : <div className="p-4"><DialogError message={t('observe_unavailable')} retry={presence.refresh} /></div>
      : students.length ? <ul className="divide-y divide-border">{students.map((student) => <li key={student.membershipId} className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{student.displayName}</p>{student.username ? <p className="truncate text-xs text-sub">{student.username}</p> : null}</div>
        <span className="shrink-0 rounded-full bg-brand-soft px-2 py-1 text-xs font-semibold text-brand">{t('observe_solving')}</span>
      </li>)}</ul> : <p role="status" className="p-4 text-sm text-sub">{t('observe_empty')}</p>}
  </section>;
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
