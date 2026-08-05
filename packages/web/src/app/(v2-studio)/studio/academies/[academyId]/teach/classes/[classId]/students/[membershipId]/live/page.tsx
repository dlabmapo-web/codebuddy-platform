import type { MonitoringStudentContext } from '@cove/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { toApiError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { LiveWorkspace } from './_components/live-workspace';

/**
 * Fullscreen: no `StudioShell`, because the whole viewport is the workspace.
 *
 * The exercise is deliberately not loaded here. Which one the student has open
 * is a live fact, and the socket's watch acknowledgement is what supplies it —
 * a material named in the URL would let a teacher open something the student
 * is not on.
 */
export default async function LiveStudentPage({
  params,
}: {
  params: Promise<{ academyId: string; classId: string; membershipId: string }>;
}) {
  const { academyId, classId, membershipId } = await params;

  let context: MonitoringStudentContext | null = null;
  try {
    context = await createServerORPCClient().monitoring.getStudentContext({
      academyId,
      classId,
      membershipId,
    });
  } catch (error) {
    const { code } = toApiError(error);
    // The server checks the class before it checks the student, so this code
    // can only be reached by a teacher who is assigned to this class. Saying
    // why the student cannot be opened therefore tells them nothing they were
    // not already entitled to know — and a bare 404 here reads as a broken
    // link rather than a student who left the class.
    if (code === 'MONITORING_STUDENT_UNAVAILABLE') {
      return (
        <StudentUnavailable academyId={academyId} classId={classId} />
      );
    }
    // Not assigned, not enrolled, and not there are one answer: a teacher must
    // not be able to probe another class's roster by URL. The reason is logged
    // where only the operator can see it, because "404" alone is impossible to
    // diagnose from the outside.
    if (process.env.NODE_ENV !== 'production') {
      console.error(
        `[live] ${academyId}/${classId}/${membershipId} refused: ${code ?? 'unknown'}`,
      );
    }
    notFound();
  }
  if (!context) notFound();

  return (
    <LiveWorkspace
      academyId={academyId}
      classId={classId}
      context={context}
      membershipId={membershipId}
      teacherMembershipRef={context.viewerMembershipId}
    />
  );
}

async function StudentUnavailable({
  academyId,
  classId,
}: {
  academyId: string;
  classId: string;
}) {
  const { t } = await getServerTranslation(['monitoring']);

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-6">
      <div className="max-w-md text-center">
        <h1 className="text-[18px] font-bold">
          {t('workspace.unavailable_title')}
        </h1>
        <p className="mt-2 text-[14px] leading-6 text-sub">
          {t('workspace.unavailable_body')}
        </p>
        <Link
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13.5px] font-bold text-white"
          href={`/studio/academies/${academyId}/teach/classes/${classId}`}
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t('workspace.back')}
        </Link>
      </div>
    </main>
  );
}
