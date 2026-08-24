import type { AcademyTeacherOverview } from '@cove/shared';

import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { teachingNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { createServerORPCClient } from '@/lib/orpc-server';

import { parseOverviewQuery, serializeOverviewQuery } from '../_lib/overview-url';
import { TeacherOverviewWorkspace } from './teacher-overview/teacher-overview-workspace';

/**
 * The Teacher's academy overview, rendered on the server for the exact scope
 * the URL asks for.
 *
 * Server-rendered rather than fetched on mount so a shared link opens on its own
 * numbers instead of a skeleton that then jumps — a teacher forwarding "look at
 * CH06 in Python A this week" should have the recipient land on it.
 *
 * A failure here is not fatal. The client owns the same query and will ask
 * again with a visible error and a retry, which is the honest behaviour for a
 * page whose whole job is to be trusted: an overview that silently rendered
 * nothing would read as a quiet class.
 *
 * The copy is mounted here rather than in the studio layout: it is a large
 * namespace used by one role on one route, and every Manager and Student
 * loading this path would otherwise pay for it in their RSC payload.
 */
export async function TeacherAcademyOverview({
  academyId,
  hasLeaderboard,
  searchParams,
}: {
  academyId: string;
  hasLeaderboard: boolean;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const locale = await getLocale();
  const namespaces = hasLeaderboard
    ? [...teachingNamespaces, 'points']
    : teachingNamespaces;
  const { resources } = await initTranslations(locale, namespaces);
  const query = parseOverviewQuery(searchParams);

  let overview: AcademyTeacherOverview | null = null;
  try {
    overview = await createServerORPCClient().academyTeacherOverview.get({
      academyId,
      ...(query.classId ? { classId: query.classId } : {}),
      ...(query.courseId ? { courseId: query.courseId } : {}),
      range: query.range,
    });
  } catch {
    // Left to the client, which retries and can say what happened.
    overview = null;
  }

  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={namespaces}
      resources={resources}
    >
      <TeacherOverviewWorkspace
        academyId={academyId}
        hasLeaderboard={hasLeaderboard}
        initialData={overview}
        // The exact state the server rendered for. Anything else refetches
        // rather than showing one scope's numbers under another's filters.
        initialKey={serializeOverviewQuery(query)}
      />
    </PageTranslationsProvider>
  );
}
