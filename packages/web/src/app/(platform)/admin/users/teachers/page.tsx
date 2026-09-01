import { redirectToDirectory } from '../_redirect';

export default async function PlatformTeachersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectToDirectory(['TEACHER'], await searchParams);
}
