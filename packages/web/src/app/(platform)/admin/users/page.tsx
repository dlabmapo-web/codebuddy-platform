import { renderUsersPage } from './_lib/render-users-page';

/**
 * Every account on Cove.
 *
 * The unfiltered lens. Its three siblings are the same page with a role facet
 * fixed by the path — see `_lib/render-users-page`.
 */
export default async function PlatformPeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderUsersPage({ lens: 'everyone', searchParams });
}
