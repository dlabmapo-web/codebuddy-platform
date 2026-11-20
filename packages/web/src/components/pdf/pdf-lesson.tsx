'use client';
import { MaterialReadFailure } from '@/components/workspace/material-read-failure';

import { useReadingView } from '@/components/workspace/use-reading-view';
import { useState } from 'react';
import type { PdfReadResult } from '@cove/shared';
import { claimServerRead, SERVER_READ_FRESH_MS } from '@/lib/server-read';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { pdfApi } from '@/lib/pdf-api';
import { VideoResourceLinks } from '@/components/video/video-resource-links';
import { CurriculumTrigger } from '@/components/workspace/curriculum-trigger';
import { WorkspaceCurriculumNavigator } from '@/components/workspace/curriculum-navigator';
import { LessonHeader, LessonFooter } from '@/components/workspace/lesson-chrome';
import { useNavigatorPanel } from '@/lib/workspace/use-navigator-panel';
import { useMaterialNavigation } from '@/components/workspace/use-material-navigation';
import { MediaStaffActions, type MediaStaffPermissions } from '@/components/workspace/media-staff-actions';
import { PdfReader } from './pdf-reader';
import { useMaterialObservation, StudentObservationIndicator } from '@/lib/monitoring/use-material-observation';

export function PdfLesson({ academyId, materialId, classId, permissions, initial }: {
  academyId: string; materialId: string; classId?: string; permissions?: MediaStaffPermissions; initial?: { data: PdfReadResult; token: string };
}) {
  const { t } = useTranslation('content');
  const [seed] = useState(() => claimServerRead(initial?.token) ? initial?.data : undefined);
  const query = useQuery({
    queryKey: ['pdf', academyId, materialId, false],
    queryFn: () => pdfApi.read({ academyId, materialId }), retry: false, initialData: seed, staleTime: seed ? SERVER_READ_FRESH_MS : 0,
  });
  const data = query.data;
  useReadingView({ academyId, materialId, classId, enabled: Boolean(data) && !permissions?.canTutor });
  useMaterialObservation({ materialId, classId, courseId: data?.course.id, enabled: !permissions?.canTutor });
  const navigation = useMaterialNavigation({ academyId, materialId, classId, courseId: data?.course.id, materials: data?.materials });
  const { open: panelOpen, panelId, triggerRef, toggle: togglePanel, close: closePanel } = useNavigatorPanel('material-course-outline');
  if (!data) return query.isError
    ? <MaterialReadFailure error={query.error} retry={() => void query.refetch()} retrying={query.isFetching} backHref={navigation.courseHref} />
    : <main className="p-6" role="status">{t('pdf.loading')}</main>;
  return <main className="relative flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
    <LessonHeader courseTitle={data.course.title} lectureTitle={data.lecture.title} title={data.title} leaveHref={navigation.courseHref}
      curriculum={<CurriculumTrigger compact ref={triggerRef} open={panelOpen} panelId={panelId} onToggle={togglePanel} path={navigation.context?.path ?? null} />}>
      <MediaStaffActions academyId={academyId} type="PDF_DOCUMENT" data={data} permissions={permissions} />
      <StudentObservationIndicator materialId={materialId} classId={classId} />
    </LessonHeader>
    <div className="relative flex min-h-0 flex-1">
      <WorkspaceCurriculumNavigator context={navigation.context} displayedMaterialId={materialId} open={panelOpen} panelId={panelId}
        onClose={closePanel} onSelect={navigation.navigate} error={navigation.failed} onRetry={navigation.retry} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <VideoResourceLinks academyId={academyId} materialId={materialId} classId={classId} />
        <div className="min-h-0 flex-1"><PdfReader key={materialId} academyId={academyId} materialId={materialId} /></div>
      </div>
    </div>
    <LessonFooter previous={navigation.previous} next={navigation.next} index={navigation.index} total={navigation.total} />
  </main>;
}
