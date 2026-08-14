import { redirect } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { academyRoleFor } from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';

import { AcademyOverview } from './_components/academy-overview';
import { StudioShell } from './_components/studio-shell';
import { TeacherAcademyOverview } from './_components/teacher-academy-overview';

/**
 * One route, three answers.
 *
 * A Student is redirected to their catalog — `authDestination` already routes
 * them there on sign-in, and this covers every other way of arriving: a
 * bookmark, a shared link, a typed path.
 *
 * A Teacher gets the teaching overview: their assigned classes, how those
 * classes are learning, and where help is most useful. Nobody else does. The
 * component is chosen here rather than branched inside one shared dashboard, so
 * a management role has no path to teacher analytics even if the API were to
 * answer them — and it does not.
 *
 * Managers keep the management-oriented overview they already had.
 */
export default async function AcademyPage({
  params,
  searchParams,
}: {
  params: Promise<{ academyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academyId } = await params;
  const { t } = await getServerTranslation(['academy']);

  let role = null;
  try {
    role = academyRoleFor(await createServerORPCClient().auth.me({}), academyId);
  } catch {
    // Leave an unreadable session to the shell, which redirects to login.
  }
  if (role === 'STUDENT') {
    redirect(`/studio/academies/${academyId}/learn/courses`);
  }

  if (role === 'TEACHER') {
    return (
      <StudioShell
        academyId={academyId}
        bleed
        description={t('teaching_overview_description')}
        title={t('teaching_overview_title')}
      >
        <TeacherAcademyOverview
          academyId={academyId}
          searchParams={await searchParams}
        />
      </StudioShell>
    );
  }

  return (
    <StudioShell academyId={academyId} title={t('title')}>
      <AcademyOverview academyId={academyId} />
    </StudioShell>
  );
}
