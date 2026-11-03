'use client';
import { useEffect } from 'react';
import { useObservationTranslation } from '@/components/monitoring/use-observation-translation';
import type { ObservationWork } from '@cove/shared';
import { useStudentPresence } from './student-presence';

export function useMaterialObservation(input: { materialId: string; courseId?: string; classId?: string; enabled: boolean; work?: ObservationWork }) {
  const { setOpenMaterial, publishObservation } = useStudentPresence();
  const { materialId, courseId, classId, enabled, work } = input;
  useEffect(() => {
    if (!enabled || !courseId || !classId) return;
    return setOpenMaterial({ materialId, courseId, classId });
  }, [materialId, courseId, classId, enabled, setOpenMaterial]);
  useEffect(() => {
    if (enabled && courseId && classId && work) publishObservation(materialId, work);
  }, [enabled, courseId, classId, materialId, work, publishObservation]);
}

export function StudentObservationIndicator() {
  const { watching } = useStudentPresence();
  const { t } = useObservationTranslation();
  return watching ? <span role="status" className="rounded-full bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning">{t('indicator.monitoring')}</span> : null;
}
