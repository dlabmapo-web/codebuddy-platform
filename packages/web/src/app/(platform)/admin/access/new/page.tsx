import { notFound } from 'next/navigation';

import { BackLink } from '@/components/studio/back-link';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { PlatformShell } from '../../_components/platform-shell';
import { OpenGrantForm } from './_components/open-grant-form';

/**
 * Opening a support session for one academy.
 *
 * The academy arrives in the query rather than as a path segment, because this
 * page is reached *from* an academy — the Enter academy action on its detail
 * page — and the operator's mental model is "let me into that one", not
 * "create a grant, and by the way pick an academy".
 *
 * A missing or unknown academy is a missing page. There is no academy picker
 * here on purpose: choosing whose data to open should not be a dropdown
 * somebody can brush past on their way to the submit button.
 */
export default async function NewSupportGrantPage({
  searchParams,
}: {
  searchParams: Promise<{ academy?: string; next?: string }>;
}) {
  const { academy: academyId, next } = await searchParams;
  if (!academyId) notFound();

  const { t } = await getServerTranslation(['platform-support']);

  const academy = await createServerORPCClient()
    .platformAcademies.get({ academyId })
    .catch(() => null);
  if (!academy) notFound();

  return (
    <PlatformShell
      back={
        <BackLink
          href={routes.adminAcademy(academy.slug)}
          label={academy.name}
        />
      }
      description={t('open.subtitle')}
      title={t('open.title', { academy: academy.name })}
    >
      <OpenGrantForm
        academyId={academy.id}
        academyName={academy.name}
        academySlug={academy.slug}
        next={safeNext(next, academy.slug)}
      />
    </PlatformShell>
  );
}

/**
 * A destination inside *this* academy, or nothing.
 *
 * `next` arrives in a URL an operator can edit and a link anyone can send, so
 * it is checked rather than trusted: a bare path, no scheme, no protocol-
 * relative `//host`, and under the academy the session was actually opened
 * for. Anything else is dropped and the operator lands at the academy root —
 * a redirect that guesses is worse than one that does the obvious thing.
 */
function safeNext(next: string | undefined, slug: string): string | undefined {
  if (!next) return undefined;
  const prefix = routes.academy(slug);
  if (!next.startsWith('/') || next.startsWith('//')) return undefined;
  return next === prefix || next.startsWith(`${prefix}/`) ? next : undefined;
}
