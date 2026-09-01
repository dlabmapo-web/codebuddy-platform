import { requireAcademyRoute } from '@/lib/academy-route';
import Link from 'next/link';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import {
  canManageClasses,
  canManageClassSchedule,
  canManageClassTeachers,
  canManageEnrollment,
} from '@/lib/academy-access-state';
import { isAccessDeniedError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';

import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { ClassDetailManager } from './_components/class-detail-manager';
import { createContentPaths } from '@/components/studio/content-paths';

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ academySlug: string; classId: string }>;
}) {
  const { academySlug, classId } = await params;
  const contentPaths = createContentPaths(academySlug, 'academy');
    // The role comes from the guard, which resolves it from a membership or from
  // a platform operator's chosen view. Re-deriving it from `auth.me` hid every
  // write control from an operator the API would have allowed.
  const { academyId, role } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['classes']);
  let detail = null;
  let canAssignCourses = false;
  let canEnroll = false;
  let canAssignTeacher = false;
  let canSetSchedule = false;
  let denied = false;

  try {
    const client = createServerORPCClient();
    const result = await client.academyClasses.get({ academyId, classId });
    detail = result;
    // Only a usability layer — every mutation is authorized again in the API.
    canAssignCourses = canManageClasses(role);
    canEnroll = canManageEnrollment(role);
    canAssignTeacher = canManageClassTeachers(role);
    canSetSchedule = canManageClassSchedule(role);
  } catch (error) {
    // A missing class and a server fault get different copy: only the first is
    // something the reader can act on by going back to the list.
    denied = isAccessDeniedError(error);
  }

  return (
    <StudioPage
      bleed
      showPageHeading={false}
      title={t('title')}
    >
      {detail ? (
        <ClassDetailManager
          academyId={academyId}
          canAssignCourses={canAssignCourses}
          canAssignTeacher={canAssignTeacher}
          canEnroll={canEnroll}
          canSetSchedule={canSetSchedule}
          initialDetail={detail}
        />
      ) : (
        <div className="rounded-card border border-danger/25 bg-danger/5 p-5">
          <h2 className="text-[15px] font-bold text-danger">
            {denied ? t('detail.not_found_title') : t('unavailable_title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-6 text-sub">
            {denied ? t('detail.not_found_body') : t('unavailable_body')}
          </p>
          <Link
            className="mt-3 inline-flex text-[14px] font-bold text-brand hover:underline"
            href={contentPaths.classes()}
          >
            {t('detail.back')}
          </Link>
        </div>
      )}
    </StudioPage>
  );
}
