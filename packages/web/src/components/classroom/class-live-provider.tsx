'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { monitoringServerEvents, type AccessRevokedEvent, type MonitoringClassRoster } from '@cove/shared';
import { useClassPresence } from '@/lib/monitoring/use-class-presence';
import { ClassPresenceContext, ClassTransportContext } from '@/lib/monitoring/class-monitoring-context';
import { ClassTransportPool } from '@/lib/monitoring/class-transport-pool';
import { createMonitoringSocket } from '@/lib/monitoring/socket';
import { countRoster, mergeRoster } from '@/lib/monitoring/roster';
import { claimServerRead, SERVER_READ_FRESH_MS } from '@/lib/server-read';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

type Props = { academyId: string; classId: string; academySlug: string; initialRoster: MonitoringClassRoster | null; serverReadToken: string; children: ReactNode };
const ClassLiveContext = createContext<ReturnType<typeof useClassLiveState> | null>(null);
export function useClassLive(academyId?: string, classId?: string) {
  const value = useContext(ClassLiveContext);
  return value && (!academyId || value.academyId === academyId) && (!classId || value.classId === classId) ? value : null;
}

export function ClassLiveProvider(props: Props) {
  const [pool, setPool] = useState<ClassTransportPool | null>(null);
  useEffect(() => {
    const created = new ClassTransportPool(createMonitoringSocket);
    let active = true;
    queueMicrotask(() => { if (active) setPool(created); });
    return () => { active = false; created.close(); };
  }, []);
  const transport = useMemo(() => ({ classId: props.classId, pool }), [props.classId, pool]);
  return <ClassTransportContext value={transport}><ClassLiveState {...props} /></ClassTransportContext>;
}

function useClassLiveState({ academyId, classId, academySlug, initialRoster, serverReadToken }: Props) {
  const presence = useClassPresence({ academyId, classId });
  const pathname = usePathname();
  const [classroomHref, setClassroomHref] = useState(routes.academyClassroom(academySlug, classId));
  if (pathname.includes('/classroom') && classroomHref !== pathname) setClassroomHref(pathname);
  const [seed] = useState(() => claimServerRead(serverReadToken) ? initialRoster ?? undefined : undefined);
  const query = useQuery({
    queryKey: ['academy', academyId, 'class-workspace-roster', classId, serverReadToken],
    queryFn: () => orpc.monitoring.getClassRoster({ academyId, classId }),
    initialData: seed, enabled: initialRoster !== null && presence.state !== 'revoked', retry: false, gcTime: 0,
    staleTime: seed ? SERVER_READ_FRESH_MS : 0,
    // Durable enrollment refresh; presence/count changes are pushed by the class room.
    refetchInterval: initialRoster && presence.state !== 'revoked' ? 30_000 : false,
  });
  const [revoked, setRevoked] = useState<Set<string>>(() => new Set());
  const refetch = query.refetch;
  useEffect(() => {
    const onRevoked = (event: AccessRevokedEvent) => {
      if (event.classId !== classId) return;
      if (event.studentMembershipId) setRevoked(previous => new Set([...previous, event.studentMembershipId!]));
      void refetch().then(result => { if (result.isSuccess) setRevoked(new Set()); });
    };
    presence.socket?.on(monitoringServerEvents.accessRevoked, onRevoked);
    return () => { presence.socket?.off(monitoringServerEvents.accessRevoked, onRevoked); };
  }, [classId, presence.socket, refetch]);
  const rows = useMemo(() => query.data && presence.state !== 'revoked' ? mergeRoster(query.data.students.filter(row => !revoked.has(row.membershipId)), presence.entries, query.data.exercises) : [], [query.data, presence.entries, presence.state, revoked]);
  return { academyId, classId, presence, query, rows, counts: countRoster(rows), classroomHref };
}

function ClassLiveState(props: Props) {
  const value = useClassLiveState(props);
  const presence = useMemo(() => ({ academyId: props.academyId, classId: props.classId, presence: value.presence }), [props.academyId, props.classId, value.presence]);
  return <ClassLiveContext value={value}><ClassPresenceContext value={presence}>{props.children}</ClassPresenceContext></ClassLiveContext>;
}
