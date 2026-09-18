'use client';

import { type HelpRequest } from '@cove/shared';
import * as Popover from '@radix-ui/react-popover';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ExternalLink, Hand, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { Socket } from 'socket.io-client';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';
import { mergeRoster, type RosterRow } from '@/lib/monitoring/roster';
import { useClassPresence } from '@/lib/monitoring/use-class-presence';
import { helpAccessDenied, helpQueryKey, useHelpActor, useHelpClock, useHelpOperation, useHelpRefresh } from '@/lib/monitoring/use-help-requests';
import { HelpWait } from './help-wait';

const buttonBase = 'inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 disabled:opacity-50';
const button = `${buttonBase} border-border bg-card text-ink hover:bg-canvas`;
const startButton = `${buttonBase} border-brand bg-brand text-on-brand hover:brightness-90`;
const resolveButton = `${buttonBase} border-success bg-success text-on-success hover:brightness-90`;
type Props = {
  academyId: string; classId: string; socket: Socket | null; rows: RosterRow[];
  presenceReady: boolean; revoked?: boolean; popover?: boolean; currentMembershipId?: string;
  prepare?: () => Promise<boolean>; cancel?: () => void;
};

function useQueueGroup(academyId: string, classId: string, status: 'WAITING' | 'IN_PROGRESS', actor: string | null) {
  return useInfiniteQuery({
    queryKey: [...helpQueryKey(academyId, classId), 'queue', actor, status],
    enabled: !!actor,
    queryFn: async ({ pageParam, signal }) => {
      try { return { ...await orpc.monitoring.listClassHelpRequests({ academyId, classId, status, limit: 50, ...(pageParam ? { cursor: pageParam } : {}) }, { signal }), denied: false }; }
      catch (error) { if (helpAccessDenied(error)) return { requests: [], waitingCount: 0, inProgressCount: 0, nextCursor: null, serverTime: new Date().toISOString(), denied: true }; throw error; }
    },
    initialPageParam: undefined as { time: string; id: string } | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined,
    retry: false, gcTime: 0,
  });
}

/** Standalone live-workspace subscription; it never owns or closes the live watch. */
export function LiveHelpQueue(props: Pick<Props, 'academyId' | 'classId' | 'prepare' | 'cancel' | 'currentMembershipId'>) {
  const presence = useClassPresence(props);
  const roster = useQuery({ queryKey: ['academy', props.academyId, 'help-roster', props.classId], queryFn: () => orpc.monitoring.getClassRoster(props), retry: false, gcTime: 0, refetchInterval: 30_000 });
  const rows = roster.data ? mergeRoster(roster.data.students, presence.entries, roster.data.exercises) : [];
  return <HelpQueue {...props} popover socket={presence.socket} rows={rows} presenceReady={presence.snapshotReady && !roster.isError} revoked={presence.state === 'revoked' || helpAccessDenied(roster.error)} />;
}

