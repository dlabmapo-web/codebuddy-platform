'use client';

import { useParams, usePathname } from 'next/navigation';
import { MaterialReadFailure } from './material-read-failure';
import { routes } from '@/lib/routes';

export function MaterialErrorBoundary({ retry }: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const teaching = usePathname().includes('/teach/');
  const { academySlug } = useParams<{ academySlug?: string }>();
  const backHref = academySlug
    ? teaching ? routes.academyTeachClasses(academySlug) : routes.academyLearnClasses(academySlug)
    : undefined;
  // Next's retry refetches the segment; resetting the boundary alone replays
  // the failed server payload. The framework retains the current URL context.
  return <MaterialReadFailure backHref={backHref} retry={retry} />;
}
