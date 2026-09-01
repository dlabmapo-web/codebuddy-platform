import type { AcademyRole } from '@cove/shared';
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
import { getAccount } from '@/lib/orpc-server';
import { SupportBanner } from '@/components/studio/support-banner';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { supportNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { activeSupportGrant, inspectAcademyRoute } from '@/lib/academy-route';
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
  let role = null;
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
  // A member writes as their role. A session writes if it took write access.
  // An operator on the standing read writes nothing — `!support?.readOnly` was
  // true for them, because there is no session to be read-only, which put
  // Applications and Classes back in a nav that could not open either.
  const writable = selectedMembershipFound
    ? true
    : support
      ? !support.readOnly
      : false;
  // Here without a membership and without a session: the standing read.
  const visiting = !selectedMembershipFound && !support;

  const sidebarState = (await cookies()).get('cove_sidebar_state')?.value;

  return (
    <SidebarProvider defaultOpen={sidebarState !== 'false'}>
      <StudioSidebar
        academies={academies}
        academyId={academyId}
        canLearn={canLearn(role)}
        /*
         * A read-only support session narrows the nav to what it can open.
         * Without this the sidebar offered a visiting operator Applications
         * and Classes, whose landing pages need write permissions the grant
         * withholds — so the badge fetch answered 403 and the links led to a
         * refusal. Membership access is unaffected: `writable` is true for
         * everyone who is actually a member.
         */
        canManageAcademy={canManageAcademy(role) && writable}
        canManageClasses={canManageClasses(role) && writable}
        canManageContent={canReviewContent(role)}
        canReviewApplications={canReviewApplications(role) && writable}
        canMonitor={canMonitorClasses(role) && (support?.allowMonitoring ?? true)}
        hasPoints={hasPoints}
        isStudent={isStudent(role)}
      />
      <SidebarInset>
        {/* Above the sticky header and inside the content column: as a sibling
            of the shell it rendered behind a full-height fixed layout, which
            is the one place a warning must never be. */}
        {support || visiting ? (
          <SupportGrantNotice academyName={academyName} grant={support} />
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
          <HeaderControls account={viewer ?? undefined} className="ml-auto" />
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
async function SupportGrantNotice({
  academyName,
  grant,
}: {
  academyName: string;
  grant: Awaited<ReturnType<typeof activeSupportGrant>>;
}) {
  const locale = await getLocale();
  const { resources } = await initTranslations(locale, supportNamespaces);
  return (
    <PageTranslationsProvider
      locale={locale}
      namespaces={supportNamespaces}
      resources={resources}
    >
      <SupportBanner academyName={academyName} grant={grant} />
    </PageTranslationsProvider>
  );
}
