import { notFound, redirect, RedirectType } from 'next/navigation';

import {
  legacyAcademyDestination,
  legacyAcademySlug,
} from '@/lib/legacy-academy-route';
import { getAccount } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

export default async function LegacyAcademyPage({
  params,
}: {
  params: Promise<{ academyId: string; legacyPath?: string[] }>;
}) {
  const { academyId, legacyPath } = await params;
  const account = await getAccount().catch(() => null);

  if (!account) {
    redirect(routes.login, RedirectType.replace);
  }

  const academySlug = legacyAcademySlug(account, academyId);
  if (!academySlug) {
    notFound();
  }

  redirect(
    legacyAcademyDestination(academySlug, legacyPath),
    RedirectType.replace,
  );
}