export function HelpQueue({ academyId, classId, socket, rows, presenceReady, revoked, popover, currentMembershipId, prepare, cancel }: Props) {
  const { t } = useTranslation('monitoring');
  const slug = useAcademySlug();
  const router = useRouter();
  const refresh = useHelpRefresh(academyId, classId, socket);
  const actor = useHelpActor();
  const waiting = useQueueGroup(academyId, classId, 'WAITING', actor);
  const progress = useQueueGroup(academyId, classId, 'IN_PROGRESS', actor);
  const operation = useHelpOperation(refresh);
  const [open, setOpen] = React.useState(false);
  const [preparing, setPreparing] = React.useState(false);
  const [navigationFailed, setNavigationFailed] = React.useState(false);
  const generation = React.useRef(0);
  const cancelRef = React.useRef(cancel);
  React.useEffect(() => { cancelRef.current = cancel; }, [cancel]);
  React.useEffect(() => () => { generation.current += 1; cancelRef.current?.(); }, []);
  const stop = () => { generation.current += 1; cancel?.(); setPreparing(false); };
  const meta = waiting.data?.pages[0];
  const now = useHelpClock(meta?.serverTime, waiting.dataUpdatedAt);
  const denied = revoked || waiting.data?.pages.some(page => page.denied) || progress.data?.pages.some(page => page.denied) || helpAccessDenied(waiting.error) || helpAccessDenied(progress.error);
  const failed = waiting.isError || progress.isError;
  const busy = operation.busy || preparing;
  const unavailable = denied || failed || busy || !!operation.retry;
  const hasWaiting = !denied && !failed && (meta?.waitingCount ?? 0) > 0;
  const hasHelping = !denied && !failed && (meta?.inProgressCount ?? 0) > 0;
  const summary = denied || failed ? '—' : meta
    ? t('help.queue_summary', { waiting: meta.waitingCount, helping: meta.inProgressCount })
    : t('help.loading');
  const triggerStyle = hasWaiting
    ? 'border-warning bg-warning text-on-warning hover:brightness-90'
    : hasHelping ? 'border-brand bg-brand text-on-brand hover:brightness-90'
      : 'border-border bg-card text-ink hover:bg-canvas';

  const navigate = async (row: HelpRequest, claim: boolean) => {
    const destination = rows.find(student => student.membershipId === row.studentMembershipRef);
    const canNavigate = presenceReady && !!destination?.canOpenLive && row.studentMembershipRef !== currentMembershipId;
    const ticket = ++generation.current;
    setNavigationFailed(false);
    if (canNavigate && prepare) {
      setPreparing(true);
      const ready = await prepare();
      if (generation.current !== ticket) return;
      setPreparing(false);
      if (!ready) { setNavigationFailed(true); cancel?.(); return; }
    }
    if (claim) {
      const input = { academyId, requestId: row.id, expectedVersion: row.version, idempotencyKey: crypto.randomUUID() };
      const result = await operation.run(() => orpc.monitoring.claimHelpRequest(input));
      if (!result || result.conflict) { cancel?.(); return; }
    }
    if (canNavigate && generation.current === ticket) {
      try { router.push(routes.academyTeachStudentLive(slug, classId, row.studentMembershipRef), { scroll: false }); setOpen(false); }
      catch { setNavigationFailed(true); cancel?.(); }
    } else cancel?.();
  };
  const change = (row: HelpRequest, action: 'resolve' | 'return') => {
    const input = { academyId, requestId: row.id, expectedVersion: row.version, idempotencyKey: crypto.randomUUID() };
    void operation.run(() => action === 'resolve' ? orpc.monitoring.resolveHelpRequest(input) : orpc.monitoring.returnHelpRequest(input));
  };

  const content = <section aria-label={t('help.title')} data-testid="help-queue" className="min-w-0 space-y-3">
    <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-bold"><Hand aria-hidden className="size-4 text-brand" />{t('help.title')}</h2>{popover ? <Popover.Close aria-label={t('help.close')} className={button}><X aria-hidden className="size-4" /></Popover.Close> : null}</div>
    {denied ? <p role="status" className="text-sm text-sub">{t('help.unavailable')}</p> : <>
      {failed || operation.error || navigationFailed ? <div role="alert" className="rounded-lg border border-danger/25 p-3 text-xs text-danger"><p>{t(navigationFailed ? 'switcher.failed' : operation.error === 'conflict' ? 'help.conflict' : operation.error === 'rate_limited' ? 'help.rate_limited' : 'help.failed')}</p><button className={`${button} mt-2`} disabled={busy} type="button" onClick={() => operation.retry ? void operation.retry() : void refresh()}>{t('help.retry')}</button></div> : null}
      {!presenceReady ? <p className="text-xs text-sub">{t('help.presence_unavailable')}</p> : null}
      {preparing ? <div role="status" className="text-xs text-sub">{t('switcher.waiting')} <button className={button} type="button" onClick={stop}>{t('switcher.stay')}</button></div> : null}
      {waiting.isPending || progress.isPending ? <p role="status" className="text-sm text-sub">{t('help.loading')}</p> : null}
      {!failed && meta?.waitingCount === 0 && meta.inProgressCount === 0 ? <p className="py-3 text-sm text-sub">{t('help.empty')}</p> : null}
      {(['WAITING', 'IN_PROGRESS'] as const).map(status => {
        const query = status === 'WAITING' ? waiting : progress;
        const unique = new Map(query.data?.pages.flatMap(page => page.requests).map(row => [row.id, row]));
        const count = status === 'WAITING' ? meta?.waitingCount : meta?.inProgressCount;
        return <div key={status} className="space-y-2">
          <h3 className={`border-b border-border pb-2 text-xs font-bold ${status === 'WAITING' ? 'text-warning' : 'text-brand'}`}>{t(status === 'WAITING' ? 'help.waiting' : 'help.in_progress')} · {count ?? '—'}</h3>
          <ul className="divide-y divide-border">{[...unique.values()].map(row => {
            const student = rows.find(item => item.membershipId === row.studentMembershipRef);
            const canOpen = presenceReady && student?.canOpenLive;
            const href = routes.academyTeachStudentLive(slug, classId, row.studentMembershipRef);
            return <li key={row.id} data-testid={`help-request-${row.id}`} className="space-y-2 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="text-sm font-semibold text-ink">{row.studentName ?? t('help.student')}</p><HelpWait request={row} now={now} /></div>
              <p className="break-words text-xs text-sub">{t('help.requested_for', { problem: row.problemTitle ?? t('help.problem') })}</p>
              {presenceReady ? <p className="text-xs text-sub">{student?.materialId && student.materialId !== row.materialId ? t('help.current_problem', { problem: student.exercise?.title ?? t('help.problem') }) : t(`state.${student?.state ?? 'OFFLINE'}`)}</p> : null}
              {row.teacherMembershipRef ? <p className="text-xs font-semibold text-brand">{t('help.claimed_by', { name: row.teacherName ?? t('help.teacher') })}</p> : null}
              <div className="flex flex-wrap gap-2">
                {status === 'WAITING' ? <button type="button" disabled={unavailable} className={startButton} onClick={() => void navigate(row, true)}>{t('help.start')}</button> : <button type="button" disabled={unavailable} className={button} onClick={() => change(row, 'return')}>{t('help.return')}</button>}
                {canOpen ? <><button type="button" disabled={unavailable} className={button} onClick={() => void navigate(row, false)}>{t('help.open_live')}</button><Link prefetch={false} href={href} target="_blank" rel="noopener noreferrer" className={button} title={t('switcher.new_tab', { name: row.studentName ?? t('help.student') })} aria-label={t('switcher.new_tab', { name: row.studentName ?? t('help.student') })}><ExternalLink aria-hidden className="size-3.5" /></Link></> : null}
                <button type="button" disabled={unavailable} className={resolveButton} onClick={() => change(row, 'resolve')}>{t('help.resolve')}</button>
              </div>
            </li>;
          })}</ul>
          {query.hasNextPage ? <button type="button" disabled={query.isFetching || unavailable} className={button} onClick={() => void query.fetchNextPage()}>{t('help.load_more')}</button> : null}
        </div>;
      })}
    </>}
  </section>;
  if (!popover) return <div className="rounded-card border border-border bg-surface p-4">{content}</div>;
  return <Popover.Root open={open} onOpenChange={value => { if (!value && operation.busy) return; if (!value) stop(); setOpen(value); if (value) void refresh(); }}>
    <Popover.Trigger className={`${buttonBase} ${triggerStyle}`}><Hand aria-hidden className="size-4 shrink-0" /><span>{t('help.title')} · {summary}</span></Popover.Trigger>
    <Popover.Portal><Popover.Content sideOffset={8} align="end" className="z-50 max-h-[min(600px,80dvh)] w-[420px] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-xl">{content}</Popover.Content></Popover.Portal>
  </Popover.Root>;
}
