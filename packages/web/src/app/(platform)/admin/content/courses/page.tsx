import { renderContentPage } from '../_lib/render-content-page';

export default async function PlatformCoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderContentPage({ lens: 'courses', searchParams });
}
