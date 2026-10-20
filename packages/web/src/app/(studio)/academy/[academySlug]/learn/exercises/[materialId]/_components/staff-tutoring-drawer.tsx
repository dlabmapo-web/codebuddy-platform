'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, Users, X } from 'lucide-react';
import type { MonitoringRosterStudent, TeacherProblemStudentRow } from '@cove/shared';
import { Sheet, SheetContent, SheetTrigger } from '@/components/studio/primitives';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { useClassPresence } from '@/lib/monitoring/use-class-presence';
import { mergeRoster } from '@/lib/monitoring/roster';
import { orpc } from '@/lib/orpc';
import { matchesTutoringStudent, type TutoringFilter } from '../_lib/tutoring-students';

export type TutoringStudent = {
  classId: string;
  membershipId: string;
  displayName: string;
  identifier: string | null;
};
type Props = {
  academyId: string; courseId: string; materialId: string; userId: string;
  assignedTeacher: boolean; selected: TutoringStudent | null;
  onSelect: (student: TutoringStudent) => Promise<boolean>;
};

export function StaffTutoringDrawer(props: Props) {
  const { t } = useTranslation('practice');
  const [open, setOpen] = React.useState(false);
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<TutoringFilter>('all');
  const [classId, setClassId] = React.useState('all');
  const [selecting, setSelecting] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  async function select(student: TutoringStudent) {
    setSelecting(true); setFailed(false);
    try { if (await props.onSelect(student)) setOpen(false); else setFailed(true); }
    catch { setFailed(true); }
    finally { setSelecting(false); }
  }
  return <Sheet open={open} onOpenChange={(next) => { if (next) setContainer(document.fullscreenElement as HTMLElement | null); setOpen(next); }}>
    <SheetTrigger className="inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-3 py-2 text-xs font-bold text-brand hover:bg-brand/15" type="button"><Users aria-hidden className="size-4" />{t('tutoring')}</SheetTrigger>
    <SheetContent className="w-[420px] max-w-[100vw] border-r border-border bg-card" portalContainer={container} title={t('tutoring')}>
      <div className="flex items-center justify-between px-5 py-5"><h2 className="text-xl font-bold">{t('tutoring')}</h2><button type="button" onClick={() => setOpen(false)} aria-label={t('close')} className="rounded-lg p-2 text-sub hover:bg-canvas"><X className="size-5" /></button></div>
      <div className="space-y-3 border-b border-border px-5 pb-5">
        <select aria-label={t('tutoring_filter')} value={filter} onChange={(event) => setFilter(event.target.value as TutoringFilter)} className="h-11 w-full rounded-lg border border-brand/40 bg-canvas px-3 text-sm focus:ring-2 focus:ring-brand/30">
          {(['all', 'online', 'submitted', 'not-submitted'] as const).map((value) => <option key={value} value={value}>{t(`tutoring_filters.${value}`)}</option>)}
        </select>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-canvas px-3"><Search aria-hidden className="size-5 text-sub" /><input aria-label={t('tutoring_search')} placeholder={t('tutoring_search')} value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
      </div>
      {failed ? <p role="alert" className="px-5 py-3 text-sm text-danger">{t('tutoring_switch_failed')}</p> : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {open ? props.assignedTeacher ? <TutoringClasses {...props} search={search} filter={filter} classId={classId} changeClass={setClassId} selecting={selecting} select={select} /> : <p className="p-5 text-sm text-sub">{t('observe_no_classes')}</p> : null}
      </div>
    </SheetContent>
  </Sheet>;
}

function TutoringClasses(props: Props & { search: string; filter: TutoringFilter; classId: string; changeClass: (value: string) => void; selecting: boolean; select: (student: TutoringStudent) => Promise<void> }) {
  const { t } = useTranslation('practice');
  const query = useQuery({ queryKey: ['staff-tutoring-classes', props.academyId, props.userId, props.courseId], queryFn: () => orpc.academyTeacherStudents.roster({ academyId: props.academyId, courseId: props.courseId }), refetchInterval: 15_000, retry: false, gcTime: 0 });
  if (query.isError) return <ReadFailure retry={() => void query.refetch()} />;
  if (!query.data) return <p role="status" className="p-5 text-sm text-sub">{t('dialog_loading')}</p>;
  const classes = query.data.classes;
  return <>
    <div className="flex items-center justify-between gap-3 px-5 py-4"><span className="text-sm font-semibold text-sub">{t('tutoring_count', { count: classes.reduce((count, entry) => count + entry.students.length, 0) })}</span>
      {classes.length > 1 ? <select aria-label={t('tutoring_class')} className="min-w-0 max-w-48 rounded border border-border bg-card px-2 py-1 text-xs" value={props.classId} onChange={(event) => props.changeClass(event.target.value)}><option value="all">{t('tutoring_all_classes')}</option>{classes.map((entry) => <option key={entry.classId} value={entry.classId}>{entry.name}</option>)}</select> : null}
    </div>
    {query.data.truncated ? <p className="px-5 pb-3 text-sm text-warning">{t('observe_truncated')}</p> : null}
    {classes.length ? classes.filter((entry) => props.classId === 'all' || entry.classId === props.classId).map((entry) => <TutoringClass key={entry.classId} {...props} classId={entry.classId} className={entry.name} />) : <p className="px-5 text-sm text-sub">{t('observe_no_classes')}</p>}
  </>;
}

function TutoringClass(props: Props & { classId: string; className: string; search: string; filter: TutoringFilter; selecting: boolean; select: (student: TutoringStudent) => Promise<void> }) {
  const { t } = useTranslation('practice');
  const { academyId, classId, materialId } = props;
  const presence = useClassPresence({ academyId, classId });
  const roster = useQuery({ queryKey: ['tutoring-class-roster', academyId, props.userId, classId], queryFn: () => orpc.monitoring.getClassRoster({ academyId, classId }), refetchInterval: 15_000, retry: false, gcTime: 0 });
  const progress = useQuery({ queryKey: ['tutoring-problem-status', academyId, props.userId, classId, materialId], queryFn: async () => {
    const first = await orpc.teacherProgress.listProblemStudents({ academyId, classId, materialId, page: 1 });
    const rest = await Promise.all(Array.from({ length: Math.max(0, first.pagination.pageCount - 1) }, (_, index) => orpc.teacherProgress.listProblemStudents({ academyId, classId, materialId, page: index + 2 })));
    return [...first.rows, ...rest.flatMap((page) => page.rows)];
  }, refetchInterval: 15_000, retry: false, gcTime: 0 });
  if (roster.isError || progress.isError) return <ReadFailure retry={() => { void roster.refetch(); void progress.refetch(); }} />;
  if (!roster.data || !progress.data) return <p role="status" className="px-5 py-3 text-sm text-sub">{t('dialog_loading')}</p>;
  const statuses = new Map<string, TeacherProblemStudentRow>(progress.data.map((row) => [row.membershipId, row]));
  const rows = mergeRoster(roster.data.students, presence.snapshotReady ? presence.entries : [], roster.data.exercises);
  const visible = rows.filter((row) => row.active && matchesTutoringStudent({ ...row, attempts: statuses.get(row.membershipId)?.attempts ?? null }, props.filter, props.search, materialId));
  return <section aria-label={props.className}>
    <p className="px-5 py-2 text-xs font-bold uppercase tracking-wide text-sub">{props.className}</p>
    {!presence.snapshotReady ? <p role="status" className="px-5 pb-2 text-xs text-sub">{t('observe_unavailable')}</p> : null}
    {roster.data.truncated ? <p className="px-5 py-2 text-xs text-warning">{t('observe_truncated')}</p> : null}
    {visible.length ? <ul>{visible.map((student) => {
      const status = statuses.get(student.membershipId);
      const selected = props.selected?.classId === classId && props.selected.membershipId === student.membershipId;
      return <li key={student.membershipId}><button type="button" aria-pressed={selected} disabled={props.selecting} onClick={() => void props.select(toSelection(student, classId))} className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-brand-soft disabled:opacity-50 ${selected ? 'bg-brand-soft' : ''}`}>
        <ProfileAvatar academyImageUrl={student.academyImageUrl} externalAvatarUrl={student.externalAvatarUrl} globalImageUrl={student.globalImageUrl} name={student.displayName ?? student.username ?? student.email ?? ''} size="sm" />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{student.displayName ?? student.username ?? student.email}</span><span className="block truncate text-xs text-sub">{student.email ?? student.username}</span></span>
        <span className={`shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold ${status && status.attempts > 0 ? 'border-success/30 text-success' : 'border-border bg-canvas text-sub'}`}>{status ? t(status.attempts > 0 ? 'tutoring_submitted' : 'tutoring_not_submitted') : t('tutoring_status_unknown')}</span>
      </button></li>;
    })}</ul> : <p className="px-5 py-4 text-sm text-sub">{t('tutoring_no_matches')}</p>}
  </section>;
}
function toSelection(student: MonitoringRosterStudent, classId: string): TutoringStudent {
  return { classId, membershipId: student.membershipId, displayName: student.displayName ?? student.username ?? student.email ?? student.membershipId, identifier: student.email ?? student.username };
}
function ReadFailure({ retry }: { retry: () => void }) {
  const { t } = useTranslation('practice');
  return <div role="alert" className="space-y-2 p-5 text-sm"><p className="text-danger">{t('observe_error')}</p><button type="button" onClick={retry} className="font-bold text-brand">{t('dialog_retry')}</button></div>;
}
