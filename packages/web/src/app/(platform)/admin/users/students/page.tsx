import { redirectToDirectory } from '../_redirect';

export default async function PlatformStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirectToDirectory(['STUDENT'], await searchParams);
}
