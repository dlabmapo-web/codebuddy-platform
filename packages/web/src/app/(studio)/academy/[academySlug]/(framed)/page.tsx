import { cookies } from 'next/headers';

import { requireAcademyRoute } from '@/lib/academy-route';
import { resolveViewRole, viewRoleCookieName } from '@/lib/academy-view-role';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { getAccount } from '@/lib/orpc-server';

import { LeadAcademyOverview } from './_components/lead-academy-overview';
import { ManagerAcademyOverview } from './_components/manager-academy-overview';
import { StudentAcademyOverview } from './_components/student-academy-overview';
import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { TeacherAcademyOverview } from './_components/teacher-academy-overview';

/**
 * One route, three answers.
 *
 * A Student gets their own overview: the work they left open, what the period
 * measured, what their teacher wrote, and — where the academy enables it —
 * where that puts them in their class. Chosen here rather than branched inside
 * a shared dashboard for the same reason as the two below: this page is about
 * exactly one person, and a component that decided its audience internally
 * would be one edit away from letting it be about somebody else.
 *
 * A Teacher gets the teaching overview: their assigned classes, how those
 * classes are learning, and where help is most useful. Nobody else does. The
 * component is chosen here rather than branched inside one shared dashboard, so
 * a management role has no path to teacher analytics even if the API were to
 * answer them — and it does not.
 *
 * A Manager gets the control tower: the academy's own identity, what is waiting
 * on a decision, and whether the place is growing and learning. Chosen here for
 * the same reason — the manager surfaces read across every class in the academy,
 * and a shared dashboard that branched internally would be one edit away from
 * handing that reach to a role the API would refuse.
 *
 * A Team Lead gets the curriculum overview: what the academy teaches, what is
 * broken in it, and whether any of it is working. Chosen here for the same
 * reason as the three above — it reads across every course and class in the
 * academy, and a shared dashboard that branched internally would be one edit
 * away from handing that reach to a role the API would refuse.
 *
 * Four roles, four answers, and no fallback. `academyRoles` has exactly these
 * members, so the exhaustiveness check below is what makes a fifth role a
 * compile error rather than a blank page nobody notices.
 */
export default async function AcademyPage({
  params,
  searchParams,
}: {
  params: Promise<{ academySlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['academy']);

  let role = null;
  let hasLeaderboard = false;
  try {
    const account = await getAccount();
    const membership = account.user.memberships.find(
      (entry) =>
        entry.status === 'ACTIVE' && entry.academy.id === academyId,
    );
    // The role they are *working as*, which for anybody holding one role is
    // simply that role. A Manager who also teaches gets the teaching overview
    // while the switcher says 교사 — the four overviews below are each about
    // one job, and showing a manager the control tower when they came here to
    // teach is the case this resolves.
    role = membership
      ? resolveViewRole({
          academyId,
          held: membership.roles,
          primary: membership.role,
          cookie: (await cookies()).get(viewRoleCookieName)?.value,
        }).role
      : null;
    const features = new Set(membership?.features ?? []);
    hasLeaderboard =
      features.has('STUDENT_POINTS') &&
      features.has('STUDENT_CLASS_LEADERBOARD');
  } catch {
    // Leave an unreadable session to the shell, which redirects to login.
  }
  if (role === 'STUDENT') {
    return (
      <StudioPage
        bleed
        // The overview owns its own heading: it greets the student by name and
        // carries the period control, and the shell's static title above it
        // repeated the sentence the first panel already says.
        showPageHeading={false}
        title={t('learning_overview_title')}
      >
        <StudentAcademyOverview
          academyId={academyId}
          hasLeaderboard={hasLeaderboard}
          searchParams={await searchParams}
        />
      </StudioPage>
    );
  }

  if (role === 'TEACHER') {
    return (
      <StudioPage
        bleed
        description={t('teaching_overview_description')}
        title={t('teaching_overview_title')}
      >
        <TeacherAcademyOverview
          academyId={academyId}
          hasLeaderboard={hasLeaderboard}
          searchParams={await searchParams}
        />
      </StudioPage>
    );
  }

  if (role === 'MANAGER') {
    return (
      <StudioPage
        bleed
        description={t('control_tower_description')}
        title={t('control_tower_title')}
      >
        <ManagerAcademyOverview
          academyId={academyId}
          hasLeaderboard={hasLeaderboard}
          searchParams={await searchParams}
        />
      </StudioPage>
    );
  }

  if (role === 'TEAM_LEAD') {
    return (
      <StudioPage
        bleed
        // The overview owns its own heading: it names the academy and carries
        // the "as of" stamp, and the shell's static title above it repeated
        // the sentence the first panel already says.
        showPageHeading={false}
        title={t('curriculum_overview_title')}
      >
        <LeadAcademyOverview
          academyId={academyId}
          hasLeaderboard={hasLeaderboard}
          searchParams={await searchParams}
        />
      </StudioPage>
    );
  }

  // Every academy role is answered above, so this is reached only when the
  // session holds no active membership for this academy — a state the shell
  // itself usually redirects, and which says so plainly if it has not.
  assertEveryRoleHandled(role);
  return (
    <StudioPage title={t('title')}>
      <p className="text-sm text-danger">{t('no_access')}</p>
    </StudioPage>
  );
}

/**
 * Every `AcademyRole` is branched above, so this parameter is `null`.
 *
 * A fifth role added to `academyRoles` without a branch here stops being a
 * silently blank academy root and becomes a type error, which is the only
 * place that mistake is cheap to catch.
 */
function assertEveryRoleHandled(role: null): void {
  void role;
}
