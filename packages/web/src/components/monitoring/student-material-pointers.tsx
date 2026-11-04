'use client';
import { useEffect, useState } from 'react';
import { monitoringTiming, observationEvents, teacherObservationAwarenessEventSchema, type TeacherObservationAwarenessEvent } from '@cove/shared';
import { useStudentPresence } from '@/lib/monitoring/student-presence';
import { useObservationTranslation } from './use-observation-translation';
import { MaterialMousePointer } from './material-mouse-pointer';
export function StudentMaterialPointers({ materialId, classId }: { materialId: string; classId?: string }) {
  const { socket, academyId } = useStudentPresence(); const { t } = useObservationTranslation();
  const [peers, setPeers] = useState<Record<string, TeacherObservationAwarenessEvent>>({});
  useEffect(() => {
    if (!socket || !classId) return;
    const latest = new Map<string, TeacherObservationAwarenessEvent>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const clear = () => { timers.forEach(clearTimeout); timers.clear(); latest.clear(); setPeers({}); };
    const receive = (data: unknown) => {
      const parsed = teacherObservationAwarenessEventSchema.safeParse(data); if (!parsed.success) return;
      const next = parsed.data;
      if (next.academyId !== academyId || next.classId !== classId || next.materialId !== materialId || Date.now() - next.sentAt > 5000) return;
      const previous = latest.get(next.peerId);
      if (previous && (next.generation < previous.generation || (next.generation === previous.generation && next.sequence <= previous.sequence))) return;
      for (const [id, peer] of latest) if (Date.now() - peer.sentAt > 10000) latest.delete(id);
      if (!previous && latest.size >= 100) return;
      latest.set(next.peerId, next); clearTimeout(timers.get(next.peerId));
      setPeers(current => ({ ...current, [next.peerId]: next }));
      timers.set(next.peerId, setTimeout(() => setPeers(current => { const copy = { ...current }; delete copy[next.peerId]; return copy; }), monitoringTiming.pointerExpiryMs));
    };
    socket.on(observationEvents.teacherAwareness, receive); socket.on('disconnect', clear);
    return () => { clear(); socket.off(observationEvents.teacherAwareness, receive); socket.off('disconnect', clear); };
  }, [socket, academyId, classId, materialId]);
  return <>{Object.values(peers).filter(peer => peer.materialId === materialId && peer.classId === classId).map(peer => <MaterialMousePointer key={peer.peerId} awareness={peer} name={t('peer.teacher')} />)}</>;
}
