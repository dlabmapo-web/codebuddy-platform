import { renderContentPage } from '../_lib/render-content-page';

export default async function PlatformProblemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderContentPage({ lens: 'problems', searchParams });
}
