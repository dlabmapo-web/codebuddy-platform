import { PlatformShell } from '@/app/(platform)/admin/_components/platform-shell';
import { requirePlatformAcademyRoute } from '@/lib/academy-route';
import { contentNamespaces } from '@/i18n/namespaces';
import { createContentPaths } from '@/components/studio/content-paths';
import { ExplanationAuthorPageContent } from '@/components/explanation/explanation-author-page';
export default async function AcademyExplanationPage({
  params,
}: {
  params: Promise<{
    academySlug: string;
    courseId: string;
    lectureId: string;
    materialId: string;
  }>;
}) {
  const { academySlug, ...target } = await params;
  const { academyId } = await requirePlatformAcademyRoute(academySlug);
  return (
    <PlatformShell
      title=""
      showPageHeading={false}
      wide
      bleed
      namespaces={contentNamespaces}
    >
      <ExplanationAuthorPageContent
        {...target}
        academyId={academyId}
        paths={createContentPaths(academySlug, 'console')}
        forwardViewRole={false}
      />
    </PlatformShell>
  );
}
