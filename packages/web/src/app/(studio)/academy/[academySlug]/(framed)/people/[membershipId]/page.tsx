import { isStudentRoleSet, type AcademyRole } from '@cove/shared';

import { requireAcademyRoute } from '@/lib/academy-route';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { profileNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { BackLink } from '@/components/studio/back-link';
import { StudioPage } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page';
import { backTo } from '@/lib/back-to';
import {
  canManageAcademy,
  canManageStudentCredentials,
} from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';
import { MemberProfileEditor } from './_components/member-profile-editor';
import { MemberRolesPanel } from './_components/member-roles-panel';
import { StudentPasswordPanel } from './_components/student-password-panel';

/**
 * A manager's route into one member's academy profile.
 *
 * Academy-scoped in the path as well as in the API, so a membership ID from
 * another academy has nowhere to be typed. Whether the caller may actually
 * open it is decided by `academyProfile.getForManager` and nowhere else — this
 * page renders a denial as readily as it renders a form.
 */
/**
 * Every role this membership holds, read on the server.
 *
 * One read answers both panels below: which roles the manager may edit, and
 * whether the member is a student and therefore has a password Cove issued.
 * An empty list means the read failed or the caller may not make it, and both
 * panels stay off — the API refuses either way, so this only saves a manager a
 * screen that could not have worked.
 */
async function memberRoles(
  academyId: string,
  membershipId: string,
): Promise<readonly AcademyRole[]> {
  try {
    const { members } = await createServerORPCClient().academyMembers.list({
      academyId,
    });
    return members.find((row) => row.id === membershipId)?.roles ?? [];
  } catch {
    return [];
  }
}

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ academySlug: string; membershipId: string }>;
}) {
  const { academySlug, membershipId } = await params;
  const { academyId, roles } = await requireAcademyRoute(academySlug);
  const { t } = await getServerTranslation(['profile']);
  // The back link names its destination with the sidebar's own word for it.
  const { t: tNav } = await getServerTranslation(['nav']);
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, profileNamespaces);
  const targetRoles = await memberRoles(academyId, membershipId);
  const showRoles = canManageAcademy(roles) && targetRoles.length > 0;
  const showPasswords =
    canManageStudentCredentials(roles) && isStudentRoleSet(targetRoles);

  return (
    <StudioPage
      back={
        <BackLink
          href={backTo.academyPerson(academySlug)}
          label={tNav('link.members')}
        />
      }
      showPageHeading={false}
      bleed
      title={t('manager.title')}
    >
      <PageTranslationsProvider
        locale={locale}
        namespaces={profileNamespaces}
        resources={resources}
      >
        <div className="mx-auto w-full max-w-3xl">
          <MemberProfileEditor
            academyId={academyId}
            membershipId={membershipId}
          />
          {/*
           * Deliberately a sibling of the profile editor rather than a section
           * inside it. That component states at the top that it holds no
           * account and no password, and it is right to: this has its own
           * permission, its own endpoints, and its own audit trail, and
           * folding it in would make one save touch two very different things.
           */}
          {showRoles ? (
            <div className="mt-6">
              <MemberRolesPanel
                academyId={academyId}
                initialRoles={targetRoles}
                membershipId={membershipId}
              />
            </div>
          ) : null}
          {showPasswords ? (
            <div className="mt-6">
              <StudentPasswordPanel
                academyId={academyId}
                membershipId={membershipId}
              />
            </div>
          ) : null}
        </div>
      </PageTranslationsProvider>
    </StudioPage>
  );
}
