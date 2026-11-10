import { rolesHavePermission } from '@cove/shared';
import { requireAcademyRoute } from '@/lib/academy-route';
import { readExplanation } from '@/lib/explanation-server';
import { ExplanationLesson } from '@/components/explanation/explanation-lesson';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { getLocale } from '@/i18n/server/get-locale';
export default async function ExplanationPage({ params, searchParams }: {
  params: Promise<{ academySlug: string; materialId: string }>; searchParams: Promise<{ classId?: string; preview?: string }>;
}) {
  const [{ academySlug, materialId }, search] = await Promise.all([params, searchParams]);
  const [identity, locale] = await Promise.all([requireAcademyRoute(academySlug), getLocale()]);
  const namespaces = ['content', 'errors', 'learn', 'practice'] as const;
  const preview = search.preview === 'true';
  const [initial, { resources }] = await Promise.all([readExplanation(identity.academyId, materialId, search.classId, preview), initTranslations(locale, namespaces)]);
  return <PageTranslationsProvider locale={locale} namespaces={namespaces} resources={resources}><ExplanationLesson key={materialId} academyId={identity.academyId} materialId={materialId} classId={search.classId} preview={preview} initial={initial} canAuthor={identity.via !== 'platform' && rolesHavePermission(identity.roles, 'curriculum.manage')} staff={!identity.roles.includes('STUDENT')} /></PageTranslationsProvider>;
}
