'use client';
import { MaterialReadFailure } from '@/components/workspace/material-read-failure';
import { useReadingView } from '@/components/workspace/use-reading-view';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createContentPaths } from '@/components/studio/content-paths';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, PencilLine } from 'lucide-react';
import type { ExplanationReadResult } from '@cove/shared';
import { explanationApi } from '@/lib/explanation-api';
import { claimServerRead, SERVER_READ_FRESH_MS } from '@/lib/server-read';
import { useMaterialObservation, StudentObservationIndicator } from '@/lib/monitoring/use-material-observation';
import { CurriculumTrigger } from '@/components/workspace/curriculum-trigger';
import { WorkspaceCurriculumNavigator } from '@/components/workspace/curriculum-navigator';
import { LessonHeader, LessonFooter, lessonAction } from '@/components/workspace/lesson-chrome';
import { useNavigatorPanel } from '@/lib/workspace/use-navigator-panel';
import { useMaterialNavigation } from '@/components/workspace/use-material-navigation';
import { ExplanationContent } from './explanation-content';
import { useExplanationTranslation } from './use-explanation-translation';

export function ExplanationLesson({ academyId, materialId, classId, preview, canAuthor, staff, initial }: {
  academyId: string; materialId: string; classId?: string; preview?: boolean; canAuthor: boolean; staff: boolean;
  initial?: { data: ExplanationReadResult; token: string } | null;
}) {
  const { t } = useExplanationTranslation();
  const [seed] = useState(() => claimServerRead(initial?.token) ? initial?.data : undefined);
  const slug = useAcademySlug();
  const query = useQuery({ queryKey: ['explanation', academyId, materialId, classId, Boolean(preview)], queryFn: () => explanationApi.read({ academyId, materialId, classId, preview }), initialData: seed, staleTime: SERVER_READ_FRESH_MS, retry: false, refetchOnWindowFocus: false });
  const data = query.data;
  useReadingView({ academyId, materialId, classId, enabled: Boolean(data) && !staff && !preview });
  const navigation = useMaterialNavigation({ academyId, materialId, courseId: data?.course.id, classId, preview, initialOutline: data?.outline });
  useMaterialObservation({ materialId, classId, courseId: data?.course.id, enabled: !staff && !preview });
  const { open, panelId, triggerRef, toggle, close } = useNavigatorPanel('explanation-course-outline');
  useEffect(() => {
    const compact = window.matchMedia('(max-width: 767px)');
    const revealReading = () => { if (compact.matches) close(); };
    revealReading(); compact.addEventListener('change', revealReading);
    return () => compact.removeEventListener('change', revealReading);
  }, [close]);
  if (!data) return query.isError
    ? <MaterialReadFailure error={query.error} retry={() => void query.refetch()} retrying={query.isFetching} backHref={navigation.courseHref} />
    : <main className="grid min-h-dvh place-content-center gap-4 bg-canvas p-6 text-center text-ink"><BookOpen aria-hidden className="mx-auto size-9 text-brand" /><p role="status">{t('loading')}</p></main>;
  return <main className="relative flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
    <LessonHeader courseTitle={data.course.title} lectureTitle={data.lecture.title} title={data.title} leaveHref={navigation.courseHref} badge={preview ? <span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-semibold text-brand">{t('preview')}</span> : undefined}
      curriculum={<CurriculumTrigger compact ref={triggerRef} open={open} panelId={panelId} onToggle={toggle} path={navigation.context?.path ?? null} />}>
      {canAuthor ? <Link className={lessonAction} href={createContentPaths(slug, 'academy').explanation(data.course.id, data.lecture.id, materialId)}><PencilLine aria-hidden className="size-4" />{t('edit')}</Link> : null}
      <StudentObservationIndicator materialId={materialId} classId={classId} />
    </LessonHeader>
    <div className="relative flex min-h-0 flex-1">
      <WorkspaceCurriculumNavigator context={navigation.context} displayedMaterialId={materialId} open={open} panelId={panelId} onClose={close} onSelect={navigation.navigate} error={navigation.failed} onRetry={navigation.retry} />
      <div className={data.sideBody ? "min-h-0 min-w-0 flex-1" : "min-w-0 flex-1 overflow-y-auto px-3 sm:px-6"}><ExplanationContent title={data.title} body={data.body} sideBody={data.sideBody} images={data.images} lectureTitle={data.lecture.title} onRetry={() => void query.refetch()} /></div>
    </div>
    <LessonFooter previous={navigation.previous} next={navigation.next} index={navigation.index} total={navigation.total} />
  </main>;
}
