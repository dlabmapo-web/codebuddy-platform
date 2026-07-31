import { redirect } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { academyRoleFor } from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';

import { AcademyOverview } from './_components/academy-overview';
import { StudioShell } from './_components/studio-shell';

export default async function AcademyPage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  const { t } = await getServerTranslation(['academy']);

  // The overview is a management surface, empty for a Student. `authDestination`
  // routes them to their catalog on sign-in; this covers every other way of
  // arriving here — a bookmark, a shared link, a typed path.
  let role = null;
  try {
    role = academyRoleFor(await createServerORPCClient().auth.me({}), academyId);
  } catch {
    // Leave an unreadable session to the shell, which redirects to login.
  }
  if (role === 'STUDENT') {
    redirect(`/studio/academies/${academyId}/learn/courses`);
  }

  return (
    <StudioShell academyId={academyId} title={t('title')}>
      <AcademyOverview academyId={academyId} />
    </StudioShell>
  );
}
