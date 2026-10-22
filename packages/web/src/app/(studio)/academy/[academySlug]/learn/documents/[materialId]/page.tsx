import { rolesHavePermission } from '@cove/shared';
import { requireAcademyRoute } from '@/lib/academy-route';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { getLocale } from '@/i18n/server/get-locale';
import { PdfLesson } from '@/components/pdf/pdf-lesson';
export default async function PdfLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ academySlug: string; materialId: string }>;
  searchParams: Promise<{ classId?: string }>;
}) {
  const { academySlug, materialId } = await params;
  const identity = await requireAcademyRoute(academySlug);
  const { academyId } = identity;
  const locale = await getLocale();
  const namespaces = ['content', 'errors', 'practice', 'manual', 'learn', 'pdf-practice'] as const;
  const { resources } = await initTranslations(locale, namespaces);
  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={namespaces}
      resources={resources}
    >
      <PdfLesson
        academyId={academyId}
        permissions={{ canAuthor: identity.via !== 'platform' && rolesHavePermission(identity.roles, 'curriculum.manage'), canTutor: identity.via === 'membership' && identity.roles.includes('TEACHER') }}
        materialId={materialId}
        classId={(await searchParams).classId}
      />
    </PageTranslationsProvider>
  );
}
