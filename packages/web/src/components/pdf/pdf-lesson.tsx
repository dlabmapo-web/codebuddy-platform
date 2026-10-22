'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLayoutTranslation } from '@/i18n';
import { pdfApi } from '@/lib/pdf-api';
import { VideoResourceLinks } from '@/components/video/video-resource-links';
import { CurriculumTrigger } from '@/components/workspace/curriculum-trigger';
import { WorkspaceCurriculumNavigator } from '@/components/workspace/curriculum-navigator';
import { LessonHeader, LessonFooter } from '@/components/workspace/lesson-chrome';
import { useNavigatorPanel } from '@/lib/workspace/use-navigator-panel';
import { useMaterialNavigation } from '@/components/workspace/use-material-navigation';
import { MediaStaffActions, type MediaStaffPermissions } from '@/components/workspace/media-staff-actions';
import { PdfResourceLink } from './pdf-resource-link';
import { PdfReader } from './pdf-reader';

export function PdfLesson({ academyId, materialId, classId, permissions }: {
  academyId: string; materialId: string; classId?: string; permissions?: MediaStaffPermissions;
}) {
  const { t } = useTranslation('content');
  const { t: lt } = useLayoutTranslation('learn');
  const query = useQuery({
    queryKey: ['pdf', academyId, materialId, false],
    queryFn: () => pdfApi.read({ academyId, materialId }), retry: false, staleTime: 0,
  });
  const data = query.data;
  const navigation = useMaterialNavigation({ academyId, materialId, classId, courseId: data?.course.id, materials: data?.materials });
  const { open: panelOpen, panelId, triggerRef, toggle: togglePanel, close: closePanel } = useNavigatorPanel('material-course-outline');
  if (!data) return <main className="p-6" role={query.isError ? 'alert' : 'status'}>{t(query.isError ? 'pdf.unavailable' : 'pdf.loading')}</main>;
  return <main className="relative flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
    <LessonHeader courseTitle={data.course.title} lectureTitle={data.lecture.title} title={data.title} leaveHref={navigation.courseHref}
      curriculum={<CurriculumTrigger compact ref={triggerRef} open={panelOpen} panelId={panelId} onToggle={togglePanel} path={navigation.context?.path ?? null} />}>
      <MediaStaffActions academyId={academyId} type="PDF_DOCUMENT" data={data} permissions={permissions} />
    </LessonHeader>
    <div className="relative flex min-h-0 flex-1">
      <WorkspaceCurriculumNavigator context={navigation.context} displayedMaterialId={materialId} open={panelOpen} panelId={panelId}
        onClose={closePanel} onSelect={navigation.navigate} error={navigation.failed} onRetry={navigation.retry}
        footer={{ href: navigation.courseHref, label: lt('navigator.footer_student') }} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <VideoResourceLinks academyId={academyId} materialId={materialId} classId={classId} />
        <div className="min-h-0 flex-1"><PdfReader key={materialId} academyId={academyId} materialId={materialId} /></div>
        {data.resources.length ? <div className="shrink-0 border-t border-border bg-card px-4 py-2"><details><summary className="cursor-pointer text-xs font-semibold text-sub">{t('pdf.resources')}</summary>
          <ul className="mt-2 grid gap-2">{data.resources.map(document => <PdfResourceLink key={document.materialId} academyId={academyId} classId={classId ?? ''} document={document} />)}</ul>
        </details></div> : null}
      </div>
    </div>
    <LessonFooter previous={navigation.previous} next={navigation.next} index={navigation.index} total={navigation.total} />
  </main>;
}
