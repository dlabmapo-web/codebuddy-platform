'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Hand } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { Socket } from 'socket.io-client';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';
import { helpAccessDenied, helpQueryKey, useHelpClock, useHelpOperation, useHelpRefresh } from '@/lib/monitoring/use-help-requests';
import { HelpWait } from './help-wait';

export function RequestHelp({ academyId, classId, materialId, userId, socket, onNavigate }: {
  academyId: string; classId: string; materialId: string; userId: string; socket: Socket | null; onNavigate: (materialId: string) => void;
}) {
  const { t } = useTranslation('monitoring');
  const slug = useAcademySlug();
  const refresh = useHelpRefresh(academyId, classId, socket);
  const client = useQueryClient();
  const queryKey = [...helpQueryKey(academyId, classId), 'self', userId];
  const query = useQuery({ queryKey, queryFn: async ({ signal }) => {
    try { return { ...await orpc.monitoring.getMyActiveHelpRequest({ academyId, classId }, { signal }), denied: false }; }
    catch (error) { if (helpAccessDenied(error)) return { request: null, latestClosed: null, teacherAssigned: false, serverTime: new Date().toISOString(), denied: true }; throw error; }
  }, retry: false, gcTime: 0 });
  const operation = useHelpOperation(refresh, async result => {
    // The mutation returns the authorized, committed state. Cancel older reads
    // before applying it so a pre-mutation response cannot overwrite the result.
    await client.cancelQueries({ queryKey, exact: true });
    client.setQueryData<typeof query.data>(queryKey, previous => {
      if (!previous || previous.denied) return previous;
      const active = result.request?.status === 'WAITING' || result.request?.status === 'IN_PROGRESS';
      return {
        ...previous,
        request: active ? result.request : null,
        latestClosed: result.request && !active ? result.request : previous.latestClosed,
        serverTime: result.serverTime,
      };
    });
  });
  const now = useHelpClock(query.data?.serverTime, query.dataUpdatedAt);
  const request = query.data?.request;
  const [initialClosed] = React.useState(() => query.data?.latestClosed?.id);
  if (query.data?.denied || helpAccessDenied(query.error)) return null;
  const send = () => { const idempotencyKey = crypto.randomUUID(); void operation.run(() => orpc.monitoring.requestHelp({ academyId, classId, materialId, idempotencyKey })); };
  const cancel = () => { if (!request) return; const input = { academyId, requestId: request.id, expectedVersion: request.version, idempotencyKey: crypto.randomUUID() }; void operation.run(() => orpc.monitoring.cancelMyHelpRequest(input)); };
  const disabled = operation.busy || query.isPending || query.isError || !!operation.retry;
  return <div className="flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-border px-2 py-1" data-testid="student-help-request">
    {request ? <>
      <span role="status" className="text-xs font-semibold">{request.status === 'IN_PROGRESS' ? t('help.teacher_helping', { name: request.teacherName ?? t('help.teacher') }) : t('help.requested')}</span>
      <HelpWait request={request} now={now} />
      {request.materialId !== materialId ? <Link className="max-w-48 truncate text-xs text-brand" href={routes.academyLearnExercise(slug, request.materialId, { classId })} onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(request.materialId); } }}>{t('help.requested_for', { problem: request.problemTitle ?? t('help.problem') })}</Link> : null}
      <button type="button" className="rounded px-2 py-1 text-xs font-semibold text-sub focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50" disabled={disabled} onClick={cancel}>{t('help.cancel')}</button>
    </> : <>
      {query.data?.latestClosed?.status === 'RESOLVED' && query.data.latestClosed.id !== initialClosed ? <span role="status" className="text-xs text-success">{t('help.resolved')}</span> : null}
      <button type="button" className="inline-flex items-center gap-1.5 rounded px-1 py-1 text-xs font-semibold text-brand focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50" disabled={disabled} onClick={send}><Hand aria-hidden className="size-3.5" />{t(operation.busy ? 'help.sending' : 'help.request')}</button>
    </>}
    {query.data && !query.data.teacherAssigned ? <span className="text-xs text-sub">{t('help.no_teacher')}</span> : null}
    {query.isError || operation.error ? <span role="alert" className="text-xs text-danger">{t(operation.error === 'conflict' ? 'help.conflict' : operation.error === 'rate_limited' ? 'help.rate_limited' : 'help.failed')} <button type="button" disabled={operation.busy} className="underline" onClick={() => operation.retry ? void operation.retry() : void refresh()}>{t('help.retry')}</button></span> : null}
  </div>;
}
