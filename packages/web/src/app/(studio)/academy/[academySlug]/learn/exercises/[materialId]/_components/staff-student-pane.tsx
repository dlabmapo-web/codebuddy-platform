'use client';
import * as React from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, X, MessageSquare, Play, Square, LockKeyhole, Pencil } from 'lucide-react';
import type { MonitoringStudentContext } from '@cove/shared';
import { orpc } from '@/lib/orpc';
import { useLiveWorkspace } from '@/lib/monitoring/use-live-workspace';
import { usePythonRunner } from '@/lib/workspace/use-python-runner';
import { TerminalPanel } from '@/components/workspace/terminal-panel';
import { EDITOR_FONT_FAMILY, registerPaircodeTheme } from '@/lib/monaco/theme';
import { LiveEditor } from '@/app/(studio)/academy/[academySlug]/teach/classes/[classId]/students/[membershipId]/live/_components/live-editor';
import { FeedbackDock } from '@/app/(studio)/academy/[academySlug]/teach/classes/[classId]/students/[membershipId]/live/_components/live-feedback';
import { HelpModeToggle } from '@/app/(studio)/academy/[academySlug]/teach/classes/[classId]/students/[membershipId]/live/_components/help-mode-toggle';
import type { TutoringStudent } from './staff-tutoring-drawer';
const MonacoEditor = dynamic(() => import('@/lib/monaco/editor'), { ssr: false });
export type TutoringTransitionGuard = { current: (() => Promise<boolean>) | null };
type Props = { academyId: string; materialId: string; userId: string; starterCode: string; student: TutoringStudent; beforeChangeRef: TutoringTransitionGuard; close: () => Promise<boolean> };

