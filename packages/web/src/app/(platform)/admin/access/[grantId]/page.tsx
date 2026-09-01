import { notFound } from 'next/navigation';

import { BackLink } from '@/components/studio/back-link';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { PlatformShell } from '../../_components/platform-shell';
import { GrantDetail } from './_components/grant-detail';

export default async function SupportGrantPage({
  params,
}: {
  params: Promise<{ grantId: string }>;
}) {
  const { grantId } = await params;
  const { t } = await getServerTranslation(['platform-support']);
  const client = createServerORPCClient();

  const grant = await client.platformSupport.get({ grantId }).catch(() => null);
  if (!grant) notFound();

  // What was actually done under this grant. The whole point of the page, so
  // it is fetched here rather than lazily on the client: an operator who has
  // to wait for it will read the fields above and leave.
  const activity = await client.platformAudit
    .list({ supportGrantId: grantId, pageSize: 100 })
    .catch(() => null);

  return (
    <PlatformShell
      back={<BackLink href="/admin/access" label={t('back')} />}
      bleed
      description={t('detail.subtitle', { academy: grant.academyName })}
      title={t('detail.title')}
    >
      <GrantDetail activity={activity?.entries ?? []} grant={grant} />
    </PlatformShell>
  );
}
