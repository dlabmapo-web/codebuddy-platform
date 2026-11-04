'use client';
import { StudentMaterialPointers } from '@/components/monitoring/student-material-pointers';
import { useEffect } from 'react';
import { useObservationTranslation } from '@/components/monitoring/use-observation-translation';
import type { ObservationWork } from '@cove/shared';
import { useMaterialAwareness } from './use-material-awareness';
import { useStudentPresence } from './student-presence';

export function useMaterialObservation(input: { materialId: string; courseId?: string; classId?: string; enabled: boolean; work?: ObservationWork }) {
  const awareness = useMaterialAwareness({ ...input, activeFile: input.work?.activeFile });
  const { setOpenMaterial, publishObservation } = useStudentPresence();
  const { materialId, courseId, classId, enabled, work } = input;
  useEffect(() => {
    if (!enabled || !courseId || !classId) return;
    return setOpenMaterial({ materialId, courseId, classId });
  }, [materialId, courseId, classId, enabled, setOpenMaterial]);
  useEffect(() => {
    if (enabled && courseId && classId && work) publishObservation(materialId, work);
  }, [enabled, courseId, classId, materialId, work, publishObservation]);
  return awareness;
}

export function StudentObservationIndicator({ materialId, classId }: { materialId: string; classId?: string }) {
  const { watching } = useStudentPresence();
  const { t } = useObservationTranslation();
  return <><StudentMaterialPointers materialId={materialId} classId={classId} />{watching ? <span role="status" className="rounded-full bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning">{t('indicator.monitoring')}</span> : null}</>;
}
