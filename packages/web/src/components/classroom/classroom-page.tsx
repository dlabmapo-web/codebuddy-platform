import { notFound } from 'next/navigation';
import { classroomMaterials, type MaterialType } from '@cove/shared';
import { requireAcademyRoute } from '@/lib/academy-route';
import { createServerORPCClient, getAccount } from '@/lib/orpc-server';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { getLocale } from '@/i18n/server/get-locale';
import { exerciseNamespaces } from '@/i18n/namespaces';
import { readManualWorkspace } from '@/lib/manual-server';
import { readExplanation } from '@/lib/explanation-server';
import { readLessonMedia } from '@/lib/lesson-media-server';
import { ExerciseImageProvider } from '@/components/studio/lesson-image-providers';
import { StaffWorkspace } from '@/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/staff-workspace';
import { ManualWorkspace } from '@/components/manual/manual-workspace';
import { ExplanationLesson } from '@/components/explanation/explanation-lesson';
import { PdfLesson } from '@/components/pdf/pdf-lesson';
import { VideoLesson } from '@/components/video/video-lesson';
import { ClassroomProvider, EmptyClassroom, type ClassroomLabels } from './classroom-context';

export async function ClassroomPage({ academySlug, classId, materialId }: {
  academySlug: string; classId: string; materialId?: string;
}) {
  const { academyId } = await requireAcademyRoute(academySlug);
  const [classroom, { t }, locale] = await Promise.all([
    createServerORPCClient().academyClasses.getClassroom({ academyId, classId }).catch(() => null),
    getServerTranslation(['classroom']), getLocale(),
  ]);
  if (!classroom) notFound();
  const materials = classroomMaterials(classroom);
  const selected = materialId ? materials.find(item => item.id === materialId) : materials[0];
  if (materialId && !selected) notFound();
  const labels = Object.fromEntries((['teaching', 'notice', 'lessons', 'exit', 'fullscreen', 'previous', 'next', 'empty', 'saveFailed', 'closeOutline'] as const)
    .map(key => [key, t(key)])) as ClassroomLabels;
  // No redirect to the first lesson: entry resolves class access and its outline once.
  return <ClassroomProvider key={selected?.id ?? 'empty'} academyId={academyId} academySlug={academySlug} classroom={classroom} materialId={selected?.id} labels={labels}>
    {selected ? <ClassroomMaterial academyId={academyId} materialId={selected.id} type={selected.type} locale={locale} /> : <EmptyClassroom />}
  </ClassroomProvider>;
}

async function ClassroomMaterial({ academyId, materialId, type, locale }: {
  academyId: string; materialId: string; type: MaterialType; locale: string;
}) {
  const namespaces = [...exerciseNamespaces, 'learn', 'manual'] as const;
  const translations = initTranslations(locale, namespaces);
  async function content() {
    switch (type) {
      case 'PROGRAMMING_EXERCISE': {
        const [bootstrap, { user }] = await Promise.all([
          createServerORPCClient().learn.getExerciseBootstrap({ academyId, materialId }).catch(() => null), getAccount(),
        ]);
        if (!bootstrap || bootstrap.access?.mode !== 'staff-practice') notFound();
        return <ExerciseImageProvider academyId={academyId} materialId={materialId} preview={false}><StaffWorkspace academyId={academyId} bootstrap={bootstrap} userId={user.id} /></ExerciseImageProvider>;
      }
      case 'TURTLE_EXERCISE': case 'WRITTEN_RESPONSE': case 'MULTIPLE_CHOICE': {
        const [initialWorkspace, { user }] = await Promise.all([readManualWorkspace({ academyId, materialId }), getAccount()]);
        if (!initialWorkspace || !initialWorkspace.workspace.practice) notFound();
        return <ManualWorkspace userId={user.id} academyId={academyId} materialId={materialId} initialWorkspace={initialWorkspace} />;
      }
      case 'EXPLANATION': {
        const initial = await readExplanation(academyId, materialId);
        if (!initial) notFound();
        return <ExplanationLesson academyId={academyId} materialId={materialId} initial={initial} canAuthor={false} staff />;
      }
      case 'PDF_DOCUMENT': {
        const initial = await readLessonMedia('documents', academyId, materialId);
        if (!initial) notFound();
        return <PdfLesson academyId={academyId} materialId={materialId} initial={initial} permissions={{ canAuthor: false, canTutor: true }} />;
      }
      case 'VIDEO_LESSON': {
        const initial = await readLessonMedia('videos', academyId, materialId);
        if (!initial) notFound();
        return <VideoLesson academyId={academyId} materialId={materialId} initial={initial} permissions={{ canAuthor: false, canTutor: true }} />;
      }
    }
  }
  const [children, { resources }] = await Promise.all([content(), translations]);
  return <PageTranslationsProvider locale={locale} namespaces={namespaces} resources={resources}>{children}</PageTranslationsProvider>;
}
