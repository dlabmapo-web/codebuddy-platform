import type { TeacherStudentsResult } from '@cove/shared';
import { notFound } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { isExplicitAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioShell } from '../../../../_components/studio-shell';
import { ProgressWorkspace } from './_components/progress-workspace';
import { parseProgressQuery, serializeProgressQuery } from './_lib/progress-url';

/**
 * Solution status for one assigned class.
 *
 * The first By-student page is rendered on the server for whatever state the
 * URL asks for, so a shared link opens on its own rows rather than on a
 * loading table that then jumps.
 *
 * Denial and absence are the same answer: a teacher who is not assigned to
 * this class must not be able to tell it apart from a class that does not
 * exist, so both land on the not-found page. A By-problem deep link renders
 * the shell and lets the client fetch its own lens — the roster call is still
 * what proves access.
 */
export default async function ClassProgressPage({
  params,
  searchParams,
}: {
  params: Promise<{ academyId: string; classId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academyId, classId } = await params;
  const query = parseProgressQuery(await searchParams);
  const { t } = await getServerTranslation(['teach']);

  let students: TeacherStudentsResult | null = null;
  try {
    students = await createServerORPCClient().teacherProgress.listStudents({
      academyId,
      classId,
      ...(query.q ? { q: query.q } : {}),
      ...(query.courseIds.length ? { courseIds: query.courseIds } : {}),
      ...(query.statuses.length ? { statuses: query.statuses } : {}),
      ...(query.attention.length ? { attention: query.attention } : {}),
      ...(query.sort ? { sort: query.sort, direction: query.direction } : {}),
      page: query.page,
    });
  } catch (error) {
    // Only an expected access/scope answer is a 404. Transport, validation,
    // and server faults belong to the route error boundary and observability.
    if (isExplicitAccessDeniedError(error)) notFound();
    students = null;
  }

  const className = students?.summary.className ?? t('progress.title');

  return (
    <StudioShell
      academyId={academyId}
      bleed
      description={t('progress.description')}
      title={students ? `${className} · ${t('progress.title')}` : className}
    >
      <ProgressWorkspace
        academyId={academyId}
        classId={classId}
        className={className}
        initialData={students}
        // The exact state the server rendered for. Anything else refetches
        // rather than showing one query's rows under another query's filters.
        initialKey={serializeProgressQuery({ ...query, membershipId: null })}
      />
    </StudioShell>
  );
}