export function StaffStudentPane(props: Props) {
  const { t } = useTranslation('practice');
  const { academyId, materialId, student } = props;
  const context = useQuery({ queryKey: ['staff-selected-student', academyId, props.userId, student.classId, student.membershipId, materialId], queryFn: () => orpc.monitoring.getStudentContext({ academyId, classId: student.classId, membershipId: student.membershipId, materialId, includeDraftCode: true }), refetchInterval: 15_000, retry: false, gcTime: 0 });
  if (context.isError) return <div className="flex h-full flex-col gap-4 bg-card p-5" role="alert"><p>{t('tutoring_student_unavailable')}</p><button type="button" onClick={() => void props.close()} className="self-start font-bold text-brand">{t('tutoring_own_code')}</button></div>;
  if (!context.data) return <p role="status" className="p-5 text-sm text-sub">{t('dialog_loading')}</p>;
  return <StudentSession {...props} context={context.data} />;
}
function StudentSession({ academyId, materialId, userId, student, context, starterCode, beforeChangeRef, close }: Props & { context: MonitoringStudentContext }) {
  const { t } = useTranslation('practice');
  const { t: tm } = useTranslation('monitoring');
  const live = useLiveWorkspace({ academyId, classId: student.classId, studentMembershipId: student.membershipId });
  const runner = usePythonRunner();
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const [terminal, setTerminal] = React.useState<'you' | 'student'>('you');
  const exact = live.session?.materialId === materialId;
  const synchronized = exact && live.canEdit;
  const history = useQuery({ queryKey: ['tutoring-last-attempt', academyId, userId, student.classId, student.membershipId, materialId], queryFn: () => orpc.teacherProgress.listAttempts({ academyId, classId: student.classId, membershipId: student.membershipId, materialId, page: 1 }), refetchInterval: 15_000, retry: false, gcTime: 0 });
  const latest = history.data?.attempts[0];
  const feedback = useQuery({ queryKey: ['tutoring-feedback', academyId, userId, student.classId, student.membershipId, materialId], queryFn: () => orpc.monitoring.listFeedback({ academyId, classId: student.classId, membershipId: student.membershipId, materialId, limit: 50 }), enabled: feedbackOpen, retry: false, gcTime: 0 });
  const notes = [...new Map([...(feedback.data?.feedback ?? []), ...live.feedback].map((item) => [item.id, item])).values()];
  const stored = notes.find((item) => item.teacherMembershipRef === context.viewerMembershipId)?.body ?? '';
  // Every student change, return, and curriculum navigation waits for shared edits.
  React.useEffect(() => {
    const prepare = async () => {
      if (feedbackOpen && note.trim() !== stored.trim() && !window.confirm(t('tutoring_discard_feedback'))) return false;
      if (await live.prepareStudentSwitch()) return true;
      live.cancelStudentSwitch();
      return false;
    };
    beforeChangeRef.current = prepare;
    return () => { if (beforeChangeRef.current === prepare) beforeChangeRef.current = null; };
  }, [beforeChangeRef, feedbackOpen, live, note, stored, t]);
  async function mode(next: boolean) {
    setBusy(true);
    try { await live.setMode(next ? 'HELPING' : 'MONITORING'); }
    finally { setBusy(false); }
  }
  const savedCode = context.exercise?.draftCode ?? starterCode;
  const canRun = runner.ready && !runner.running;
  return <div className="flex h-full min-h-0 flex-col bg-card">
    <div className="grid shrink-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-card px-4 py-3 sm:flex sm:flex-wrap">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft font-bold text-brand">{[...student.displayName][0]}</span>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{student.displayName}</p><p className="truncate text-xs text-sub">{student.identifier}</p></div>
      <button type="button" onClick={() => void close()} aria-label={t('tutoring_own_code')} className="rounded-lg p-2 text-sub hover:bg-canvas sm:order-last"><X className="size-4" /></button>
      <div className="col-span-3 flex min-w-0 flex-wrap items-center gap-3 sm:contents">
        <div className="text-xs text-sub sm:text-right"><p>{t('tutoring_last_submission')}</p><p className="mt-1 font-semibold text-ink">{latest ? new Date(latest.createdAt).toLocaleString() : t(history.isError ? 'tutoring_status_unknown' : 'tutoring_not_submitted')}</p></div>
        <div className="border-l border-border pl-3 text-right text-xs text-sub"><p>{t('tutoring_score')}</p><p className="mt-1 font-bold text-ink">{latest ? `${latest.score}/100` : '—'}</p></div>
        <button type="button" onClick={() => setFeedbackOpen(!feedbackOpen)} aria-expanded={feedbackOpen} className="inline-flex items-center gap-1.5 rounded-lg border border-brand/20 bg-brand-soft px-3 py-2 text-xs font-bold text-brand"><MessageSquare aria-hidden className="size-3.5" />{t('tutoring_feedback')}</button>
      </div>
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-canvas px-4 py-2">
      <p className="flex items-center gap-2 text-xs text-sub">{synchronized && live.helping ? <Pencil aria-hidden className="size-3.5 text-brand" /> : <LockKeyhole aria-hidden className="size-3.5" />}{t(synchronized && live.helping ? 'tutoring_editing' : 'tutoring_readonly')}</p>
      <HelpModeToggle busy={busy} disabled={!synchronized || Boolean(live.pendingRecovery)} helping={exact && live.helping} onToggle={(next) => void mode(next)} />
    </div>
    {live.pendingRecovery ? <div role="status" className="flex shrink-0 gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs"><span>{tm('workspace.pending_blocked')}</span><button type="button" onClick={live.follow}>{t('dialog_retry')}</button><button type="button" onClick={() => {
      const url = URL.createObjectURL(new Blob([live.text.toString()], { type: 'text/plain' }));
      const link = document.createElement('a'); link.href = url; link.download = 'unsynced-teacher-code.py'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>{t('download')}</button></div> : null}
    {!synchronized ? <p role="status" className="shrink-0 border-b border-border px-4 py-2 text-xs text-sub">{t('tutoring_saved_snapshot')} <button type="button" onClick={live.follow} className="font-bold text-brand">{t('dialog_retry')}</button></p> : null}
    <div className="flex min-h-32 flex-1 flex-col bg-editor-bg">
      {synchronized ? <LiveEditor fontSize={13} onCursor={live.publishCursor} peerName={student.displayName} readOnly={!live.canEditCode} remoteCursor={live.remote.cursor} text={live.text} /> : <MonacoEditor beforeMount={registerPaircodeTheme} language="python" theme="paircode-dark" height="100%" value={savedCode} options={{ ariaLabel: t('tutoring_saved_code'), automaticLayout: true, readOnly: true, fontFamily: EDITOR_FONT_FAMILY, fontSize: 13, minimap: { enabled: false }, scrollBeyondLastLine: false }} />}
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-y border-border bg-canvas px-3 py-2">
      <button type="button" disabled={!canRun} onClick={() => { setTerminal('you'); void runner.run(synchronized ? live.text.toString() : savedCode); }} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-bold text-on-brand hover:bg-brand-deep disabled:opacity-50"><Play aria-hidden className="size-3.5" />{t('tutoring_run')}</button>
      {runner.running ? <button type="button" onClick={runner.stop} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-bold"><Square aria-hidden className="size-3.5" />{t('tutoring_stop')}</button> : null}
      <button type="button" aria-pressed={terminal === 'you'} onClick={() => setTerminal('you')} className="px-2 py-1 text-xs font-semibold text-sub">{t('tutoring_your_output')}</button>
      <button type="button" aria-pressed={terminal === 'student'} disabled={!synchronized} onClick={() => setTerminal('student')} className="px-2 py-1 text-xs font-semibold text-sub disabled:opacity-40">{t('tutoring_student_output')}</button>
      <button type="button" onClick={() => void close()} className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-brand"><ArrowLeft className="size-3.5" />{t('tutoring_own_code')}</button>
    </div>
    <div className="h-44 min-h-24 shrink-0 overflow-hidden bg-editor-bg">
      <TerminalPanel lines={terminal === 'you' ? runner.lines : live.terminal.lines} awaitingInput={terminal === 'you' ? runner.awaitingInput : live.terminal.awaitingInput} supported={runner.supported} mode={terminal === 'you' ? 'interactive' : 'mirror'} onSubmitInput={runner.submitInput} onEndInput={runner.endInput} />
    </div>
    {feedbackOpen ? feedback.isError ? <p role="alert" className="p-3 text-sm text-danger">{t('tutoring_feedback_error')}</p> : <div className="max-h-64 shrink-0 overflow-auto"><FeedbackDock canSend={synchronized} draft={note} feedback={notes} materialId={materialId} onDraftChange={setNote} onHydrate={setNote} onSend={async (body) => {
      const result = await live.sendFeedback(body);
      if (result?.ok) { void feedback.refetch(); setNote(body); }
      return result;
    }} teacherMembershipRef={context.viewerMembershipId} /></div> : null}
  </div>;
}
