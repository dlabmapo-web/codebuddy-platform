import { PlatformShell } from '@/app/(platform)/admin/_components/platform-shell';
import { requireLibraryAcademyId } from '../../../../../_lib/require-library';
import { contentNamespaces } from '@/i18n/namespaces';
import { createContentPaths } from '@/components/studio/content-paths';
import { ExplanationAuthorPageContent } from '@/components/explanation/explanation-author-page';
export default async function LibraryExplanationPage({
  params,
}: {
  params: Promise<{ courseId: string; lectureId: string; materialId: string }>;
}) {
  const target = await params;
  const academyId = await requireLibraryAcademyId();
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
        paths={createContentPaths('', 'library')}
        forwardViewRole={false}
      />
    </PlatformShell>
  );
}
