'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Pencil, Users } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PdfMetadata } from '@cove/shared';
import { AssessmentDrawer } from '@/components/manual/assessment-ui';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { usePracticeTranslation } from './use-practice-translation';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';
import { lessonAction } from './lesson-chrome';

const PdfAuthorDialog = dynamic(() => import('@/components/pdf/pdf-author-dialog').then(mod => mod.PdfAuthorDialog));
const VideoAuthorDialog = dynamic(() => import('@/components/video/video-author-dialog').then(mod => mod.VideoAuthorDialog));

export type MediaStaffPermissions = { canAuthor: boolean; canTutor: boolean };

/** Passive lessons expose class tutoring and their own editor, never fabricated answers or submissions. */
export function MediaStaffActions({ academyId, type, data, permissions }: {
  academyId: string; type: 'PDF_DOCUMENT' | 'VIDEO_LESSON'; permissions?: MediaStaffPermissions;
  data: { materialId: string; title: string; course: { id: string; title: string }; lecture: { id: string }; pdf?: PdfMetadata };
}) {
  const slug = useAcademySlug();
  const { t } = usePracticeTranslation();
  const cache = useQueryClient();
  const [tutoring, setTutoring] = useState(false);
  const [editing, setEditing] = useState(false);
  const classes = useQuery({
    queryKey: ['media-tutoring-classes', academyId, data.course.id],
    queryFn: () => orpc.academyTeacherStudents.roster({ academyId, courseId: data.course.id }),
    enabled: Boolean(tutoring && permissions?.canTutor), retry: false, staleTime: 0, gcTime: 0,
  });
  const target = { academyId, courseId: data.course.id, lectureId: data.lecture.id };
  const saved = async () => { await cache.invalidateQueries({ queryKey: [type === 'PDF_DOCUMENT' ? 'pdf' : 'video'] }); };
  return <>
    {permissions?.canTutor ? <AssessmentDrawer title={t('tutoring')} open={tutoring} onOpenChange={setTutoring}
      trigger={<button type="button" className={lessonAction}><Users aria-hidden className="size-3.5" />{t('tutoring')}</button>}>
      <p className="mb-4 text-sm leading-6 text-sub">{t(type === 'PDF_DOCUMENT' ? 'pdf_tutoring_help' : 'video_tutoring_help')}</p>
      {classes.isPending ? <p role="status">{t('dialog_loading')}</p> : classes.isError ? <div role="alert"><p>{t('tutoring_switch_failed')}</p><button className={lessonAction} onClick={() => void classes.refetch()}>{t('retry')}</button></div>
        : classes.data?.classes.length ? <nav className="grid gap-2">{classes.data.classes.map(item => <Link className={lessonAction} key={item.classId}
          href={type === 'VIDEO_LESSON' ? routes.academyTeachVideo(slug, item.classId, data.materialId) : `${routes.academy(slug)}/teach/classes/${item.classId}`}>
          <Users aria-hidden className="size-4" />{item.name}
        </Link>)}</nav> : <p>{t('observe_no_classes')}</p>}
    </AssessmentDrawer> : null}
    {permissions?.canAuthor ? <button type="button" className={lessonAction} onClick={() => setEditing(true)}><Pencil aria-hidden className="size-3.5" />{t('edit')}</button> : null}
    {editing && type === 'PDF_DOCUMENT' ? <PdfAuthorDialog target={target} material={{ id: data.materialId, title: data.title, pdfDocument: data.pdf }} editable onClose={() => setEditing(false)} onSaved={saved} /> : null}
    {editing && type === 'VIDEO_LESSON' ? <VideoAuthorDialog target={target} material={{ id: data.materialId, title: data.title }} onClose={() => setEditing(false)} onSaved={saved} /> : null}
  </>;
}
