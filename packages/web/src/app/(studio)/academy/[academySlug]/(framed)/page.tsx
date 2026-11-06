import { redirect } from 'next/navigation';

import { requireAcademyOrLobbyRoute } from '@/lib/academy-route';
import { academyEntryPath } from '@/lib/academy-entry';

/** Overview is temporarily hidden; enter the role's work page without loading it. */
export default async function AcademyPage({
  params,
}: {
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const identity = await requireAcademyOrLobbyRoute(academySlug);
  // The framed layout renders the applicant lobby instead of these children.
  // Do not redirect (or reject) that applicant from a concurrently rendered page.
  if (identity.via === 'application') return null;

  redirect(academyEntryPath(identity.academySlug, identity.role));
}
