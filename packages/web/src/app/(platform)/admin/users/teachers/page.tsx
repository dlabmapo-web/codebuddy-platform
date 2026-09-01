import { renderUsersPage } from '../_lib/render-users-page';

export default async function PlatformTeachersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderUsersPage({ lens: 'teachers', searchParams });
}
