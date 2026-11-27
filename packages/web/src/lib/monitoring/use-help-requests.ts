'use client';

import { helpRequestChangedSchema, monitoringServerEvents, type HelpMutationResult } from '@cove/shared';
import { queryOptions, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { orpc } from '@/lib/orpc';
import { isSessionEnded } from '@/lib/session/expired-session';
import { endSession } from '@/lib/session/end-session';
import { createClient } from '@/lib/supabase/client';
import type { Socket } from 'socket.io-client';

export const helpQueryKey = (academyId: string, classId: string) => ['help-requests', academyId, classId] as const;
/** One student's own request in a class, as every place that shows it reads it. */
export const myHelpRequestKey = (academyId: string, classId: string, userId: string) =>
  [...helpQueryKey(academyId, classId), 'self', userId] as const;
/**
 * The student's own request, as every observer of it reads it.
 *
 * One definition for all of them: TanStack Query keeps a single query per key
 * and each observer writes its options onto it, so an observer with another
 * `queryFn` (once `skipToken`) would replace the real one, and the next
 * refresh would fail in the header's control.
 */
export function myHelpRequestQuery(academyId: string, classId: string, userId: string) {
  return queryOptions({
    queryKey: myHelpRequestKey(academyId, classId, userId),
    queryFn: async ({ signal }) => {
      try { return { ...await orpc.monitoring.getMyActiveHelpRequest({ academyId, classId }, { signal }), denied: false }; }
      catch (error) { if (helpAccessDenied(error)) return { request: null, latestClosed: null, teacherAssigned: false, serverTime: new Date().toISOString(), denied: true }; throw error; }
    },
    retry: false,
    gcTime: 0,
  });
}
/** Asks the mounted request control to send; see `RequestHelp`. */
export const askTeacherEvent = 'cove:ask-teacher';
export function helpAccessDenied(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return !!code && ['MONITORING_DISABLED', 'MONITORING_ACCESS_DENIED', 'PERMISSION_DENIED', 'ACADEMY_MEMBERSHIP_SUSPENDED', 'ACADEMY_NOT_FOUND', 'USER_SUSPENDED'].includes(code);
}

/** Notifications are hints; HTTP reads remain authoritative, with visible-only recovery. */
export function useHelpRefresh(academyId: string, classId: string, socket: Socket | null) {
  const client = useQueryClient();
  const refresh = React.useCallback(() => client.invalidateQueries({ queryKey: helpQueryKey(academyId, classId) }), [client, academyId, classId]);
  React.useEffect(() => {
    const changed = (payload: unknown) => {
      const parsed = helpRequestChangedSchema.safeParse(payload);
      if (parsed.success && parsed.data.academyId === academyId && parsed.data.classId === classId) void refresh();
    };
    const ready = () => { void refresh(); };
    const visible = () => { if (document.visibilityState === 'visible') ready(); };
    socket?.on(monitoringServerEvents.helpRequestChanged, changed);
    socket?.on(monitoringServerEvents.classSnapshot, ready);
    socket?.on(monitoringServerEvents.accessRevoked, ready);
    socket?.on('connect', ready);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    const interval = setInterval(visible, 30_000);
    ready();
    return () => {
      clearInterval(interval);
      socket?.off(monitoringServerEvents.helpRequestChanged, changed);
      socket?.off(monitoringServerEvents.classSnapshot, ready);
      socket?.off(monitoringServerEvents.accessRevoked, ready);
      socket?.off('connect', ready);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', visible);
    };
  }, [academyId, classId, socket, refresh]);
  return refresh;
}

export function useHelpClock(serverTime?: string, receivedAt?: number) {
  const [now, setNow] = React.useState(0);
  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = setInterval(tick, 15_000);
    return () => clearInterval(timer);
  }, []);
  return serverTime ? Date.parse(serverTime) + Math.max(0, now - (receivedAt ?? now)) : now;
}

/** Preserve the exact operation/key after an uncertain network result. */
export function useHelpOperation(refresh: () => Promise<unknown>, onSaved?: (result: HelpMutationResult) => Promise<void>) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<'failed' | 'conflict' | 'rate_limited' | null>(null);
  const [retry, setRetry] = React.useState<(() => Promise<HelpMutationResult>) | null>(null);
  const running = React.useRef(false);
  const run = async (operation: () => Promise<HelpMutationResult>) => {
    if (running.current) return null;
    running.current = true;
    setBusy(true); setError(null);
    try {
      const result = await operation();
      setRetry(null);
      if (result.conflict) setError('conflict');
      await onSaved?.(result);
      void refresh().catch(() => {});
      return result;
    } catch (failure) {
      if (isSessionEnded(failure)) void endSession();
      setRetry(() => operation); setError((failure as { code?: string })?.code === 'RATE_LIMITED' ? 'rate_limited' : 'failed');
      await refresh();
      return null;
    } finally { running.current = false; setBusy(false); }
  };
  return { busy, error, run, retry: retry ? () => run(retry) : null };
}

/** Cache ownership follows sign-in changes, even without a full document reload. */
export function useHelpActor() {
  const [actor, setActor] = React.useState<string | null>(null);
  React.useEffect(() => {
    const { data: { subscription } } = createClient().auth.onAuthStateChange((_event, session) => setActor(session?.user.id ?? null));
    return () => subscription.unsubscribe();
  }, []);
  return actor;
}
