import { redirectToDirectory } from '../_redirect';

/** Both roles that run an academy, which is what `staff` always meant. */
export default async function PlatformStaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectToDirectory(['TEAM_LEAD', 'MANAGER'], await searchParams);
}
