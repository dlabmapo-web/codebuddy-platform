import type { AcademyRole, PlatformViewRole } from '@cove/shared';
import { isPlatformViewRole } from '@cove/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { HeaderControls } from '@/components/studio/header-controls';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/studio/sidebar';
import {
  canLearn,
  canManageAcademy,
  canManageClasses,
  canMonitorClasses,
  canReviewApplications,
  canReviewContent,
  isStudent,
} from '@/lib/academy-access-state';
import { SupportBanner } from '@/components/studio/support-banner';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { supportNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { activeSupportGrant, inspectAcademyRoute } from '@/lib/academy-route';
import { heldRoles, resolveViewRole, viewRoleCookieName } from '@/lib/academy-view-role';
import { createServerORPCClient, getAccount } from '@/lib/orpc-server';
import { StudioSidebar, type StudioAcademy } from './studio-sidebar';

/**
 * The frame every academy page is read inside: the sidebar, the sticky bar,
 * and the account controls.
 *
 * A layout rather than something each page renders. Next does not re-render a
 * shared layout on navigations beneath it, so the sidebar and the header stay
 * on screen — and stay interactive — while the next page loads. That is what
 * makes a page-level `loading.tsx` worth having: it replaces only the content
 * column, instead of blanking the whole viewport including the nav the reader
 * just clicked. It also means the sidebar keeps its scroll position, its open
 * groups, and the focus ring, none of which survived being rebuilt per page.
 *
 * The second reason is cost. This awaits the account, and as a page-level
 * component it did so on every navigation, in addition to the two other reads
 * the route already made. Here it happens once per entry, through the
 * memoised `getAccount`.
 *
 * See docs/superpowers/specs/2026-08-28-loading-states-and-navigation-feedback-design.md §6.1.
 */
export async function StudioChrome({
  academyId,
  academySlug,
  routeRole,
  children,
}: {
  academyId: string;
  academySlug: string;
  /**
   * The role the route resolved, from a membership or a support grant.
   *
   * Passed in rather than re-read here: an operator inside an academy on a
   * grant has no membership to look up, and a sidebar built from memberships
   * offered them nothing but the overview — on a page the API was perfectly
   * willing to serve.
   */
  routeRole: AcademyRole;
  children: React.ReactNode;
}) {
  let academies: StudioAcademy[] = [];
  let academyName = '';
  let selectedMembershipFound = false;
  let role: AcademyRole | null = null;
  let held: readonly AcademyRole[] = [];
  let primaryRole: AcademyRole | null = null;
  let hasPoints = false;
  let viewer: {
    academyImageUrl: string | null;
    imageUrl: string | null;
    avatarUrl: string | null;
    name: string | null;
  } | null = null;
  try {
    const account = await getAccount();
    const active = account.user.memberships.filter(
      (membership) => membership.status === 'ACTIVE',
    );
    academies = active.map((membership) => ({
      id: membership.academy.id,
      name: membership.academy.name,
      slug: membership.academy.slug,
      role: membership.role,
    }));
    const selectedMembership = active.find(
      (membership) => membership.academy.id === academyId,
    );
    selectedMembershipFound = Boolean(selectedMembership);
    academyName = selectedMembership?.academy.name ?? '';
    role = selectedMembership?.role ?? routeRole;
    held = heldRoles(account, academyId);
    primaryRole = selectedMembership?.role ?? null;
    if (!selectedMembership) {
      // Visiting on a grant. The switcher still lists the operator's own
      // academies — none, usually — and this one is added so the header names
      // where they are rather than showing an empty selector.
      academies = [
        ...academies,
        { id: academyId, name: academyName, slug: academySlug, role: routeRole },
      ];
    }
    hasPoints = (selectedMembership?.features ?? []).includes('STUDENT_POINTS');
    // Feeds the header's way into My Page. The name is only for the initials
    // fallback, so the global one is right even inside an academy.
    viewer = {
      academyImageUrl: selectedMembership?.imageUrl ?? null,
      imageUrl: account.user.imageUrl,
      avatarUrl: account.user.avatarUrl,
      name: account.user.displayName ?? account.user.username,
    };
  } catch {
    redirect('/login');
  }

  // Memoised per request: the route guard already asked, so this is a map
  // lookup rather than a second round trip.
  const support = await activeSupportGrant(academySlug);
  if (!selectedMembershipFound) {
    // Feature flags belong to the *academy*, not to a membership — an operator
    // has none, so reading them from one left every flagged surface hidden.
    // Class ranking was the visible casualty: a Team Lead view with the Team
    // Lead's own board missing.
    hasPoints = await academyPointsEnabled(academyId);
    // No membership: the name has to come from the operator's own seam, since
    // `auth.me` only knows the academies this account belongs to. Memoised per
    // request, and the route guard has already asked, so this is a map lookup.
    academyName =
      support?.academyName ??
      (await inspectAcademyRoute(academySlug))?.academyName ??
      academySlug;
  }

  // True for every member, and for a support session that took write access.
  // False for an operator reading on their standing permission, who has no
  // session at all.
  // A member acts as their role. A session is bounded by the access it took.
  // A platform operator standing in a role holds that role's own set — several
  // manager surfaces gate a read behind a write-named permission, so anything
  // narrower produced a Manager sidebar with most of the Manager missing.
  const writable = support ? !support.readOnly : true;
  // Here without a membership and without a session: the standing read.
  const visiting = !selectedMembershipFound && !support;

  const cookieStore = await cookies();
  const sidebarState = cookieStore.get('cove_sidebar_state')?.value;

  /*
   * Which of this member's roles the shell is built for.
   *
   * The union decides what they may do; this decides what they are shown. A
   * member with one role — almost everybody — resolves to it and sees no
   * switcher at all, so nothing about this is visible until somebody genuinely
   * holds two.
   *
   * Note the sidebar gates below take `shown` and not `held`. Leaving every
   * role's navigation on screen would make the switcher change the overview
   * and nothing else, which is not a switcher. The API is unaffected either
   * way: it authorizes against the full set and has never read this.
   */
  const viewRole = primaryRole
    ? resolveViewRole({
        academyId,
        held,
        primary: primaryRole,
        cookie: cookieStore.get(viewRoleCookieName)?.value,
      }).role
    : null;
  /*
   * A visiting operator holds no membership, so there is no view role to
   * resolve and `held` is empty. What they are standing in is the role the
   * route resolved — a support grant's assumed role, or the platform view — so
   * the shell is built from that instead. Building it from an empty set would
   * hand them a sidebar with nothing in it, which is the fault `routeRole`
   * exists to prevent.
   */
  const shown: readonly AcademyRole[] = viewRole
    ? [viewRole]
    : role
      ? [role]
      : [];
  return (
    <SidebarProvider defaultOpen={sidebarState !== 'false'}>
      <StudioSidebar
        academies={academies}
        viewRole={viewRole}
        academyId={academyId}
        canLearn={canLearn(shown)}
        /*
         * A read-only support session narrows the nav to what it can open.
         * Without this the sidebar offered a visiting operator Applications
         * and Classes, whose landing pages need write permissions the grant
         * withholds — so the badge fetch answered 403 and the links led to a
         * refusal. Membership access is unaffected: `writable` is true for
         * everyone who is actually a member.
         */
        canManageAcademy={canManageAcademy(shown) && writable}
        canManageClasses={canManageClasses(shown) && writable}
        canManageContent={canReviewContent(shown)}
        canReviewApplications={canReviewApplications(shown) && writable}
        /*
         * This gates the *classes* link, not the live watch. A platform
         * operator standing as Teacher covers the academy's classes, so the
         * link belongs there; the watch itself is refused deeper down by
         * `MonitoringAccessService`, which needs a real membership.
         */
        canMonitor={
          canMonitorClasses(shown) && (support ? support.allowMonitoring : true)
        }
        hasPoints={hasPoints}
        isStudent={isStudent(shown)}
      />
      <SidebarInset>
        {/* Above the sticky header and inside the content column: as a sibling
            of the shell it rendered behind a full-height fixed layout, which
            is the one place a warning must never be. */}
        {support || visiting ? (
          <SupportGrantNotice
            academyName={academyName}
            grant={support}
            viewRole={isPlatformViewRole(role) ? role : 'MANAGER'}
          />
        ) : null}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-canvas/85 px-4 backdrop-blur-sm">
          <SidebarTrigger className="-ml-1" />
          {/*
           * The academy, not the page. The bar used to carry the page title
           * and the heading directly beneath it carried the same words, which
           * said nothing twice. Naming the academy here answers the question
           * the bar is actually in a position to answer — which of your
           * academies am I looking at — and it is something the layout knows,
           * so no page has to hand it up.
           */}
          <span className="truncate text-[14px] font-semibold text-sub">
            {academyName}
          </span>
          {/* Theme and language sit at the far right of every studio page, in
              the one place a reader already looks for account-level controls. */}
          {/* The role switcher rides in this menu rather than beside the
              academy name: which role you are working as is a fact about the
              reader, and the bar is about the academy. */}
          <HeaderControls
            account={
              viewer
                ? {
                    ...viewer,
                    academyId,
                    academySlug: academySlug || undefined,
                    role: viewRole,
                    roles: held,
                  }
                : undefined
            }
            className="ml-auto"
          />
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * The banner, with its own copy loaded for it.
 *
 * Its own provider rather than an addition to the shell's namespaces: that list
 * is mounted for every student on every academy page, and a student's payload
 * must not carry the vocabulary of Cove staff being inside their academy. This
 * renders only while a grant is live.
 */
/**
 * Whether this academy runs the point economy.
 *
 * Read from the academy rather than from a membership, for a viewer who has
 * none. Gated on `academy.read`, which every role a platform operator may
 * stand in holds, and answers false on any failure — a nav link that leads to
 * an empty board is worse than one that is absent.
 */
async function academyPointsEnabled(academyId: string): Promise<boolean> {
  try {
    const { features } = await createServerORPCClient().academyFeatures.list({
      academyId,
    });
    return features.some(
      (feature) => feature.feature === 'STUDENT_POINTS' && feature.isEnabled,
    );
  } catch {
    return false;
  }
}

async function SupportGrantNotice({
  academyName,
  grant,
  viewRole,
}: {
  academyName: string;
  grant: Awaited<ReturnType<typeof activeSupportGrant>>;
  viewRole: PlatformViewRole;
}) {
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, supportNamespaces);
  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={supportNamespaces}
      resources={resources}
    >
      <SupportBanner
        academyName={academyName}
        grant={grant}
        viewRole={viewRole}
      />
    </PageTranslationsProvider>
  );
}
