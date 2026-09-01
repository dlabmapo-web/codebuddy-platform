import { renderUsersPage } from '../_lib/render-users-page';

export default async function PlatformStaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderUsersPage({ lens: 'staff', searchParams });
}
