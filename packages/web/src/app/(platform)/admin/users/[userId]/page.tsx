import { notFound } from 'next/navigation';

import { BackLink } from '@/components/studio/back-link';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../../_components/platform-shell';
import { userDisplayName } from '../../_lib/user-view';
import { UserDetail } from './_components/user-detail';

/**
 * One account.
 *
 * `notFound()` for an unreadable account rather than an error panel: an
 * operator arrives here from a row they just clicked, so the only realistic
 * ways to fail are a stale link and an id typed by hand — and both of those are
 * a missing page rather than a fault worth explaining.
 */
export default async function PlatformUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { t } = await getServerTranslation(['platform-users']);

  const person = await createServerORPCClient()
    .platformUsers.get({ userId })
    .catch(() => null);
  if (!person) notFound();

  return (
    <PlatformShell
      back={<BackLink href="/admin/users" label={t('back')} />}
      bleed
      description={t('detail.subtitle')}
      title={userDisplayName(person)}
    >
      <UserDetail person={person} />
    </PlatformShell>
  );
}
