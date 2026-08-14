import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { sessionNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { StudentPresenceProvider } from '@/lib/monitoring/student-presence';
import { createServerORPCClient } from '@/lib/orpc-server';
import { createClient } from '@/lib/supabase/server';
import { InactivityGuard } from '@/lib/session/inactivity-guard';
import { ResumePrompt } from '@/lib/session/resume-prompt';

/**
 * Holds the student's presence and their inactivity deadline for as long as
 * they are inside this academy.
 *
 * A layout rather than something inside `StudioShell`: the shell is composed
 * per page, so it would unmount on every navigation and take the socket with
 * it — a student clicking between their courses would flicker through
 * Reconnecting on the teacher's roster. This persists across every page under
 * the academy, which is the lifetime both of these actually have.
 *
 * The inactivity guard sits here for the same reason and one more: §9.1 measures
 * the student, not the route, so a timer that remounted on every navigation
 * would reset itself for the wrong reason and never fire.
 *
 * Both are students-only. A teacher's presence signals would be dropped by the
 * gateway anyway, and §5.2 keeps staff session policy separate from this one.
 */
export default async function AcademyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;

  let isStudent = false;
  try {
    // Capture the request's token before constructing the RPC link. Resolving
    // it lazily inside a parallel layout/page render can lose the request
    // context and would fail open by omitting the student session guard.
    const { data } = await (await createClient()).auth.getSession();
    if (!data.session) throw new Error('No authenticated studio session');
    const account = await createServerORPCClient(
      data.session.access_token,
    ).auth.me({});
    isStudent = account.user.memberships.some(
      (membership) =>
        membership.academy.id === academyId &&
        membership.status === 'ACTIVE' &&
        membership.role === 'STUDENT',
    );
  } catch {
    // Presence is not what this page is for. A failed lookup costs the student
    // their row on a roster; it must not cost them their coursework.
    isStudent = false;
  }

  if (!isStudent) return children;

  const locale = await getLocale();
  const { resources } = await initTranslations(locale, sessionNamespaces);

  return (
    <StudentPresenceProvider academyId={academyId}>
      <PageTranslationsProvider
        locale={locale}
        namespaces={sessionNamespaces}
        resources={resources}
      >
        <InactivityGuard />
        <ResumePrompt />
      </PageTranslationsProvider>
      {children}
    </StudentPresenceProvider>
  );
}
