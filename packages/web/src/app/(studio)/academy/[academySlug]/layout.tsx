import { requireAcademyRoute } from '@/lib/academy-route';
import { AcademyRouteProvider } from '@/components/studio/academy-route-provider';
import { ContentBasePathProvider } from '@/components/studio/content-base-path-provider';
import { PageTranslationsProvider } from '@/i18n';
import { initTranslations } from '@/i18n/init-translations';
import { sessionNamespaces } from '@/i18n/namespaces';
import { getLocale } from '@/i18n/server/get-locale';
import { StudentPresenceProvider } from '@/lib/monitoring/student-presence';
import { getAccount } from '@/lib/orpc-server';
import { InactivityGuard } from '@/lib/session/inactivity-guard';
import { ResumePrompt } from '@/lib/session/resume-prompt';

/**
 * Everything that lasts longer than one page inside an academy, and that both
 * halves of it need.
 *
 * The studio frame is deliberately not here: it belongs to `(framed)`, because
 * the exercise workspace and live monitoring take the whole viewport and have
 * no chrome. What is left is what is true of every academy route regardless —
 * the slug, the student's presence, and their inactivity deadline.
 *
 * The student's presence socket sits here for the reason it always has: the
 * shell used to be composed per page, so it unmounted on every navigation and
 * took the socket with it — a student clicking between their courses flickered
 * through Reconnecting on the teacher's roster.
 *
 * The inactivity guard sits here for the same reason and one more: §9.1
 * measures the student, not the route, so a timer that remounted on every
 * navigation would reset itself for the wrong reason and never fire.
 *
 * Both are students-only. A teacher's presence signals would be dropped by the
 * gateway anyway, and §5.2 keeps staff session policy separate from this one.
 */
export default async function AcademyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ academySlug: string }>;
}) {
  const { academySlug } = await params;
  const { academyId } = await requireAcademyRoute(academySlug);

  // Presence is about *this* academy: a roster shows the students of one
  // academy, so somebody is present here only if they are a student here.
  let isStudentHere = false;
  // The inactivity lease is not. It is keyed on the Supabase session — one
  // session, one lease, whatever academies the person belongs to — so the
  // countdown that renews it has to run wherever they are. A student who is
  // also a teaching assistant in a second academy used to have their lease
  // quietly expire while they worked in that one, and then find their own
  // coursework refusing to load.
  let isStudentAnywhere = false;
  try {
    // `getAccount` captures the request's token before building the RPC link.
    // Resolving it lazily inside a parallel layout/page render can lose the
    // request context, which would fail open by omitting this guard.
    const account = await getAccount();
    const studentSeats = account.user.memberships.filter(
      (membership) =>
        membership.status === 'ACTIVE' && membership.role === 'STUDENT',
    );
    isStudentAnywhere = studentSeats.length > 0;
    isStudentHere = studentSeats.some(
      (membership) => membership.academy.id === academyId,
    );
  } catch {
    // Presence is not what this page is for. A failed lookup costs the student
    // their row on a roster; it must not cost them their coursework.
    isStudentHere = false;
    isStudentAnywhere = false;
  }

  // Whether the person reading this is here on a support grant rather than a
  // membership. Answered for everyone, because the one case that must never
  // happen is an operator working inside an academy with no banner — and a
  // member simply gets `null`, which costs one cheap indexed read.
  const scoped = (
    <AcademyRouteProvider academySlug={academySlug}>
      <ContentBasePathProvider academySlug={academySlug} surface="academy">
        {children}
      </ContentBasePathProvider>
    </AcademyRouteProvider>
  );

  if (!isStudentAnywhere) return scoped;

  const locale = await getLocale();
  const { resources } = await initTranslations(locale, sessionNamespaces);

  const counted = (
    <>
      <PageTranslationsProvider
        locale={locale}
        namespaces={sessionNamespaces}
        resources={resources}
      >
        <InactivityGuard />
        <ResumePrompt />
      </PageTranslationsProvider>
      {scoped}
    </>
  );

  if (!isStudentHere) return counted;

  return (
    <StudentPresenceProvider academyId={academyId}>
      {counted}
    </StudentPresenceProvider>
  );
}
