'use client';
import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { MonitoringStudentContext, MaterialType } from '@cove/shared';
import { useObservationWatch } from '@/lib/monitoring/use-observation-watch';
import { orpc } from '@/lib/orpc';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { routes } from '@/lib/routes';
import { WorkspaceCurriculumNavigator } from '@/components/workspace/curriculum-navigator';
import { StudentSwitcher } from './student-switcher';
import { LiveHelpQueue } from './help-queue';
import { ObservedMaterialView } from './observed-material-view';
import { useObservationTranslation } from './use-observation-translation';
import { LiveWorkspace } from '@/app/(studio)/academy/[academySlug]/teach/classes/[classId]/students/[membershipId]/live/_components/live-workspace';

export function AllMaterialMonitor(props: { academyId: string; classId: string; membershipId: string;
  context: MonitoringStudentContext; teacherMembershipRef: string | null; initialMaterialId?: string | null }) {
  const { academyId, classId, membershipId, context } = props;
  const slug = useAcademySlug();
  const { t } = useObservationTranslation();
  const watch = useObservationWatch({ academyId, classId, membershipId });
  const [selected, setSelected] = React.useState<string | null>(props.initialMaterialId ?? null);
  const [outline, setOutline] = React.useState(true);
  const [alignment, setAlignment] = React.useState(0);
  const [codeAttached, setCodeAttached] = React.useState(false);
  const [initialized, setInitialized] = React.useState(false);
  const transition = React.useRef<(() => Promise<boolean>) | null>(null);
  const current = watch.snapshot;
  const currentRef = React.useRef(current);
  React.useEffect(() => { currentRef.current = current; }, [current]);
  React.useEffect(() => {
    const pop = () => { const id = new URL(location.href).searchParams.get('materialId');
      void (async () => { if (transition.current && !await transition.current()) return;
        setSelected(id ?? currentRef.current?.materialId ?? null); setCodeAttached(currentRef.current?.type === 'PROGRAMMING_EXERCISE' && (!id || id === currentRef.current.materialId)); })(); };
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, []);
  const id = selected ?? current?.materialId ?? null;
  const material = useQuery({ queryKey: ['observed-material', academyId, classId, membershipId, id],
    queryFn: () => orpc.monitoring.getObservedMaterial({ academyId, classId, membershipId, materialId: id! }),
    enabled: Boolean(id) && !codeAttached && watch.state !== 'revoked', retry: false });
  const shown = material.data;
  const select = React.useCallback(async (materialId: string, type?: MaterialType) => {
    if (type !== 'PROGRAMMING_EXERCISE' && transition.current && !await transition.current()) return;
    const url = new URL(location.href); url.searchParams.set('materialId', materialId);
    window.history.pushState(null, '', url);
    setSelected(materialId); setAlignment(value => value + 1);
    setCodeAttached(type === 'PROGRAMMING_EXERCISE' && currentRef.current?.type === 'PROGRAMMING_EXERCISE');
  }, []);
  const registerTransition = React.useCallback((prepare: (() => Promise<boolean>) | null) => { transition.current = prepare; }, []);
  // Freeze initial selection. Student movement never takes over staff reading.
  if ((!initialized || !selected) && current?.materialId) {
    setInitialized(true);
    if (!selected) setSelected(current.materialId);
    setCodeAttached(current.type === 'PROGRAMMING_EXERCISE' && (!selected || selected === current.materialId));
  }
  const isCurrent = Boolean(id && current?.materialId === id && current.state !== 'OFFLINE' && current.state !== 'RECONNECTING');
  if (watch.state === 'revoked') return <main role="alert" className="p-6">{t('observation.access_denied')}</main>;
  if (codeAttached) return <LiveWorkspace {...props}
    selectedMaterialId={id ?? undefined} onCodeSelected={materialId => {
      const url = new URL(location.href); url.searchParams.set('materialId', materialId); window.history.pushState(null, '', url); setSelected(materialId);
    }} onSelectMaterial={select} onRegisterTransition={registerTransition} observation={current} onReturnToObserved={() => {
      if (current?.materialId && current.type) void select(current.materialId, current.type);
    }} />;
  return <main className="flex h-dvh flex-col bg-canvas text-ink" data-testid="all-material-monitor">
    <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-3">
      <Link href={`${routes.academy(slug)}/teach/classes/${classId}`} className="text-sm font-semibold">{t('workspace.back')}</Link>
      <button type="button" className="rounded-lg border border-border px-3 py-2 text-xs" onClick={() => setOutline(value => !value)}>{t('observation.materials')}</button>
      <StudentSwitcher academyId={academyId} classId={classId} membershipId={membershipId} name={context.student.displayName ?? context.student.email ?? membershipId} className={context.class.name} />
      <span role="status" data-testid="observation-connection">{t(`connection.${watch.state}`)}</span>
      <LiveHelpQueue academyId={academyId} classId={classId} currentMembershipId={membershipId} />
    </header>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-2">
      <div><h1 className="font-bold">{shown?.title ?? t('observation.loading')}</h1><p className="text-xs text-sub" data-testid="student-current-material">{current?.materialId ? t('observation.student_on', { title: current.path?.exercise.title }) : t('observation.no_material')}</p></div>
      {current?.materialId && current.type ? <button type="button" className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-on-brand" onClick={() => void select(current.materialId!, current.type!)}>{t('observation.return_live')}</button> : null}
    </div>
    <div className="relative flex min-h-0 flex-1">
      <WorkspaceCurriculumNavigator context={shown?.navigator ?? null} displayedMaterialId={id ?? ''}
        liveMaterialId={current?.state !== 'OFFLINE' ? current?.materialId : null} open={outline} panelId="observation-curriculum" onClose={() => setOutline(false)}
        footer={{ href: `${routes.academy(slug)}/teach/classes/${classId}`, label: t('workspace.back') }}
        onSelect={materialId => { const nav = shown?.navigator;
          let type: MaterialType = 'PROGRAMMING_EXERCISE';
          for (const courseModule of nav?.course.modules ?? []) for (const lecture of courseModule.lectures) {
            if (lecture.documents?.some(item => item.materialId === materialId)) type = 'PDF_DOCUMENT';
            if (lecture.videos?.some(item => item.materialId === materialId)) type = 'VIDEO_LESSON';
            const manual = lecture.manualMaterials?.find(item => item.materialId === materialId); if (manual) type = manual.type;
          }
          void select(materialId, type);
        }} />
      <div className="min-h-0 min-w-0 flex-1 overflow-auto">
        {watch.error ? <p role="alert" className="p-4">{t('observation.load_failed')}</p> : null}
        {material.isError ? <div role="alert" className="p-5">{t('observation.load_failed')} <button className="underline" onClick={() => void material.refetch()}>{t('observation.retry')}</button></div>
          : shown ? <ObservedMaterialView key={shown.materialId} academyId={academyId} classId={classId} membershipId={membershipId} material={shown}
            work={isCurrent && watch.state === 'live' ? current?.work ?? null : null} live={isCurrent && watch.state === 'live'} alignRevision={alignment} /> : <p role="status" className="p-5">{t('observation.loading')}</p>}
      </div>
    </div>
  </main>;
}
