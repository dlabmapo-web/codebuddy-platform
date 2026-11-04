import { StudentSwitcher } from '@/components/monitoring/student-switcher';
import { routes } from '@/lib/routes';
import { requireAcademyRoute } from '@/lib/academy-route';
import { canManageExercises } from '@/lib/academy-access-state';
import type { MonitoringStudentContext } from '@cove/shared';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { toApiError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { AllMaterialMonitor } from '@/components/monitoring/all-material-monitor';

/**
 * Fullscreen: no `StudioShell`, because the whole viewport is the workspace.
 *
 * The watch supplies the student's current material. The optional URL material
 * selects an independent staff view, authorized again by the material read API.
 */
export default async function LiveStudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ academySlug: string; classId: string; membershipId: string }>;
  searchParams: Promise<{ materialId?: string }>;
}) {
  const { academySlug, classId, membershipId } = await params;
  const { academyId, roles } = await requireAcademyRoute(academySlug);

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
        <StudentUnavailable academySlug={academySlug} academyId={academyId} classId={classId} membershipId={membershipId} />
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
    <AllMaterialMonitor
      key={`${academyId}:${classId}:${membershipId}`}
      academyId={academyId}
      canEditProblem={canManageExercises(roles)}
      classId={classId}
      context={context}
      membershipId={membershipId}
      teacherMembershipRef={context.viewerMembershipId}
      initialMaterialId={(await searchParams).materialId ?? null}
    />
  );
}

async function StudentUnavailable({
  academySlug,
  academyId,
  membershipId,
  classId,
}: {
  academySlug: string;
  academyId: string;
  membershipId: string;
  classId: string;
}) {
  const { t } = await getServerTranslation(['monitoring']);
  const roster = await createServerORPCClient().monitoring.getClassRoster({ academyId, classId });

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-6">
      <div className="max-w-md text-center">
        <StudentSwitcher academyId={academyId} classId={classId} membershipId={membershipId} name={t('switcher.title')} className={roster.class.name} />
        <h1 className="text-[18px] font-bold">
          {t('workspace.unavailable_title')}
        </h1>
        <p className="mt-2 text-[14px] leading-6 text-sub">
          {t('workspace.unavailable_body')}
        </p>
        <Link
          data-monitoring-class-exit
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-[13.5px] font-bold text-on-brand"
          href={`${routes.academy(academySlug)}/teach/classes/${classId}`}
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t('workspace.back')}
        </Link>
      </div>
    </main>
  );
}
